import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { Attendance, AttendanceStatus, attendanceId } from '../models/attendance.model';
import { ClassSession } from '../models/session.model';
import { AuditService } from './audit.service';
import { combineLists } from './firestore.utils';

@Injectable({ providedIn: 'root' })
export class AttendanceService {
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);
  private readonly auth = inject(AuthService);
  private readonly audit = inject(AuditService);

  private run<T>(fn: () => T): T {
    return runInInjectionContext(this.injector, fn);
  }

  private list(...filters: [string, string][]): Observable<Attendance[]> {
    return this.run(() =>
      collectionData(
        query(
          collection(this.firestore, 'attendances'),
          ...filters.map(([field, value]) => where(field, '==', value)),
        ),
        { idField: 'id' },
      ),
    ) as Observable<Attendance[]>;
  }

  getAll(): Observable<Attendance[]> {
    return this.run(() =>
      collectionData(collection(this.firestore, 'attendances'), { idField: 'id' }),
    ) as Observable<Attendance[]>;
  }

  /** En tiempo real. Incluye courseId para que las reglas de docente puedan evaluarse. */
  getBySession(session: Pick<ClassSession, 'id' | 'courseId'>): Observable<Attendance[]> {
    return this.list(['sessionId', session.id], ['courseId', session.courseId]);
  }

  getByCourse(courseId: string): Observable<Attendance[]> {
    return this.list(['courseId', courseId]);
  }

  getByCourses(courseIds: readonly string[]): Observable<Attendance[]> {
    return combineLists(courseIds.map((id) => this.getByCourse(id)));
  }

  getByStudent(studentId: string): Observable<Attendance[]> {
    return this.list(['studentId', studentId]);
  }

  /** Corrección autorizada con motivo obligatorio y auditoría en el mismo batch. */
  async correct(
    session: ClassSession,
    studentId: string,
    status: AttendanceStatus,
    reason: string,
    existing: Attendance | undefined,
  ): Promise<void> {
    const id = attendanceId(session.id, studentId);
    const batch = this.run(() => writeBatch(this.firestore));
    batch.set(
      this.run(() => doc(this.firestore, 'attendances', id)),
      {
        sessionId: session.id,
        courseId: session.courseId,
        studentId,
        status,
        source: existing?.source ?? 'MANUAL',
        registeredAt: existing?.registeredAt ?? serverTimestamp(),
        updatedBy: this.auth.currentUser()?.uid ?? null,
        updateReason: reason,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    this.audit.addToBatch(batch, {
      action: 'ATTENDANCE_MANUALLY_UPDATED',
      entityType: 'ATTENDANCE',
      entityId: id,
      reason,
      details: { from: existing?.status ?? null, to: status, sessionId: session.id, studentId },
    });
    await batch.commit();
  }
}
