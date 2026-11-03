import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_BADGE,
  ATTENDANCE_STATUS_LABELS,
  AttendanceStatus,
} from '../../core/models/attendance.model';
import { AuthService } from '../../core/auth/auth.service';
import { courseLabel } from '../../core/models/course.model';
import { AcademicScopeService } from '../../core/services/academic-scope.service';
import { tsMillis, tsToDate } from '../../core/services/firestore.utils';
import { TsDatePipe } from '../../shared/pipes/ts-date.pipe';
import { downloadCsv, fileDate } from '../../shared/utils/csv';

/** Mi asistencia (STUDENT): historial completo de sus registros, filtrable, con export CSV. */
@Component({
  selector: 'app-my-attendance',
  imports: [DatePipe, TsDatePipe],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="page-title">Mi asistencia</h1>
        <p class="page-subtitle">{{ filtered().length }} registro(s). El registro se hace desde la app Android.</p>
      </div>
      <button type="button" class="btn btn-secondary" (click)="exportCsv()">Exportar CSV</button>
    </div>

    @if (scope.error()) {
      <p role="alert" class="alert-error mt-4">{{ scope.error() }}</p>
    }

    <!-- Resumen por estado -->
    <section class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Resumen">
      @for (s of summary(); track s.status) {
        <div class="card p-4">
          <p class="text-2xl font-bold text-on-surface">{{ s.count }}</p>
          <p class="text-xs text-on-surface-variant">{{ statusLabels[s.status] }}</p>
        </div>
      }
    </section>

    <!-- Filtros -->
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
        <label for="status" class="label">Estado</label>
        <select id="status" class="input" #s (change)="status.set($any(s.value))">
          <option value="">Todos</option>
          @for (x of statuses; track x) {
            <option [value]="x">{{ statusLabels[x] }}</option>
          }
        </select>
      </div>
    </div>

    <!-- Tabla (escritorio) -->
    <div class="table-wrap mt-4 hidden md:block">
      <table class="table">
        <thead>
          <tr>
            <th scope="col">Fecha y hora</th>
            <th scope="col">Curso</th>
            <th scope="col">Sesión</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody>
          @for (r of filtered(); track r.id) {
            <tr>
              <td class="whitespace-nowrap">{{ r.registeredAt | tsDate | date: 'dd/MM/yyyy HH:mm' }}</td>
              <td>{{ r.courseName }}</td>
              <td class="font-medium text-on-surface">{{ r.sessionTitle }}</td>
              <td><span [class]="badges[r.status]">{{ statusLabels[r.status] }}</span></td>
            </tr>
          } @empty {
            <tr><td colspan="4" class="text-center text-on-surface-variant">Sin registros de asistencia.</td></tr>
          }
        </tbody>
      </table>
    </div>

    <!-- Tarjetas (móvil) -->
    <ul class="mt-4 space-y-3 md:hidden">
      @for (r of filtered(); track r.id) {
        <li class="card p-4">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="truncate font-medium text-on-surface">{{ r.sessionTitle }}</p>
              <p class="truncate text-xs text-on-surface-variant">{{ r.courseName }}</p>
            </div>
            <span [class]="badges[r.status]">{{ statusLabels[r.status] }}</span>
          </div>
          <p class="mt-2 text-xs text-on-surface-variant">{{ r.registeredAt | tsDate | date: 'dd/MM/yyyy HH:mm' }}</p>
        </li>
      } @empty {
        <li class="card text-center text-sm text-on-surface-variant">Sin registros de asistencia.</li>
      }
    </ul>
  `,
})
export class MyAttendance {
  protected readonly scope = inject(AcademicScopeService);
  private readonly uid = inject(AuthService).currentUser()?.uid ?? '';

  protected readonly label = courseLabel;
  protected readonly statuses = ATTENDANCE_STATUSES;
  protected readonly statusLabels = ATTENDANCE_STATUS_LABELS;
  protected readonly badges = ATTENDANCE_STATUS_BADGE;

  protected readonly courses = toSignal(this.scope.courses$, { initialValue: [] });
  private readonly sessions = toSignal(this.scope.sessions$, { initialValue: [] });
  private readonly attendances = toSignal(this.scope.attendances$, { initialValue: [] });

  protected readonly courseId = signal('');
  protected readonly status = signal<AttendanceStatus | ''>('');

  /** Registros del propio estudiante, enriquecidos con nombres de curso y sesión. */
  private readonly rows = computed(() => {
    const courseById = new Map(this.courses().map((c) => [c.id, c]));
    const sessionById = new Map(this.sessions().map((s) => [s.id, s]));
    const me = this.uid;
    return this.attendances()
      .filter((a) => a.studentId === me)
      .map((a) => ({
        ...a,
        courseName: courseLabel(courseById.get(a.courseId)),
        sessionTitle: sessionById.get(a.sessionId)?.title ?? 'Sesión',
      }))
      .sort((a, b) => tsMillis(b.registeredAt) - tsMillis(a.registeredAt));
  });

  protected readonly filtered = computed(() =>
    this.rows().filter(
      (r) =>
        (!this.courseId() || r.courseId === this.courseId()) &&
        (!this.status() || r.status === this.status()),
    ),
  );

  /** Conteo por estado sobre el filtro de curso (no de estado). */
  protected readonly summary = computed(() => {
    const base = this.rows().filter((r) => !this.courseId() || r.courseId === this.courseId());
    return ATTENDANCE_STATUSES.map((status) => ({
      status,
      count: base.filter((r) => r.status === status).length,
    }));
  });

  exportCsv(): void {
    downloadCsv(
      `mi-asistencia-${fileDate()}`,
      ['Fecha', 'Curso', 'Sesión', 'Estado'],
      this.filtered().map((r) => [
        tsToDate(r.registeredAt)?.toLocaleString('es-PE') ?? '',
        r.courseName,
        r.sessionTitle,
        this.statusLabels[r.status],
      ]),
    );
  }
}
