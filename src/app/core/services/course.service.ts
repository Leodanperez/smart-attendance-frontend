import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  arrayRemove,
  arrayUnion,
  collection,
  collectionData,
  doc,
  docData,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { Observable, catchError, combineLatest, map, of } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { Course, CourseInput, CourseStatus, normalizeCourse } from '../models/course.model';
import { AuditService } from './audit.service';

const byName = (a: Course, b: Course) =>
  `${a.name} ${a.section}`.localeCompare(`${b.name} ${b.section}`, 'es');

@Injectable({ providedIn: 'root' })
export class CourseService {
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);
  private readonly auth = inject(AuthService);
  private readonly audit = inject(AuditService);

  private run<T>(fn: () => T): T {
    return runInInjectionContext(this.injector, fn);
  }

  private get coursesRef() {
    return this.run(() => collection(this.firestore, 'courses'));
  }

  getAll(): Observable<Course[]> {
    return this.run(() => collectionData(this.coursesRef, { idField: 'id' })).pipe(
      map((list) => list.map((d) => normalizeCourse(d, d['id'] as string)).sort(byName)),
    );
  }

  /** Cursos asignados a un docente. */
  getForTeacher(teacherId: string): Observable<Course[]> {
    return this.run(() =>
      collectionData(query(this.coursesRef, where('teacherIds', 'array-contains', teacherId)), {
        idField: 'id',
      }),
    ).pipe(map((list) => list.map((d) => normalizeCourse(d, d['id'] as string)).sort(byName)));
  }

  getById(id: string): Observable<Course | null> {
    return this.run(() => docData(doc(this.firestore, 'courses', id))).pipe(
      map((data) => (data ? normalizeCourse(data, id) : null)),
    );
  }

  /** Lecturas individuales (compatibles con reglas de estudiante). */
  getByIds(ids: readonly string[]): Observable<Course[]> {
    if (!ids.length) return of([]);
    return combineLatest(ids.map((id) => this.getById(id).pipe(catchError(() => of(null))))).pipe(
      map((list) => list.filter((c): c is Course => !!c).sort(byName)),
    );
  }

  async create(input: CourseInput): Promise<string> {
    const courseCode = input.courseCode.trim().toUpperCase();
    await this.ensureCodeFree(courseCode);

    const ref = this.run(() => doc(this.coursesRef));
    const batch = this.run(() => writeBatch(this.firestore));
    batch.set(ref, {
      ...this.clean(input),
      courseCode,
      createdBy: this.auth.currentUser()?.uid ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    this.audit.addToBatch(batch, {
      action: 'COURSE_CREATED',
      entityType: 'COURSE',
      entityId: ref.id,
      details: { courseCode, teacherIds: input.teacherIds },
    });
    await batch.commit();
    return ref.id;
  }

  async update(course: Course, input: CourseInput): Promise<void> {
    const courseCode = input.courseCode.trim().toUpperCase();
    if (courseCode !== course.courseCode) await this.ensureCodeFree(courseCode, course.id);

    const batch = this.run(() => writeBatch(this.firestore));
    batch.update(this.run(() => doc(this.firestore, 'courses', course.id)), {
      ...this.clean(input),
      courseCode,
      updatedAt: serverTimestamp(),
    });
    this.audit.addToBatch(batch, {
      action: 'COURSE_UPDATED',
      entityType: 'COURSE',
      entityId: course.id,
      details: { courseCode, teacherIds: input.teacherIds, status: input.status },
    });
    await batch.commit();
  }

  async setStatus(course: Course, status: CourseStatus, reason: string | null): Promise<void> {
    const batch = this.run(() => writeBatch(this.firestore));
    batch.update(this.run(() => doc(this.firestore, 'courses', course.id)), {
      status,
      updatedAt: serverTimestamp(),
    });
    this.audit.addToBatch(batch, {
      action: 'COURSE_STATUS_CHANGED',
      entityType: 'COURSE',
      entityId: course.id,
      reason,
      details: { from: course.status, to: status },
    });
    await batch.commit();
  }

  async assignTeacher(course: Course, teacherId: string): Promise<void> {
    await this.changeTeacher(course, teacherId, true, null);
  }

  async removeTeacher(course: Course, teacherId: string, reason: string | null): Promise<void> {
    await this.changeTeacher(course, teacherId, false, reason);
  }

  private async changeTeacher(
    course: Course,
    teacherId: string,
    assign: boolean,
    reason: string | null,
  ): Promise<void> {
    const batch = this.run(() => writeBatch(this.firestore));
    batch.update(this.run(() => doc(this.firestore, 'courses', course.id)), {
      teacherIds: assign ? arrayUnion(teacherId) : arrayRemove(teacherId),
      updatedAt: serverTimestamp(),
    });
    this.audit.addToBatch(batch, {
      action: assign ? 'TEACHER_ASSIGNED' : 'TEACHER_REMOVED',
      entityType: 'COURSE',
      entityId: course.id,
      reason,
      details: { teacherId },
    });
    await batch.commit();
  }

  private clean(input: CourseInput) {
    return {
      name: input.name.trim(),
      description: input.description.trim(),
      section: input.section.trim().toUpperCase(),
      teacherIds: [...new Set(input.teacherIds)],
      status: input.status,
    };
  }

  private async ensureCodeFree(courseCode: string, exceptId?: string): Promise<void> {
    const snapshot = await this.run(() =>
      getDocs(query(this.coursesRef, where('courseCode', '==', courseCode), limit(2))),
    );
    if (snapshot.docs.some((d) => d.id !== exceptId)) throw { code: 'app/course-code-in-use' };
  }
}
