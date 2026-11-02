import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { courseLabel } from '../../core/models/course.model';
import { AcademicScopeService } from '../../core/services/academic-scope.service';
import { tsToDate, uniq } from '../../core/services/firestore.utils';
import { ReportService, percentLabel } from '../../core/services/report.service';
import { StatCard } from '../../shared/components/stat-card';
import { TsDatePipe } from '../../shared/pipes/ts-date.pipe';

/** W08 — Dashboard docente. */
@Component({
  selector: 'app-teacher-dashboard',
  imports: [StatCard, RouterLink, DatePipe, TsDatePipe],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="page-title">Hola, {{ user()?.displayName }}</h1>
        <p class="page-subtitle">Tus cursos y sesiones.</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <a routerLink="/sessions" class="btn btn-primary">Crear sesión</a>
        <a routerLink="/reports" class="btn btn-secondary">Consultar reportes</a>
      </div>
    </div>

    @if (scope.error()) {
      <p role="alert" class="alert-error mt-4">{{ scope.error() }}</p>
    }

    <section class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Indicadores">
      @for (stat of stats(); track stat.label) {
        <app-stat-card [label]="stat.label" [value]="stat.value" />
      }
    </section>

    <div class="mt-6 grid gap-4 lg:grid-cols-2">
      <section class="card" aria-labelledby="active-title">
        <h2 id="active-title" class="font-medium text-gray-900">Sesiones activas</h2>
        <ul class="mt-3 divide-y divide-gray-100">
          @for (s of activeSessions(); track s.id) {
            <li class="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>
                <span class="font-medium text-gray-900">{{ s.title }}</span>
                <span class="block text-xs text-gray-500">
                  {{ courseName(s.courseId) }} · {{ s.startsAt | tsDate | date: 'dd/MM HH:mm' }}
                </span>
              </span>
              <a [routerLink]="['/live-attendance']" [queryParams]="{ sessionId: s.id }" class="btn btn-primary btn-sm">
                Ver asistencia en vivo
              </a>
            </li>
          } @empty {
            <li class="py-2 text-sm text-gray-500">No hay sesiones activas.</li>
          }
        </ul>
      </section>

      <section class="card" aria-labelledby="courses-title">
        <h2 id="courses-title" class="font-medium text-gray-900">Mis cursos</h2>
        <ul class="mt-3 divide-y divide-gray-100">
          @for (r of reports(); track r.course.id) {
            <li class="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>
                <span class="font-medium text-gray-900">{{ label(r.course) }}</span>
                <span class="block text-xs text-gray-500">
                  {{ r.students.length }} estudiantes · asistencia {{ percent(r.averagePercentage) }}
                </span>
              </span>
              <span class="flex gap-2">
                <a [routerLink]="['/courses', r.course.id]" class="btn btn-secondary btn-sm">Abrir curso</a>
                <a [routerLink]="['/sessions']" [queryParams]="{ courseId: r.course.id }" class="btn btn-secondary btn-sm">
                  Crear sesión
                </a>
              </span>
            </li>
          } @empty {
            <li class="py-2 text-sm text-gray-500">No tienes cursos asignados.</li>
          }
        </ul>
      </section>
    </div>
  `,
})
export class TeacherDashboard {
  protected readonly scope = inject(AcademicScopeService);
  private readonly reportService = inject(ReportService);
  protected readonly user = inject(AuthService).currentUser;

  private readonly courses = toSignal(this.scope.courses$, { initialValue: [] });
  private readonly enrollments = toSignal(this.scope.enrollments$, { initialValue: [] });
  private readonly sessions = toSignal(this.scope.sessions$, { initialValue: [] });
  private readonly attendances = toSignal(this.scope.attendances$, { initialValue: [] });

  protected readonly label = courseLabel;
  protected readonly percent = percentLabel;

  protected readonly reports = computed(() =>
    this.reportService.buildReports(
      this.courses().filter((c) => c.status === 'ACTIVE'),
      this.enrollments(),
      this.sessions(),
      this.attendances(),
    ),
  );

  protected readonly activeSessions = computed(() =>
    this.sessions().filter((s) => s.status === 'ACTIVE'),
  );

  protected readonly stats = computed(() => {
    const today = new Date().toDateString();
    const todayCount = this.attendances().filter(
      (a) =>
        (a.status === 'PRESENT' || a.status === 'LATE') &&
        tsToDate(a.registeredAt)?.toDateString() === today,
    ).length;
    const students = uniq(
      this.enrollments().filter((e) => e.status === 'ACTIVE').map((e) => e.studentId),
    ).length;
    return [
      { label: 'Mis cursos', value: this.reports().length },
      { label: 'Estudiantes inscritos', value: students },
      { label: 'Sesiones activas', value: this.activeSessions().length },
      { label: 'Asistencias de hoy', value: todayCount },
      { label: 'Promedio de asistencia', value: percentLabel(this.reportService.overall(this.reports())) },
    ];
  });

  protected courseName(courseId: string): string {
    return courseLabel(this.courses().find((c) => c.id === courseId));
  }
}
