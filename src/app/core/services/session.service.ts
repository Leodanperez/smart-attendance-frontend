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
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable, map } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { ClassSession, CreateSessionInput, SessionQrToken } from '../models/session.model';
import { AuditService } from './audit.service';
import { combineLists, tsMillis } from './firestore.utils';

const byStartDesc = (a: ClassSession, b: ClassSession) => tsMillis(b.startsAt) - tsMillis(a.startsAt);

/** Nombre de la callable que genera el token del QR (ver flujo 9 del modelo). */
export const QR_TOKEN_FUNCTION = 'generateSessionToken';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly firestore = inject(Firestore);
  private readonly functions = inject(Functions);
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
  }

  /**
   * El token del QR lo genera el backend (Cloud Function): aleatorio, temporal y guardado como hash.
   * Angular nunca genera este token.
   */
  async requestQrToken(sessionId: string): Promise<SessionQrToken> {
    const callable = this.run(() =>
      httpsCallable<{ sessionId: string }, { token: string; expiresAt: number | string }>(
        this.functions,
        QR_TOKEN_FUNCTION,
      ),
    );
    const { data } = await callable({ sessionId });
    const expiresAt =
      typeof data.expiresAt === 'number' ? data.expiresAt : new Date(data.expiresAt).getTime();
    return { token: data.token, expiresAt };
  }
}
