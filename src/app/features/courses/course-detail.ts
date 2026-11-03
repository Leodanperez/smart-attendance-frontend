import { DatePipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { ATTENDANCE_RULE_TEXT, ATTENDANCE_STATUS_BADGE, ATTENDANCE_STATUS_LABELS } from '../../core/models/attendance.model';
import { semesterLabel } from '../../core/models/career.model';
import { COURSE_STATUS_BADGE, COURSE_STATUS_LABELS, Course, WEEK_DAY_LABELS } from '../../core/models/course.model';
import { SESSION_STATUS_BADGE, SESSION_STATUS_LABELS } from '../../core/models/session.model';
import { fullName } from '../../core/models/user.model';
import { AcademicScopeService } from '../../core/services/academic-scope.service';
import { CourseService } from '../../core/services/course.service';
import { ReportService, percentLabel } from '../../core/services/report.service';
import { SettingsService } from '../../core/services/settings.service';
import { StatCard } from '../../shared/components/stat-card';
import { TsDatePipe } from '../../shared/pipes/ts-date.pipe';

/** W09 — Detalle de curso. */
@Component({
  selector: 'app-course-detail',
  imports: [RouterLink, DatePipe, TsDatePipe, StatCard],
  template: `
    <a routerLink="/courses" class="text-sm text-primary hover:underline">← Volver a cursos</a>

    @if (course() === undefined) {
      <p class="mt-4 text-sm text-on-surface-variant">Cargando…</p>
    } @else if (course() === null) {
      <p class="alert-error mt-4">El curso no existe o no tienes acceso.</p>
    } @else {
      @let c = course()!;
      <div class="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="page-title">{{ c.name }}</h1>
          <p class="mt-1 flex flex-wrap items-center gap-2 text-sm text-on-surface-variant">
            <span class="font-mono">{{ c.courseCode }}</span>
            @if (c.academicPeriodName) {
              <span class="badge badge-gray">Periodo {{ c.academicPeriodName }}</span>
            }
            @if (c.careerName) {
              <span class="badge badge-blue">{{ c.careerName }}</span>
            }
            @if (c.semester) {
              <span>· {{ semesterLabel(c.semester) }}</span>
            }
            <span>· Sección {{ c.section || '—' }}</span>
            <span [class]="courseBadge[c.status]">{{ courseStatus[c.status] }}</span>
          </p>
          @if (c.description) {
            <p class="mt-2 max-w-2xl text-sm text-on-surface">{{ c.description }}</p>
          }
          <p class="mt-2 flex flex-wrap items-center gap-2 text-sm text-on-surface-variant">
            <span class="font-medium text-on-surface">Horario:</span>
            @for (b of c.schedule; track $index) {
              <span class="badge badge-gray">{{ weekDayLabels[b.day] }} {{ b.start }}–{{ b.end }}</span>
            } @empty {
              <span>Sin horario definido</span>
            }
          </p>
        </div>
        @if (canManage()) {
          <div class="flex flex-wrap gap-2">
            <a routerLink="/sessions" [queryParams]="{ courseId: c.id }" class="btn btn-primary">Crear sesión</a>
            <a routerLink="/reports" [queryParams]="{ courseId: c.id }" class="btn btn-secondary">Ver reporte</a>
            @if (isAdmin()) {
              <a [routerLink]="['/courses', c.id, 'edit']" class="btn btn-secondary">Editar</a>
            }
          </div>
        }
      </div>

      <section class="mt-6 grid gap-4 sm:grid-cols-3" aria-label="Indicadores">
        <app-stat-card label="Docente(s)" [value]="teacherNames() || 'Sin asignar'" />
        <app-stat-card [label]="isStudent() ? 'Mi asistencia' : 'Estudiantes inscritos'"
          [value]="isStudent() ? percent(report()?.students?.[0]?.percentage) : (report()?.students?.length ?? 0)" />
        <app-stat-card label="Asistencia general" [value]="percent(report()?.averagePercentage)"
          [hint]="(report()?.closedSessions ?? 0) + ' sesiones cerradas'" />
      </section>
      <p class="mt-2 text-xs text-on-surface-variant">{{ rule }}</p>

      <div class="mt-6 grid gap-4" [class.lg:grid-cols-2]="!isStudent()">
        @if (!isStudent()) {
          <section class="table-wrap" aria-labelledby="students-title">
            <h2 id="students-title" class="px-4 pt-4 font-medium text-on-surface">Estudiantes inscritos</h2>
            <table class="table mt-2">
              <thead>
                <tr>
                  <th scope="col">Código</th>
                  <th scope="col">Nombre</th>
                  <th scope="col">Asistencia</th>
                </tr>
              </thead>
              <tbody>
                @for (s of studentRows(); track s.studentId) {
                  <tr>
                    <td>{{ s.code || '—' }}</td>
                    <td class="font-medium text-on-surface">{{ s.name }}</td>
                    <td [class.text-status-danger]="s.low">{{ percent(s.percentage) }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="3" class="text-center text-on-surface-variant">Sin estudiantes inscritos.</td></tr>
                }
              </tbody>
            </table>
          </section>
        }

        <section class="table-wrap" aria-labelledby="sessions-title">
          <h2 id="sessions-title" class="px-4 pt-4 font-medium text-on-surface">Sesiones recientes</h2>
          <table class="table mt-2">
            <thead>
              <tr>
                <th scope="col">Sesión</th>
                <th scope="col">Inicio</th>
                <th scope="col">Estado</th>
                <th scope="col">{{ isStudent() ? 'Mi registro' : 'Asistencia' }}</th>
              </tr>
            </thead>
            <tbody>
              @for (s of recentSessions(); track s.session.id) {
                <tr>
                  <td class="font-medium text-on-surface">
                    @if (canManage()) {
                      <a [routerLink]="['/live-attendance']" [queryParams]="{ sessionId: s.session.id }" class="text-primary hover:underline">
                        {{ s.session.title }}
                      </a>
                    } @else {
                      {{ s.session.title }}
                    }
                  </td>
                  <td class="whitespace-nowrap">{{ s.session.startsAt | tsDate | date: 'dd/MM/yyyy HH:mm' }}</td>
                  <td><span [class]="sessionBadge[s.session.status]">{{ sessionStatus[s.session.status] }}</span></td>
                  <td>
                    @if (isStudent()) {
                      @let mine = myStatus(s.session.id);
                      @if (mine) {
                        <span [class]="attendanceBadge[mine]">{{ attendanceLabels[mine] }}</span>
                      } @else {
                        —
                      }
                    } @else {
                      {{ s.present + s.late }}/{{ s.enrolled }} ({{ percent(s.percentage) }})
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="text-center text-on-surface-variant">Sin sesiones.</td></tr>
              }
            </tbody>
          </table>
        </section>
      </div>
    }
  `,
})
export class CourseDetail {
  readonly id = input.required<string>();

  private readonly scope = inject(AcademicScopeService);
  private readonly reports = inject(ReportService);
  private readonly courseService = inject(CourseService);
  private readonly user = inject(AuthService).currentUser;

  protected readonly rule = ATTENDANCE_RULE_TEXT;
  protected readonly semesterLabel = semesterLabel;
  protected readonly weekDayLabels = WEEK_DAY_LABELS;
  protected readonly percent = percentLabel;
  protected readonly courseStatus = COURSE_STATUS_LABELS;
  protected readonly courseBadge = COURSE_STATUS_BADGE;
  protected readonly sessionStatus = SESSION_STATUS_LABELS;
  protected readonly sessionBadge = SESSION_STATUS_BADGE;
  protected readonly attendanceLabels = ATTENDANCE_STATUS_LABELS;
  protected readonly attendanceBadge = ATTENDANCE_STATUS_BADGE;

  protected readonly course = toSignal(
    toObservable(this.id).pipe(
      switchMap((id) => this.courseService.getById(id).pipe(catchError(() => of(null)))),
    ),
    { initialValue: undefined },
  );

  private readonly enrollments = toSignal(this.scope.enrollments$, { initialValue: [] });
  private readonly sessions = toSignal(this.scope.sessions$, { initialValue: [] });
  private readonly attendances = toSignal(this.scope.attendances$, { initialValue: [] });
  private readonly students = toSignal(this.scope.students$, { initialValue: [] });
  private readonly teachers = toSignal(this.scope.teachers$, { initialValue: [] });
  private readonly settings = inject(SettingsService).settings;

  protected readonly isAdmin = computed(() => this.user()?.role === 'ADMIN');
  protected readonly isStudent = computed(() => this.user()?.role === 'STUDENT');
  protected readonly canManage = computed(() => {
    const u = this.user();
    const c = this.course();
    return !!u && !!c && (u.role === 'ADMIN' || (u.role === 'TEACHER' && c.teacherIds.includes(u.uid)));
  });

  protected readonly report = computed(() => {
    const c = this.course();
    return c ? this.reports.buildCourseReport(c, this.enrollments(), this.sessions(), this.attendances()) : null;
  });

  protected readonly teacherNames = computed(() =>
    (this.course()?.teacherIds ?? [])
      .map((id) => this.teachers().find((t) => t.uid === id))
      .filter((t) => !!t)
      .map((t) => fullName(t))
      .join(', '),
  );

  protected readonly studentRows = computed(() => {
    const byId = new Map(this.students().map((s) => [s.uid, s]));
    return (this.report()?.students ?? [])
      .map((s) => {
        const profile = byId.get(s.studentId);
        return {
          ...s,
          name: profile ? fullName(profile) : s.studentId,
          code: profile?.institutionalCode ?? null,
          low: s.percentage != null && s.percentage < this.settings().lowAttendanceThreshold,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });

  protected readonly recentSessions = computed(() => (this.report()?.sessions ?? []).slice(0, 10));

  protected myStatus(sessionId: string) {
    const uid = this.user()?.uid;
    return this.attendances().find((a) => a.sessionId === sessionId && a.studentId === uid)?.status ?? null;
  }
}
