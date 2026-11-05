import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import {
  ATTENDANCE_STATUS_BADGE,
  ATTENDANCE_STATUS_LABELS,
} from '../../core/models/attendance.model';
import { courseLabel } from '../../core/models/course.model';
import { AcademicScopeService } from '../../core/services/academic-scope.service';
import { tsMillis } from '../../core/services/firestore.utils';
import { ReportService, percentLabel } from '../../core/services/report.service';
import { Chart, ChartPoint } from '../../shared/components/chart';
import { TsDatePipe } from '../../shared/pipes/ts-date.pipe';
import { ATTENDANCE_STATUSES } from '../../core/models/attendance.model';

/** Vista de consulta para estudiantes (su experiencia principal es Android). */
@Component({
  selector: 'app-student-dashboard',
  imports: [RouterLink, Chart, DatePipe, TsDatePipe],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="page-title">Hola, {{ user()?.displayName }}</h1>
        <p class="page-subtitle">Consulta tus cursos e historial. El registro de asistencia se hace desde la app Android.</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <a routerLink="/my-schedule" class="btn btn-secondary">Mi horario</a>
        <a routerLink="/my-attendance" class="btn btn-secondary">Mi asistencia</a>
      </div>
    </div>

    @if (scope.error()) {
      <p role="alert" class="alert-error mt-4">{{ scope.error() }}</p>
    }

    <section class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Mis cursos">
      @for (r of reports(); track r.course.id) {
        <a [routerLink]="['/courses', r.course.id]" class="card block hover:ring-2 hover:ring-primary/20">
          <p class="font-medium text-on-surface">{{ label(r.course) }}</p>
          <p class="mt-2 text-3xl font-semibold text-on-surface">{{ percent(r.students[0]?.percentage) }}</p>
          <p class="text-xs text-on-surface-variant">de asistencia</p>
        </a>
      } @empty {
        <p class="text-sm text-on-surface-variant">Aún no estás inscrito en cursos.</p>
      }
    </section>

    <!-- Gráficos -->
    <section class="mt-6 grid gap-4 lg:grid-cols-2" aria-label="Gráficos">
      <app-chart kind="bar-horizontal" title="Mi asistencia por curso" [data]="byCourse()" [max]="100" unit="%" />
      <app-chart kind="donut" title="Desglose de mi historial" [data]="statusBreakdown()" />
    </section>

    <section class="card mt-6" aria-labelledby="history-title">
      <h2 id="history-title" class="font-medium text-on-surface">Historial reciente</h2>
      <ul class="mt-3 divide-y divide-outline-variant/50">
        @for (a of history(); track a.id) {
          <li class="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span>
              <span class="font-medium text-on-surface">{{ sessionTitle(a.sessionId) }}</span>
              <span class="block text-xs text-on-surface-variant">{{ courseName(a.courseId) }}</span>
            </span>
            <span class="flex items-center gap-2">
              <span [class]="badges[a.status]">{{ statusLabels[a.status] }}</span>
              <span class="text-xs text-on-surface-variant">{{ a.registeredAt | tsDate | date: 'dd/MM/yyyy HH:mm' }}</span>
            </span>
          </li>
        } @empty {
          <li class="py-2 text-sm text-on-surface-variant">Sin registros de asistencia.</li>
        }
      </ul>
    </section>
  `,
})
export class StudentDashboard {
  protected readonly scope = inject(AcademicScopeService);
  private readonly reportService = inject(ReportService);
  protected readonly user = inject(AuthService).currentUser;

  private readonly courses = toSignal(this.scope.courses$, { initialValue: [] });
  private readonly enrollments = toSignal(this.scope.enrollments$, { initialValue: [] });
  private readonly sessions = toSignal(this.scope.sessions$, { initialValue: [] });
  private readonly attendances = toSignal(this.scope.attendances$, { initialValue: [] });

  protected readonly label = courseLabel;
  protected readonly percent = percentLabel;
  protected readonly statusLabels = ATTENDANCE_STATUS_LABELS;
  protected readonly badges = ATTENDANCE_STATUS_BADGE;

  protected readonly reports = computed(() =>
    this.reportService.buildReports(this.courses(), this.enrollments(), this.sessions(), this.attendances()),
  );

  protected readonly history = computed(() =>
    [...this.attendances()].sort((a, b) => tsMillis(b.registeredAt) - tsMillis(a.registeredAt)).slice(0, 15),
  );

  /** Porcentaje de asistencia por curso (barras). */
  protected readonly byCourse = computed<ChartPoint[]>(() =>
    this.reports()
      .map((r) => ({
        label: courseLabel(r.course),
        value: Math.round((r.students[0]?.percentage ?? 0) * 10) / 10,
      }))
      .sort((a, b) => b.value - a.value),
  );

  /** Desglose de todos mis registros por estado (dona). */
  protected readonly statusBreakdown = computed<ChartPoint[]>(() => {
    const counts = new Map<string, number>();
    for (const a of this.attendances()) counts.set(a.status, (counts.get(a.status) ?? 0) + 1);
    return ATTENDANCE_STATUSES.filter((s) => counts.get(s))
      .map((s) => ({ label: this.statusLabels[s], value: counts.get(s) ?? 0 }));
  });

  protected sessionTitle(id: string): string {
    return this.sessions().find((s) => s.id === id)?.title ?? 'Sesión';
  }

  protected courseName(id: string): string {
    return courseLabel(this.courses().find((c) => c.id === id));
  }
}
