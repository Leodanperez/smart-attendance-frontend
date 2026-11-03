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
import {
  Course,
  CourseInput,
  CourseStatus,
  generateCourseCode,
  normalizeCourse,
} from '../models/course.model';
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

  /** Crea el curso con código generado INICIALES-AÑO-NNNN (único). Devuelve id y código. */
  async create(input: CourseInput): Promise<{ id: string; courseCode: string }> {
    const courseCode = await this.generateUniqueCode(input.name);

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
      details: { courseCode, careerId: input.careerId, semester: input.semester, teacherIds: input.teacherIds },
    });
    await batch.commit();
    return { id: ref.id, courseCode };
  }

  /** El código del curso no cambia al editar (lo usan inscripciones y reportes). */
  async update(course: Course, input: CourseInput): Promise<void> {
    const courseCode = course.courseCode;

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
      details: {
        courseCode,
        careerId: input.careerId,
        semester: input.semester,
        teacherIds: input.teacherIds,
        status: input.status,
      },
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

  async assignTeacher(course: Course, teacherId: string, teacherName = ''): Promise<void> {
    await this.changeTeacher(course, teacherId, true, null, teacherName);
  }

  async removeTeacher(course: Course, teacherId: string, reason: string | null): Promise<void> {
    await this.changeTeacher(course, teacherId, false, reason, '');
  }

  private async changeTeacher(
    course: Course,
    teacherId: string,
    assign: boolean,
    reason: string | null,
    teacherName: string,
  ): Promise<void> {
    // teacherName se denormaliza para que la app móvil muestre el docente sin leer users/{uid}
    // (privacidad: un estudiante no puede leer perfiles de docentes).
    const nextIds = assign
      ? [...new Set([...course.teacherIds, teacherId])]
      : course.teacherIds.filter((id) => id !== teacherId);
    const batch = this.run(() => writeBatch(this.firestore));
    batch.update(this.run(() => doc(this.firestore, 'courses', course.id)), {
      teacherIds: assign ? arrayUnion(teacherId) : arrayRemove(teacherId),
      // Nombre del primer docente restante (vacío si ya no quedan).
      teacherName: assign ? (teacherName || course.teacherName || '') : (nextIds.length ? course.teacherName : ''),
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
      careerId: input.careerId,
      careerName: input.careerName?.trim() || null,
      semester: input.semester,
      academicPeriodId: input.academicPeriodId,
      academicPeriodName: input.academicPeriodName,
      section: input.section.trim().toUpperCase(),
      room: input.room?.trim() ?? '',
      teacherIds: [...new Set(input.teacherIds)],
      teacherName: input.teacherName?.trim() ?? '',
      status: input.status,
      schedule: (input.schedule ?? []).map((b) => ({
        day: b.day,
        start: b.start,
        end: b.end,
      })),
    };
  }

  /** Genera INICIALES-AÑO-NNNN y reintenta si ya existe (9000 combinaciones por iniciales/año). */
  private async generateUniqueCode(name: string): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = generateCourseCode(name);
      const snapshot = await this.run(() =>
        getDocs(query(this.coursesRef, where('courseCode', '==', code), limit(1))),
      );
      if (snapshot.empty) return code;
    }
    throw { code: 'app/course-code-in-use' };
  }
}
