import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  Timestamp,
  collection,
  collectionData,
  doc,
  docData,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { addDoc, getDocs, limit } from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { ClassSession, CreateSessionInput, SessionQrToken } from '../models/session.model';
import { AuditService } from './audit.service';
import { randomCode, sha256Hex } from './crypto.utils';
import { combineLists, tsMillis } from './firestore.utils';

const byStartDesc = (a: ClassSession, b: ClassSession) => tsMillis(b.startsAt) - tsMillis(a.startsAt);

/** Vigencia por defecto del token del QR. */
const DEFAULT_QR_SECONDS = 60;

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);
  private readonly auth = inject(AuthService);
  private readonly audit = inject(AuditService);

  private run<T>(fn: () => T): T {
    return runInInjectionContext(this.injector, fn);
  }

  getAll(): Observable<ClassSession[]> {
    return (
      this.run(() =>
        collectionData(collection(this.firestore, 'sessions'), { idField: 'id' }),
      ) as Observable<ClassSession[]>
    ).pipe(map((list) => list.sort(byStartDesc)));
  }

  getByCourse(courseId: string): Observable<ClassSession[]> {
    return (
      this.run(() =>
        collectionData(
          query(collection(this.firestore, 'sessions'), where('courseId', '==', courseId)),
          { idField: 'id' },
        ),
      ) as Observable<ClassSession[]>
    ).pipe(map((list) => list.sort(byStartDesc)));
  }

  getByCourses(courseIds: readonly string[]): Observable<ClassSession[]> {
    return combineLists(courseIds.map((id) => this.getByCourse(id))).pipe(
      map((list) => list.sort(byStartDesc)),
    );
  }

  getById(id: string): Observable<ClassSession | null> {
    return this.run(() => docData(doc(this.firestore, 'sessions', id), { idField: 'id' })).pipe(
      map((data) => (data as ClassSession | undefined) ?? null),
    );
  }

  async create(input: CreateSessionInput): Promise<string> {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) throw { code: 'functions/unauthenticated' };

    const start = input.startsAt.getTime();
    const ref = this.run(() => doc(collection(this.firestore, 'sessions')));
    const batch = this.run(() => writeBatch(this.firestore));
    batch.set(ref, {
      courseId: input.courseId,
      title: input.title.trim(),
      teacherId: uid,
      status: 'ACTIVE',
      startsAt: Timestamp.fromMillis(start),
      expiresAt: Timestamp.fromMillis(start + input.durationMinutes * 60_000),
      lateAfter:
        input.lateAfterMinutes != null
          ? Timestamp.fromMillis(start + input.lateAfterMinutes * 60_000)
          : null,
      createdAt: serverTimestamp(),
      closedAt: null,
    });
    this.audit.addToBatch(batch, {
      action: 'SESSION_CREATED',
      entityType: 'SESSION',
      entityId: ref.id,
      details: { courseId: input.courseId, durationMinutes: input.durationMinutes },
    });
    await batch.commit();
    return ref.id;
  }

  async close(session: ClassSession): Promise<void> {
    const batch = this.run(() => writeBatch(this.firestore));
    batch.update(this.run(() => doc(this.firestore, 'sessions', session.id)), {
      status: 'CLOSED',
      closedAt: serverTimestamp(),
    });
    this.audit.addToBatch(batch, {
      action: 'SESSION_CLOSED',
      entityType: 'SESSION',
      entityId: session.id,
      details: { courseId: session.courseId },
    });
    await batch.commit();
    // Al cerrar, invalida los tokens de QR que siguieran activos.
    await this.revokeActiveTokens(session.id);
  }

  /**
   * Cierra la sesión y marca ABSENT (falta) a los estudiantes inscritos que no registraron.
   * Modo demo sin Cloud Functions: lo ejecuta el docente desde el panel. Cada falta se crea con
   * motivo ("Cierre de sesión") para cumplir las reglas de corrección (updatedBy/updateReason).
   * @param absentStudentIds ids de inscritos ACTIVE sin registro de asistencia.
   */
  async closeAndMarkAbsent(session: ClassSession, absentStudentIds: readonly string[]): Promise<void> {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) throw { code: 'functions/unauthenticated' };

    const batch = this.run(() => writeBatch(this.firestore));
    // 1) Cerrar la sesión.
    batch.update(this.run(() => doc(this.firestore, 'sessions', session.id)), {
      status: 'CLOSED',
      closedAt: serverTimestamp(),
    });
    this.audit.addToBatch(batch, {
      action: 'SESSION_CLOSED',
      entityType: 'SESSION',
      entityId: session.id,
      details: { courseId: session.courseId, markedAbsent: absentStudentIds.length },
    });
    // 2) Marcar falta a cada inscrito sin registro.
    for (const studentId of absentStudentIds) {
      const id = `${session.id}_${studentId}`;
      batch.set(this.run(() => doc(this.firestore, 'attendances', id)), {
        sessionId: session.id,
        courseId: session.courseId,
        studentId,
        status: 'ABSENT',
        source: 'MANUAL',
        registeredAt: serverTimestamp(),
        updatedBy: uid,
        updateReason: 'Cierre de sesión: sin registro de asistencia.',
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    await this.revokeActiveTokens(session.id);
  }

  /**
   * Genera un token temporal para el QR y guarda solo su hash en sessionTokens.
   * Sin Cloud Functions (modo demo, plan gratuito): lo crea el panel del docente.
   * El token en claro se devuelve una vez para dibujar el QR; nunca se guarda.
   */
  async requestQrToken(sessionId: string, courseId: string, qrSeconds = DEFAULT_QR_SECONDS): Promise<SessionQrToken> {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) throw { code: 'functions/unauthenticated' };
    // Al rotar, revoca los tokens activos previos (higiene: no dejar tokens ACTIVE vencidos).
    await this.revokeActiveTokens(sessionId);
    const token = randomCode(10);
    const tokenHash = await sha256Hex(token);
    const expiresAt = Date.now() + qrSeconds * 1000;
    await this.run(() =>
      addDoc(collection(this.firestore, 'sessionTokens'), {
        sessionId,
        courseId,
        tokenHash,
        status: 'ACTIVE',
        expiresAt: Timestamp.fromMillis(expiresAt),
        createdBy: uid,
        createdAt: serverTimestamp(),
      }),
    );
    return { token, expiresAt };
  }

  /** Revoca (status REVOKED) los tokens ACTIVE de una sesión. Las reglas solo permiten este cambio. */
  async revokeActiveTokens(sessionId: string): Promise<void> {
    const snap = await this.run(() =>
      getDocs(
        query(
          collection(this.firestore, 'sessionTokens'),
          where('sessionId', '==', sessionId),
          where('status', '==', 'ACTIVE'),
        ),
      ),
    );
    if (snap.empty) return;
    const batch = this.run(() => writeBatch(this.firestore));
    snap.forEach((d) => batch.update(d.ref, { status: 'REVOKED' }));
    await batch.commit();
  }

  /**
   * Lo que se codifica en el QR (contrato compartido con la app Android).
   * JSON: { v: 1, sessionId, courseId, token }. La app lo parsea y escribe la asistencia.
   */
  buildQrPayload(sessionId: string, courseId: string, token: string): string {
    return JSON.stringify({ v: 1, sessionId, courseId, token });
  }

  /** Comprueba si existe un token ACTIVE y vigente para la sesión (diagnóstico opcional). */
  async hasActiveToken(sessionId: string): Promise<boolean> {
    const snap = await this.run(() =>
      getDocs(
        query(
          collection(this.firestore, 'sessionTokens'),
          where('sessionId', '==', sessionId),
          where('status', '==', 'ACTIVE'),
          limit(1),
        ),
      ),
    );
    return !snap.empty;
  }
}
