import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  Timestamp,
  collection,
  collectionData,
  doc,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { Enrollment, EnrollmentCode, enrollmentId } from '../models/enrollment.model';
import { AuditService } from './audit.service';
import { randomCode, sha256Hex } from './crypto.utils';
import { combineLists, tsMillis } from './firestore.utils';

@Injectable({ providedIn: 'root' })
export class EnrollmentService {
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);
  private readonly auth = inject(AuthService);
  private readonly audit = inject(AuditService);

  private run<T>(fn: () => T): T {
    return runInInjectionContext(this.injector, fn);
  }

  private list<T>(name: string, ...filters: [string, string][]): Observable<T[]> {
    return this.run(() =>
      collectionData(
        query(collection(this.firestore, name), ...filters.map(([field, value]) => where(field, '==', value))),
        { idField: 'id' },
      ),
    ) as Observable<T[]>;
  }

  getAll(): Observable<Enrollment[]> {
    return this.run(() =>
      collectionData(collection(this.firestore, 'enrollments'), { idField: 'id' }),
    ) as Observable<Enrollment[]>;
  }

  getByCourse(courseId: string): Observable<Enrollment[]> {
    return this.list<Enrollment>('enrollments', ['courseId', courseId]);
  }

  /** Una consulta por curso: compatible con las reglas de docente. */
  getByCourses(courseIds: readonly string[]): Observable<Enrollment[]> {
    return combineLists(courseIds.map((id) => this.getByCourse(id)));
  }

  getByStudent(studentId: string): Observable<Enrollment[]> {
    return this.list<Enrollment>('enrollments', ['studentId', studentId]);
  }

  /** Inscripción manual por ADMIN (ID determinístico courseId_studentId evita duplicados). */
  async enroll(courseId: string, studentId: string): Promise<void> {
    const id = enrollmentId(courseId, studentId);
    const batch = this.run(() => writeBatch(this.firestore));
    batch.set(this.run(() => doc(this.firestore, 'enrollments', id)), {
      courseId,
      studentId,
      status: 'ACTIVE',
      enrolledAt: serverTimestamp(),
      enrolledBy: this.auth.currentUser()?.uid ?? null,
    });
    this.audit.addToBatch(batch, {
      action: 'ENROLLMENT_CREATED',
      entityType: 'ENROLLMENT',
      entityId: id,
      details: { courseId, studentId },
    });
    await batch.commit();
  }

  async drop(enrollment: Enrollment, reason: string): Promise<void> {
    const batch = this.run(() => writeBatch(this.firestore));
    batch.update(this.run(() => doc(this.firestore, 'enrollments', enrollment.id)), {
      status: 'DROPPED',
    });
    this.audit.addToBatch(batch, {
      action: 'ENROLLMENT_DROPPED',
      entityType: 'ENROLLMENT',
      entityId: enrollment.id,
      reason,
      details: { courseId: enrollment.courseId, studentId: enrollment.studentId },
    });
    await batch.commit();
  }

  getCodes(courseId: string): Observable<EnrollmentCode[]> {
    return this.list<EnrollmentCode>('enrollmentCodes', ['courseId', courseId]).pipe(
      map((codes) => codes.sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt))),
    );
  }

  /**
   * Genera un código aleatorio seguro. Solo se guarda su hash SHA-256;
   * el código en texto plano se devuelve una única vez para mostrarlo.
   * El canje lo hace el propio estudiante desde la app (modo demo, sin Cloud Functions):
   * busca el código por su hash, crea su inscripción (source=CODE) e incrementa 'uses'.
   * Las reglas de Firestore validan vigencia, cupo y pertenencia al curso.
   */
  async generateCode(courseId: string, validDays: number, maxUses: number): Promise<string> {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) throw { code: 'functions/unauthenticated' };
    const code = randomCode(8);
    const codeHash = await sha256Hex(code);
    const expiresAt = Timestamp.fromMillis(Date.now() + validDays * 24 * 60 * 60 * 1000);

    const ref = this.run(() => doc(collection(this.firestore, 'enrollmentCodes')));
    const batch = this.run(() => writeBatch(this.firestore));
    batch.set(ref, {
      courseId,
      codeHash,
      status: 'ACTIVE',
      expiresAt,
      maxUses,
      uses: 0,
      createdBy: uid,
      createdAt: serverTimestamp(),
    });
    this.audit.addToBatch(batch, {
      action: 'ENROLLMENT_CODE_CREATED',
      entityType: 'ENROLLMENT_CODE',
      entityId: ref.id,
      details: { courseId, maxUses, validDays },
    });
    await batch.commit();
    return code;
  }

  async disableCode(code: EnrollmentCode): Promise<void> {
    const batch = this.run(() => writeBatch(this.firestore));
    batch.update(this.run(() => doc(this.firestore, 'enrollmentCodes', code.id)), {
      status: 'DISABLED',
    });
    this.audit.addToBatch(batch, {
      action: 'ENROLLMENT_CODE_DISABLED',
      entityType: 'ENROLLMENT_CODE',
      entityId: code.id,
      details: { courseId: code.courseId },
    });
    await batch.commit();
  }
}
