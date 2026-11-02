import { Injectable, inject, signal } from '@angular/core';
import {
  Observable,
  catchError,
  combineLatest,
  distinctUntilChanged,
  map,
  of,
  shareReplay,
  switchMap,
} from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { Attendance } from '../models/attendance.model';
import { Course } from '../models/course.model';
import { Enrollment } from '../models/enrollment.model';
import { ClassSession } from '../models/session.model';
import { AppUser, UserProfile } from '../models/user.model';
import { AttendanceService } from './attendance.service';
import { CourseService } from './course.service';
import { EnrollmentService } from './enrollment.service';
import { errorMessage } from './error-message';
import { sameIds, sortedIds } from './firestore.utils';
import { SessionService } from './session.service';
import { UserService } from './user.service';

const share = <T>() => shareReplay<T>({ bufferSize: 1, refCount: true });

/**
 * Datos académicos visibles para el usuario en sesión, según su rol:
 * - ADMIN: todo.
 * - TEACHER: solo cursos asignados y sus datos.
 * - STUDENT: solo sus inscripciones, cursos y asistencias.
 * Las consultas están diseñadas para que las reglas de Firestore puedan evaluarlas.
 */
@Injectable({ providedIn: 'root' })
export class AcademicScopeService {
  private readonly auth = inject(AuthService);
  private readonly courseService = inject(CourseService);
  private readonly enrollmentService = inject(EnrollmentService);
  private readonly sessionService = inject(SessionService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly userService = inject(UserService);

  /** Último error de carga (p. ej. permisos o índices). */
  readonly error = signal<string | null>(null);

  private safe<T>(source: Observable<T[]>): Observable<T[]> {
    return source.pipe(
      catchError((error) => {
        console.error('[AcademicScope]', error);
        this.error.set(errorMessage(error));
        return of([] as T[]);
      }),
    );
  }

  private readonly user$ = this.auth.scopeUser$;

  /** Inscripciones propias del estudiante (para resolver sus cursos). */
  private readonly ownEnrollments$ = this.user$.pipe(
    switchMap((u) =>
      u?.role === 'STUDENT' ? this.safe(this.enrollmentService.getByStudent(u.uid)) : of([]),
    ),
    share<Enrollment[]>(),
  );

  readonly courses$: Observable<Course[]> = this.user$.pipe(
    switchMap((u) => this.coursesFor(u)),
    share<Course[]>(),
  );

  readonly courseIds$: Observable<string[]> = this.courses$.pipe(
    map((courses) => sortedIds(courses.map((c) => c.id))),
    distinctUntilChanged(sameIds),
    share<string[]>(),
  );

  readonly enrollments$: Observable<Enrollment[]> = this.byRole(
    () => this.enrollmentService.getAll(),
    (ids) => this.enrollmentService.getByCourses(ids),
    () => this.ownEnrollments$,
  );

  readonly sessions$: Observable<ClassSession[]> = this.byRole(
    () => this.sessionService.getAll(),
    (ids) => this.sessionService.getByCourses(ids),
    (ids) => this.sessionService.getByCourses(ids),
  );

  readonly attendances$: Observable<Attendance[]> = this.byRole(
    () => this.attendanceService.getAll(),
    (ids) => this.attendanceService.getByCourses(ids),
    (_ids, uid) => this.attendanceService.getByStudent(uid),
  );

  /** Estudiantes visibles: ADMIN todos; TEACHER los inscritos en sus cursos. */
  readonly students$: Observable<UserProfile[]> = this.user$.pipe(
    switchMap((u) => {
      if (u?.role === 'ADMIN') return this.safe(this.userService.getByRole('STUDENT'));
      if (u?.role === 'TEACHER') {
        return this.enrollments$.pipe(
          map((list) => sortedIds(list.filter((e) => e.status === 'ACTIVE').map((e) => e.studentId))),
          distinctUntilChanged(sameIds),
          switchMap((ids) => this.userService.getByIds(ids)),
        );
      }
      return of([]);
    }),
    share<UserProfile[]>(),
  );

  /** Docentes visibles: ADMIN todos; otros roles los de sus cursos. */
  readonly teachers$: Observable<UserProfile[]> = this.user$.pipe(
    switchMap((u) => {
      if (!u) return of([]);
      if (u.role === 'ADMIN') return this.safe(this.userService.getByRole('TEACHER'));
      return this.courses$.pipe(
        map((courses) => sortedIds(courses.flatMap((c) => c.teacherIds))),
        distinctUntilChanged(sameIds),
        switchMap((ids) => this.userService.getByIds(ids)),
      );
    }),
    share<UserProfile[]>(),
  );

  private coursesFor(user: AppUser | null): Observable<Course[]> {
    if (!user) return of([]);
    if (user.role === 'ADMIN') return this.safe(this.courseService.getAll());
    if (user.role === 'TEACHER') return this.safe(this.courseService.getForTeacher(user.uid));
    return this.ownEnrollments$.pipe(
      map((list) => sortedIds(list.filter((e) => e.status === 'ACTIVE').map((e) => e.courseId))),
      distinctUntilChanged(sameIds),
      switchMap((ids) => this.courseService.getByIds(ids)),
    );
  }

  private byRole<T>(
    admin: () => Observable<T[]>,
    teacher: (courseIds: string[]) => Observable<T[]>,
    student: (courseIds: string[], uid: string) => Observable<T[]>,
  ): Observable<T[]> {
    return combineLatest([this.user$, this.courseIds$]).pipe(
      switchMap(([u, ids]) => {
        if (!u) return of([]);
        if (u.role === 'ADMIN') return this.safe(admin());
        if (u.role === 'TEACHER') return this.safe(teacher(ids));
        return this.safe(student(ids, u.uid));
      }),
      share<T[]>(),
    );
  }
}
