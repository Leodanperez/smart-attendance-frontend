import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { BookOpen, CalendarClock, ChartColumn, GraduationCap, UserCog } from 'lucide-angular';
import { catchError, of } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { AUDIT_ACTION_LABELS, AuditLog } from '../../core/models/audit.model';
import { UserProfile } from '../../core/models/user.model';
import { AcademicScopeService } from '../../core/services/academic-scope.service';
import { AuditService } from '../../core/services/audit.service';
import { tsMillis, tsToDate, uniq } from '../../core/services/firestore.utils';
import { DateRange, ReportService, percentLabel } from '../../core/services/report.service';
import { UserService } from '../../core/services/user.service';
import { Chart, ChartPoint } from '../../shared/components/chart';
import { StatCard } from '../../shared/components/stat-card';
import { TsDatePipe } from '../../shared/pipes/ts-date.pipe';
import { PeriodFilter } from '../../shared/utils/period-filter';

const monthFormat = new Intl.DateTimeFormat('es-PE', { month: 'short', year: 'numeric' });
const dayFormat = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short' });

/** W02 — Dashboard administrador. */
@Component({
  selector: 'app-admin-dashboard',
  imports: [StatCard, Chart, RouterLink, DatePipe, TsDatePipe],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="page-title">Hola, {{ user()?.displayName }}</h1>
        <p class="page-subtitle">Resumen general de la institución.</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <a routerLink="/users/new" class="btn btn-primary">Registrar usuario</a>
        <a routerLink="/courses/new" class="btn btn-secondary">Nuevo curso</a>
      </div>
    </div>

    @if (scope.error()) {
      <p role="alert" class="alert-error mt-4">{{ scope.error() }}</p>
    }

    <!-- Filtros -->
    <section class="card mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" aria-label="Filtros">
      <div>
        <label for="f-period" class="label">Periodo académico</label>
        <select id="f-period" class="input" #pe [value]="periodFilter.periodId()" (change)="periodFilter.periodId.set(pe.value); courseId.set('')">
          <option value="">Todos</option>
          @for (p of periodFilter.periods(); track p.id) {
            <option [value]="p.id">{{ p.name }}{{ p.status === 'ACTIVE' ? ' (en curso)' : '' }}</option>
          }
        </select>
      </div>
      <div>
        <label for="f-career" class="label">Carrera</label>
        <select id="f-career" class="input" #ca (change)="careerId.set(ca.value); courseId.set('')">
          <option value="">Todas</option>
          @for (career of careers(); track career.id) {
            <option [value]="career.id">{{ career.name }}</option>
          }
        </select>
      </div>
      <div>
        <label for="f-course" class="label">Curso</label>
        <select id="f-course" class="input" #c [value]="courseId()" (change)="courseId.set(c.value)">
          <option value="">Todos</option>
          @for (course of careerCourses(); track course.id) {
            <option [value]="course.id">{{ course.courseCode }} · {{ course.name }}</option>
          }
        </select>
      </div>
      <div>
        <label for="f-section" class="label">Sección</label>
        <select id="f-section" class="input" #s (change)="section.set(s.value)">
          <option value="">Todas</option>
          @for (sec of sections(); track sec) {
            <option [value]="sec">{{ sec }}</option>
          }
        </select>
      </div>
      <div>
        <label for="f-from" class="label">Desde</label>
        <input id="f-from" type="date" class="input" #f (change)="from.set(f.value)" />
      </div>
      <div>
        <label for="f-to" class="label">Hasta</label>
        <input id="f-to" type="date" class="input" #t (change)="to.set(t.value)" />
      </div>
    </section>

    <!-- Indicadores -->
    <section class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Indicadores">
      @for (stat of stats(); track stat.label) {
        <app-stat-card [label]="stat.label" [value]="stat.value" [hint]="stat.hint" [icon]="stat.icon" />
      }
    </section>

    <!-- Gráficos -->
    <section class="mt-6 grid gap-4 lg:grid-cols-2" aria-label="Gráficos">
      <app-chart kind="area" title="Asistencia por periodo" [data]="byPeriod()" [max]="100" unit="%" />
      <app-chart kind="line" title="Evolución de registros (por día)" [data]="evolution()" />
      <app-chart kind="bar-horizontal" title="Asistencia por curso" [data]="byCourse()" [max]="100" unit="%" [height]="340" />
      <app-chart kind="radialBar" title="Asistencia promedio" [data]="overallGauge()" unit="%" [height]="340" />
    </section>

    <!-- Actividad reciente -->
    <section class="card mt-6" aria-labelledby="recent-title">
      <div class="flex items-center justify-between">
        <h2 id="recent-title" class="font-medium text-on-surface">Actividad reciente</h2>
        <a routerLink="/audit" class="text-sm text-primary hover:underline">Ver auditoría</a>
      </div>
      <ul class="mt-3 divide-y divide-outline-variant/50">
        @for (log of recent(); track log.id) {
          <li class="flex flex-wrap justify-between gap-2 py-2 text-sm">
            <span>
              <span class="font-medium text-on-surface">{{ log.actorName || log.actorId }}</span>
              — {{ actionLabels[log.action] || log.action }}
            </span>
            <span class="text-on-surface-variant">{{ log.createdAt | tsDate | date: 'dd/MM/yyyy HH:mm' }}</span>
          </li>
        } @empty {
          <li class="py-2 text-sm text-on-surface-variant">Sin actividad registrada.</li>
        }
      </ul>
    </section>
  `,
})
export class AdminDashboard {
  protected readonly scope = inject(AcademicScopeService);
  private readonly reports = inject(ReportService);

  protected readonly user = inject(AuthService).currentUser;
  protected readonly actionLabels = AUDIT_ACTION_LABELS;

  private readonly users = toSignal(
    inject(UserService).getAll().pipe(catchError(() => of([] as UserProfile[]))),
    { initialValue: [] as UserProfile[] },
  );
  protected readonly courses = toSignal(this.scope.courses$, { initialValue: [] });
  private readonly enrollments = toSignal(this.scope.enrollments$, { initialValue: [] });
  private readonly sessions = toSignal(this.scope.sessions$, { initialValue: [] });
  private readonly attendances = toSignal(this.scope.attendances$, { initialValue: [] });
  protected readonly recent = toSignal(
    inject(AuditService).getRecent(8).pipe(catchError(() => of([] as AuditLog[]))),
    { initialValue: [] as AuditLog[] },
  );

  protected readonly careerId = signal('');
  protected readonly courseId = signal('');
  protected readonly section = signal('');

  /** Carreras con cursos (usa el nombre copiado en cada curso). */
  protected readonly careers = computed(() => {
    const map = new Map<string, string>();
    for (const c of this.courses()) if (c.careerId) map.set(c.careerId, c.careerName ?? c.careerId);
    return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });
  protected readonly periodFilter = new PeriodFilter();
  protected readonly careerCourses = computed(() =>
    this.courses().filter(
      (c) => this.periodFilter.matches(c) && (!this.careerId() || c.careerId === this.careerId()),
    ),
  );
  protected readonly from = signal('');
  protected readonly to = signal('');

  protected readonly sections = computed(() =>
    uniq(this.courses().map((c) => c.section).filter(Boolean)).sort(),
  );

  private readonly range = computed<DateRange>(() => ({
    from: this.from() ? new Date(`${this.from()}T00:00:00`) : null,
    to: this.to() ? new Date(`${this.to()}T23:59:59.999`) : null,
  }));

  private readonly filteredCourses = computed(() =>
    this.courses().filter(
      (c) =>
        this.periodFilter.matches(c) &&
        (!this.careerId() || c.careerId === this.careerId()) &&
        (!this.courseId() || c.id === this.courseId()) &&
        (!this.section() || c.section === this.section()),
    ),
  );

  private readonly courseReports = computed(() =>
    this.reports.buildReports(
      this.filteredCourses(),
      this.enrollments(),
      this.sessions(),
      this.attendances(),
      this.range(),
    ),
  );

  protected readonly stats = computed(() => {
    const users = this.users();
    const reports = this.courseReports();
    const active = (role: string) => users.filter((u) => u.role === role && u.status === 'ACTIVE').length;
    return [
      { label: 'Estudiantes activos', value: active('STUDENT'), hint: undefined, icon: GraduationCap },
      { label: 'Docentes activos', value: active('TEACHER'), hint: undefined, icon: UserCog },
      {
        label: 'Cursos activos',
        icon: BookOpen,
        value: this.filteredCourses().filter((c) => c.status === 'ACTIVE').length,
        hint: undefined,
      },
      {
        label: 'Sesiones realizadas',
        icon: CalendarClock,
        value: reports.reduce((sum, r) => sum + r.closedSessions, 0),
        hint: 'Sesiones cerradas',
      },
      {
        label: 'Asistencia promedio',
        icon: ChartColumn,
        value: percentLabel(this.reports.overall(reports)),
        hint: 'Presentes + tardanzas',
      },
    ];
  });

  protected readonly byCourse = computed<ChartPoint[]>(() =>
    this.courseReports()
      .filter((r) => r.averagePercentage != null)
      .map((r) => ({
        label: `${r.course.courseCode} · ${r.course.name}`,
        value: Math.round((r.averagePercentage ?? 0) * 10) / 10,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10),
  );

  /** Asistencia promedio global para el medidor radial. */
  protected readonly overallGauge = computed<ChartPoint[]>(() => {
    const overall = this.reports.overall(this.courseReports());
    if (overall == null) return [];
    return [{ label: 'Asistencia', value: Math.round(overall * 10) / 10 }];
  });

  protected readonly byPeriod = computed<ChartPoint[]>(() => {
    const months = new Map<string, { date: Date; attended: number; total: number }>();
    for (const report of this.courseReports()) {
      for (const s of report.sessions) {
        if (s.session.status !== 'CLOSED') continue;
        const date = tsToDate(s.session.startsAt);
        if (!date) continue;
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const entry = months.get(key) ?? { date, attended: 0, total: 0 };
        entry.attended += s.present + s.late;
        entry.total += s.enrolled - s.justified - s.pending;
        months.set(key, entry);
      }
    }
    return [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([, m]) => {
        const value = m.total > 0 ? Math.round((m.attended / m.total) * 1000) / 10 : 0;
        return { label: monthFormat.format(m.date), value };
      });
  });

  protected readonly evolution = computed<ChartPoint[]>(() => {
    const ids = new Set(this.filteredCourses().map((c) => c.id));
    const range = this.range();
    const days = new Map<string, { date: Date; count: number }>();
    for (const a of this.attendances()) {
      if (!ids.has(a.courseId)) continue;
      const date = tsToDate(a.registeredAt);
      if (!date) continue;
      const ms = tsMillis(a.registeredAt);
      if (range.from && ms < range.from.getTime()) continue;
      if (range.to && ms > range.to.getTime()) continue;
      const key = date.toISOString().slice(0, 10);
      const entry = days.get(key) ?? { date, count: 0 };
      entry.count++;
      days.set(key, entry);
    }
    return [...days.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([, d]) => ({ label: dayFormat.format(d.date), value: d.count }));
  });
}
