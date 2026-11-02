import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import {
  ATTENDANCE_RULE_TEXT,
  ATTENDANCE_SOURCE_LABELS,
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_BADGE,
  ATTENDANCE_STATUS_LABELS,
  AttendanceStatus,
} from '../../core/models/attendance.model';
import { courseLabel } from '../../core/models/course.model';
import { fullName } from '../../core/models/user.model';
import { AcademicScopeService } from '../../core/services/academic-scope.service';
import { tsMillis, tsToDate } from '../../core/services/firestore.utils';
import { DateRange, ReportService, inRange, percentLabel } from '../../core/services/report.service';
import { SettingsService } from '../../core/services/settings.service';
import { TsDatePipe } from '../../shared/pipes/ts-date.pipe';
import { downloadCsv, fileDate } from '../../shared/utils/csv';

type Tab = 'course' | 'student' | 'session' | 'low' | 'records';

const TABS: { id: Tab; label: string }[] = [
  { id: 'course', label: 'Por curso' },
  { id: 'student', label: 'Por estudiante' },
  { id: 'session', label: 'Resumen por sesión' },
  { id: 'low', label: 'Bajo porcentaje' },
  { id: 'records', label: 'Detalle de registros' },
];

/** W12 — Reportes. */
@Component({
  selector: 'app-reports',
  imports: [DatePipe, TsDatePipe, NgTemplateOutlet],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="page-title">Reportes</h1>
        <p class="page-subtitle">{{ rule }}</p>
      </div>
      <button type="button" class="btn btn-primary" (click)="exportCsv()">Exportar CSV</button>
    </div>

    <section class="card mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Filtros">
      <div>
        <label for="f-course" class="label">Curso</label>
        <select id="f-course" class="input" #c [value]="courseId()" (change)="courseId.set(c.value)">
          <option value="">Todos</option>
          @for (course of courses(); track course.id) {
            <option [value]="course.id">{{ label(course) }}</option>
          }
        </select>
      </div>
      <div>
        <label for="f-student" class="label">Estudiante</label>
        <select id="f-student" class="input" #st (change)="studentId.set(st.value)">
          <option value="">Todos</option>
          @for (s of studentOptions(); track s.uid) {
            <option [value]="s.uid">{{ name(s) }}</option>
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
      <div>
        <label for="f-status" class="label">Estado (detalle)</label>
        <select id="f-status" class="input" #s (change)="status.set($any(s.value))">
          <option value="">Todos</option>
          @for (x of statuses; track x) {
            <option [value]="x">{{ statusLabels[x] }}</option>
          }
        </select>
      </div>
    </section>

    @if (scope.error()) {
      <p role="alert" class="alert-error mt-4">{{ scope.error() }}</p>
    }

    <div class="mt-4 flex flex-wrap gap-1 border-b border-gray-200" role="tablist" aria-label="Tipo de reporte">
      @for (t of tabs; track t.id) {
        <button type="button" role="tab" [attr.aria-selected]="tab() === t.id" (click)="tab.set(t.id)"
          class="-mb-px border-b-2 px-3 py-2 text-sm"
          [class]="tab() === t.id ? 'border-blue-600 font-medium text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900'">
          {{ t.label }}
        </button>
      }
    </div>

    <div class="table-wrap mt-4" role="tabpanel">
      @switch (tab()) {
        @case ('course') {
          <table class="table">
            <thead><tr>
              <th scope="col">Curso</th><th scope="col">Inscritos</th><th scope="col">Sesiones cerradas</th>
              <th scope="col">Asistencias</th><th scope="col">Asistencia promedio</th>
            </tr></thead>
            <tbody>
              @for (r of courseRows(); track r.course.id) {
                <tr>
                  <td class="font-medium text-gray-900">{{ label(r.course) }}</td>
                  <td>{{ r.students.length }}</td>
                  <td>{{ r.closedSessions }}</td>
                  <td>{{ r.attended }}/{{ r.denominator }}</td>
                  <td>{{ percent(r.averagePercentage) }}</td>
                </tr>
              } @empty { <tr><td colspan="5" class="text-center text-gray-500">Sin datos.</td></tr> }
            </tbody>
          </table>
        }
        @case ('student') {
          <ng-container *ngTemplateOutlet="studentTable; context: { rows: studentRows() }" />
        }
        @case ('low') {
          <p class="px-4 pt-3 text-sm text-gray-600">Estudiantes por debajo de {{ threshold() }}% de asistencia.</p>
          <ng-container *ngTemplateOutlet="studentTable; context: { rows: lowRows() }" />
        }
        @case ('session') {
          <table class="table">
            <thead><tr>
              <th scope="col">Curso</th><th scope="col">Sesión</th><th scope="col">Fecha</th>
              <th scope="col">Inscritos</th><th scope="col">Presentes</th><th scope="col">Tardanzas</th>
              <th scope="col">Faltas</th><th scope="col">Justificadas</th><th scope="col">%</th>
            </tr></thead>
            <tbody>
              @for (r of sessionRows(); track r.session.id) {
                <tr>
                  <td>{{ r.course }}</td>
                  <td class="font-medium text-gray-900">{{ r.session.title }}</td>
                  <td class="whitespace-nowrap">{{ r.session.startsAt | tsDate | date: 'dd/MM/yyyy HH:mm' }}</td>
                  <td>{{ r.enrolled }}</td><td>{{ r.present }}</td><td>{{ r.late }}</td>
                  <td>{{ r.absent }}{{ r.pending ? ' (+' + r.pending + ' pend.)' : '' }}</td>
                  <td>{{ r.justified }}</td><td>{{ percent(r.percentage) }}</td>
                </tr>
              } @empty { <tr><td colspan="9" class="text-center text-gray-500">Sin sesiones.</td></tr> }
            </tbody>
          </table>
        }
        @case ('records') {
          <table class="table">
            <thead><tr>
              <th scope="col">Fecha</th><th scope="col">Curso</th><th scope="col">Sesión</th>
              <th scope="col">Estudiante</th><th scope="col">Estado</th><th scope="col">Fuente</th>
            </tr></thead>
            <tbody>
              @for (r of recordRows(); track r.id) {
                <tr>
                  <td class="whitespace-nowrap">{{ r.registeredAt | tsDate | date: 'dd/MM/yyyy HH:mm' }}</td>
                  <td>{{ r.course }}</td>
                  <td>{{ r.session }}</td>
                  <td class="font-medium text-gray-900">{{ r.student }}</td>
                  <td><span [class]="statusBadge[r.status]">{{ statusLabels[r.status] }}</span></td>
                  <td>{{ sourceLabels[r.source] || r.source }}</td>
                </tr>
              } @empty { <tr><td colspan="6" class="text-center text-gray-500">Sin registros.</td></tr> }
            </tbody>
          </table>
        }
      }
    </div>

    <ng-template #studentTable let-rows="rows">
      <table class="table">
        <thead><tr>
          <th scope="col">Código</th><th scope="col">Estudiante</th><th scope="col">Curso</th>
          <th scope="col">Sesiones</th><th scope="col">Presentes</th><th scope="col">Tardanzas</th>
          <th scope="col">Faltas</th><th scope="col">Justificadas</th><th scope="col">%</th>
        </tr></thead>
        <tbody>
          @for (r of rows; track r.key) {
            <tr>
              <td>{{ r.code || '—' }}</td>
              <td class="font-medium text-gray-900">{{ r.name }}</td>
              <td>{{ r.course }}</td>
              <td>{{ r.validSessions }}</td><td>{{ r.present }}</td><td>{{ r.late }}</td>
              <td>{{ r.absent }}</td><td>{{ r.justified }}</td>
              <td [class.text-red-700]="r.low" [class.font-medium]="r.low">{{ percent(r.percentage) }}</td>
            </tr>
          } @empty { <tr><td colspan="9" class="text-center text-gray-500">Sin datos.</td></tr> }
        </tbody>
      </table>
    </ng-template>
  `,
})
export class Reports {
  readonly courseIdParam = input<string | undefined>(undefined, { alias: 'courseId' });

  protected readonly scope = inject(AcademicScopeService);
  private readonly reportService = inject(ReportService);
  private readonly settings = inject(SettingsService).settings;

  protected readonly tabs = TABS;
  protected readonly rule = ATTENDANCE_RULE_TEXT;
  protected readonly label = courseLabel;
  protected readonly name = fullName;
  protected readonly percent = percentLabel;
  protected readonly statuses = ATTENDANCE_STATUSES;
  protected readonly statusLabels = ATTENDANCE_STATUS_LABELS;
  protected readonly statusBadge = ATTENDANCE_STATUS_BADGE;
  protected readonly sourceLabels = ATTENDANCE_SOURCE_LABELS;

  protected readonly courses = toSignal(this.scope.courses$, { initialValue: [] });
  private readonly enrollments = toSignal(this.scope.enrollments$, { initialValue: [] });
  private readonly sessions = toSignal(this.scope.sessions$, { initialValue: [] });
  private readonly attendances = toSignal(this.scope.attendances$, { initialValue: [] });
  private readonly students = toSignal(this.scope.students$, { initialValue: [] });

  protected readonly tab = signal<Tab>('course');
  protected readonly courseId = signal('');
  protected readonly studentId = signal('');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly status = signal<AttendanceStatus | ''>('');
  protected readonly threshold = computed(() => this.settings().lowAttendanceThreshold);

  constructor() {
    effect(() => {
      const preset = this.courseIdParam();
      if (preset) this.courseId.set(preset);
    });
  }

  private readonly range = computed<DateRange>(() => ({
    from: this.from() ? new Date(`${this.from()}T00:00:00`) : null,
    to: this.to() ? new Date(`${this.to()}T23:59:59.999`) : null,
  }));

  private readonly selectedCourses = computed(() =>
    this.courses().filter((c) => !this.courseId() || c.id === this.courseId()),
  );

  private readonly studentById = computed(() => new Map(this.students().map((s) => [s.uid, s])));

  protected readonly studentOptions = computed(() => {
    const ids = new Set(
      this.enrollments()
        .filter((e) => e.status === 'ACTIVE' && (!this.courseId() || e.courseId === this.courseId()))
        .map((e) => e.studentId),
    );
    return this.students().filter((s) => ids.has(s.uid));
  });

  protected readonly courseRows = computed(() =>
    this.reportService.buildReports(
      this.selectedCourses(),
      this.enrollments().filter((e) => !this.studentId() || e.studentId === this.studentId()),
      this.sessions(),
      this.attendances(),
      this.range(),
    ),
  );

  protected readonly studentRows = computed(() => {
    const byId = this.studentById();
    const threshold = this.threshold();
    return this.courseRows()
      .flatMap((report) =>
        report.students.map((s) => {
          const p = byId.get(s.studentId);
          return {
            ...s,
            key: `${report.course.id}_${s.studentId}`,
            name: p ? fullName(p) : s.studentId,
            code: p?.institutionalCode ?? null,
            course: courseLabel(report.course),
            low: s.percentage != null && s.percentage < threshold,
          };
        }),
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });

  protected readonly lowRows = computed(() =>
    this.studentRows()
      .filter((r) => r.low)
      .sort((a, b) => (a.percentage ?? 0) - (b.percentage ?? 0)),
  );

  protected readonly sessionRows = computed(() =>
    this.courseRows()
      .flatMap((r) => r.sessions.map((s) => ({ ...s, course: courseLabel(r.course) })))
      .sort((a, b) => tsMillis(b.session.startsAt) - tsMillis(a.session.startsAt)),
  );

  protected readonly recordRows = computed(() => {
    const courseIds = new Set(this.selectedCourses().map((c) => c.id));
    const sessionTitle = new Map(this.sessions().map((s) => [s.id, s.title]));
    const courseById = new Map(this.courses().map((c) => [c.id, c]));
    const byId = this.studentById();
    const range = this.range();
    return this.attendances()
      .filter(
        (a) =>
          courseIds.has(a.courseId) &&
          (!this.studentId() || a.studentId === this.studentId()) &&
          (!this.status() || a.status === this.status()) &&
          inRange(tsMillis(a.registeredAt), range),
      )
      .map((a) => {
        const p = byId.get(a.studentId);
        return {
          ...a,
          course: courseLabel(courseById.get(a.courseId)),
          session: sessionTitle.get(a.sessionId) ?? a.sessionId,
          student: p ? fullName(p) : a.studentId,
        };
      })
      .sort((a, b) => tsMillis(b.registeredAt) - tsMillis(a.registeredAt));
  });

  exportCsv(): void {
    const date = fileDate();
    switch (this.tab()) {
      case 'course':
        return downloadCsv(`reporte-cursos-${date}`,
          ['Curso', 'Inscritos', 'Sesiones cerradas', 'Asistencias', 'Total válido', 'Asistencia %'],
          this.courseRows().map((r) => [courseLabel(r.course), r.students.length, r.closedSessions, r.attended, r.denominator, r.averagePercentage]));
      case 'student':
      case 'low':
        return downloadCsv(`reporte-${this.tab() === 'low' ? 'bajo-porcentaje' : 'estudiantes'}-${date}`,
          ['Código', 'Estudiante', 'Curso', 'Sesiones', 'Presentes', 'Tardanzas', 'Faltas', 'Justificadas', 'Asistencia %'],
          (this.tab() === 'low' ? this.lowRows() : this.studentRows()).map((r) =>
            [r.code, r.name, r.course, r.validSessions, r.present, r.late, r.absent, r.justified, r.percentage]));
      case 'session':
        return downloadCsv(`reporte-sesiones-${date}`,
          ['Curso', 'Sesión', 'Fecha', 'Inscritos', 'Presentes', 'Tardanzas', 'Faltas', 'Justificadas', 'Pendientes', 'Asistencia %'],
          this.sessionRows().map((r) => [r.course, r.session.title, tsToDate(r.session.startsAt)?.toLocaleString('es-PE') ?? '',
          r.enrolled, r.present, r.late, r.absent, r.justified, r.pending, r.percentage]));
      case 'records':
        return downloadCsv(`registros-asistencia-${date}`,
          ['Fecha', 'Curso', 'Sesión', 'Estudiante', 'Estado', 'Fuente', 'Motivo de corrección'],
          this.recordRows().map((r) => [tsToDate(r.registeredAt)?.toLocaleString('es-PE') ?? '', r.course, r.session,
          r.student, this.statusLabels[r.status], r.source, r.updateReason ?? '']));
    }
  }
}
