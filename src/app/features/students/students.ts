import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { ATTENDANCE_RULE_TEXT } from '../../core/models/attendance.model';
import { courseLabel } from '../../core/models/course.model';
import { fullName } from '../../core/models/user.model';
import { AcademicScopeService } from '../../core/services/academic-scope.service';
import { ReportService, percentLabel } from '../../core/services/report.service';
import { SettingsService } from '../../core/services/settings.service';
import { downloadCsv, fileDate } from '../../shared/utils/csv';

/** Estudiantes inscritos en los cursos del docente. */
@Component({
  selector: 'app-students',
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="page-title">Estudiantes</h1>
        <p class="page-subtitle">{{ rows().length }} inscripciones activas</p>
      </div>
      <button type="button" class="btn btn-secondary" (click)="exportCsv()">Exportar CSV</button>
    </div>

    <div class="card mt-4 grid gap-3 sm:grid-cols-2">
      <div>
        <label for="course" class="label">Curso</label>
        <select id="course" class="input" #c (change)="courseId.set(c.value)">
          <option value="">Todos mis cursos</option>
          @for (course of courses(); track course.id) {
            <option [value]="course.id">{{ label(course) }}</option>
          }
        </select>
      </div>
      <div>
        <label for="search" class="label">Buscar</label>
        <input id="search" type="search" class="input" placeholder="Nombre, código o correo" #q (input)="search.set(q.value)" />
      </div>
    </div>

    @if (scope.error()) {
      <p role="alert" class="alert-error mt-4">{{ scope.error() }}</p>
    }

    <div class="table-wrap mt-4">
      <table class="table">
        <thead>
          <tr>
            <th scope="col">Código</th>
            <th scope="col">Nombre</th>
            <th scope="col">Correo</th>
            <th scope="col">Curso</th>
            <th scope="col">Sesiones válidas</th>
            <th scope="col">Asistencia</th>
          </tr>
        </thead>
        <tbody>
          @for (r of rows(); track r.key) {
            <tr>
              <td>{{ r.code || '—' }}</td>
              <td class="font-medium text-on-surface">{{ r.name }}</td>
              <td>{{ r.email }}</td>
              <td>{{ r.course }}</td>
              <td>{{ r.validSessions }}</td>
              <td>
                <span [class]="r.low ? 'badge badge-red' : 'badge badge-green'">{{ percent(r.percentage) }}</span>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="text-center text-on-surface-variant">Sin estudiantes.</td></tr>
          }
        </tbody>
      </table>
    </div>
    <p class="mt-2 text-xs text-on-surface-variant">{{ rule }}</p>
  `,
})
export class Students {
  protected readonly scope = inject(AcademicScopeService);
  private readonly reportService = inject(ReportService);
  private readonly settings = inject(SettingsService).settings;

  protected readonly label = courseLabel;
  protected readonly percent = percentLabel;
  protected readonly rule = ATTENDANCE_RULE_TEXT;

  protected readonly courses = toSignal(this.scope.courses$, { initialValue: [] });
  private readonly enrollments = toSignal(this.scope.enrollments$, { initialValue: [] });
  private readonly sessions = toSignal(this.scope.sessions$, { initialValue: [] });
  private readonly attendances = toSignal(this.scope.attendances$, { initialValue: [] });
  private readonly students = toSignal(this.scope.students$, { initialValue: [] });

  protected readonly courseId = signal('');
  protected readonly search = signal('');

  protected readonly rows = computed(() => {
    const byId = new Map(this.students().map((s) => [s.uid, s]));
    const threshold = this.settings().lowAttendanceThreshold;
    const term = this.search().trim().toLowerCase();
    const courses = this.courses().filter((c) => !this.courseId() || c.id === this.courseId());

    return this.reportService
      .buildReports(courses, this.enrollments(), this.sessions(), this.attendances())
      .flatMap((report) =>
        report.students.map((s) => {
          const profile = byId.get(s.studentId);
          return {
            ...s,
            key: `${report.course.id}_${s.studentId}`,
            name: profile ? fullName(profile) : s.studentId,
            code: profile?.institutionalCode ?? null,
            email: profile?.email ?? '',
            course: courseLabel(report.course),
            low: s.percentage != null && s.percentage < threshold,
          };
        }),
      )
      .filter((r) => !term || `${r.name} ${r.code ?? ''} ${r.email}`.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });

  exportCsv(): void {
    downloadCsv(
      `estudiantes-${fileDate()}`,
      ['Código', 'Nombre', 'Correo', 'Curso', 'Sesiones válidas', 'Presentes', 'Tardanzas', 'Faltas', 'Justificadas', 'Asistencia %'],
      this.rows().map((r) => [
        r.code, r.name, r.email, r.course, r.validSessions, r.present, r.late, r.absent, r.justified, r.percentage,
      ]),
    );
  }
}
