import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';

import { Career, semesterLabel } from '../../core/models/career.model';
import { CareerService } from '../../core/services/career.service';
import { AcademicPeriodService } from '../../core/services/academic-period.service';

import { AuthService } from '../../core/auth/auth.service';
import {
  COURSE_STATUSES,
  COURSE_STATUS_BADGE,
  COURSE_STATUS_LABELS,
  Course,
  CourseStatus,
} from '../../core/models/course.model';
import { fullName } from '../../core/models/user.model';
import { AcademicScopeService } from '../../core/services/academic-scope.service';
import { CourseService } from '../../core/services/course.service';
import { errorMessage } from '../../core/services/error-message';
import { downloadCsv, fileDate } from '../../shared/utils/csv';
import { DialogService } from '../../shared/dialogs/dialog.service';
import { ToastService } from '../../shared/toast/toast.service';

/** W05 — Gestión de cursos (ADMIN) / Mis cursos (TEACHER, STUDENT). */
@Component({
  selector: 'app-courses-list',
  imports: [RouterLink],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="page-title">{{ isAdmin() ? 'Cursos' : 'Mis cursos' }}</h1>
        <p class="page-subtitle">{{ filtered().length }} cursos</p>
      </div>
      <div class="flex gap-2">
        <button type="button" class="btn btn-secondary" (click)="exportCsv()">Exportar CSV</button>
        @if (isAdmin()) {
          <a routerLink="/courses/new" class="btn btn-primary">Crear curso</a>
        }
      </div>
    </div>

    <div class="card mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div>
        <label for="period" class="label">Periodo</label>
        <select id="period" class="input" #pe [value]="periodId()" (change)="periodId.set(pe.value)">
          <option value="">Todos</option>
          @for (p of periods(); track p.id) {
            <option [value]="p.id">{{ p.name }}{{ p.status === 'ACTIVE' ? ' (en curso)' : '' }}</option>
          }
        </select>
      </div>
      <div>
        <label for="search" class="label">Buscar</label>
        <input id="search" type="search" class="input" placeholder="Código, nombre o sección" #q (input)="search.set(q.value)" />
      </div>
      <div>
        <label for="career" class="label">Carrera</label>
        <select id="career" class="input" #ca [value]="careerId()" (change)="careerId.set(ca.value); semester.set('')">
          <option value="">Todas</option>
          @for (c of careers(); track c.id) {
            <option [value]="c.id">{{ c.code ? c.code + ' · ' : '' }}{{ c.name }}</option>
          }
        </select>
      </div>
      <div>
        <label for="semester" class="label">Ciclo</label>
        <select id="semester" class="input" #se [value]="semester()" (change)="semester.set(se.value)">
          <option value="">Todos</option>
          @for (n of semesters(); track n) {
            <option [value]="n">{{ semesterLabel(n) }}</option>
          }
        </select>
      </div>
      <div>
        <label for="status" class="label">Estado</label>
        <select id="status" class="input" #s (change)="status.set($any(s.value))">
          <option value="">Todos</option>
          @for (st of statuses; track st) {
            <option [value]="st">{{ statusLabels[st] }}</option>
          }
        </select>
      </div>
    </div>

    @if (error() || scope.error()) {
      <p role="alert" class="alert-error mt-4">{{ error() || scope.error() }}</p>
    }

    <div class="table-wrap mt-4">
      <table class="table">
        <thead>
          <tr>
            <th scope="col">Código</th>
            <th scope="col">Nombre</th>
            <th scope="col">Periodo</th>
            <th scope="col">Carrera</th>
            <th scope="col">Ciclo</th>
            <th scope="col">Sección</th>
            <th scope="col">Docentes asignados</th>
            @if (!isStudent()) {
              <th scope="col">N° estudiantes</th>
            }
            <th scope="col">Estado</th>
            <th scope="col"><span class="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          @for (c of filtered(); track c.id) {
            <tr>
              <td class="font-mono text-xs">{{ c.courseCode }}</td>
              <td class="font-medium text-on-surface">{{ c.name }}</td>
              <td class="font-mono text-xs whitespace-nowrap">{{ c.academicPeriodName || '—' }}</td>
              <td>{{ c.careerName || 'Sin carrera' }}</td>
              <td class="whitespace-nowrap">{{ semesterLabel(c.semester) }}</td>
              <td>{{ c.section || '—' }}</td>
              <td>{{ teacherNames(c) }}</td>
              @if (!isStudent()) {
                <td>{{ studentCount().get(c.id) ?? 0 }}</td>
              }
              <td><span [class]="statusBadge[c.status]">{{ statusLabels[c.status] }}</span></td>
              <td>
                <div class="flex justify-end gap-2">
                  <a [routerLink]="['/courses', c.id]" class="btn btn-secondary btn-sm">Ver detalle</a>
                  @if (isAdmin()) {
                    <a [routerLink]="['/courses', c.id, 'edit']" class="btn btn-secondary btn-sm">Editar</a>
                    <a routerLink="/teacher-assignments" [queryParams]="{ courseId: c.id }" class="btn btn-secondary btn-sm">
                      Asignar docente
                    </a>
                    <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="toggleStatus(c)">
                      {{ c.status === 'ACTIVE' ? 'Desactivar' : 'Activar' }}
                    </button>
                  }
                </div>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="10" class="text-center text-on-surface-variant">No hay cursos con estos filtros.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class CoursesList {
  protected readonly scope = inject(AcademicScopeService);
  private readonly courseService = inject(CourseService);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly user = inject(AuthService).currentUser;

  protected readonly statuses = COURSE_STATUSES;
  protected readonly statusLabels = COURSE_STATUS_LABELS;
  protected readonly statusBadge = COURSE_STATUS_BADGE;

  protected readonly isAdmin = computed(() => this.user()?.role === 'ADMIN');
  protected readonly isStudent = computed(() => this.user()?.role === 'STUDENT');

  /** Query param ?careerId= (desde la página de carreras). */
  readonly careerIdParam = input<string | undefined>(undefined, { alias: 'careerId' });

  protected readonly semesterLabel = semesterLabel;
  protected readonly search = signal('');
  protected readonly status = signal<CourseStatus | ''>('');
  protected readonly careerId = signal('');
  protected readonly semester = signal('');
  /** Query param ?periodId= (desde la página de periodos). */
  readonly periodIdParam = input<string | undefined>(undefined, { alias: 'periodId' });
  protected readonly periodId = signal('');
  protected readonly periods = inject(AcademicPeriodService).periods;

  /** Carreras presentes en los cursos visibles (sirve también a docentes y estudiantes). */
  protected readonly careers = computed(() => {
    const codes = new Map(this.careerList().map((c) => [c.id, c.code]));
    const map = new Map<string, { id: string; name: string; code: string }>();
    for (const c of this.courses()) {
      if (c.careerId && !map.has(c.careerId)) {
        map.set(c.careerId, { id: c.careerId, name: c.careerName ?? '', code: codes.get(c.careerId) ?? '' });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });
  protected readonly semesters = computed(() =>
    [...new Set(this.courses()
      .filter((c) => !this.careerId() || c.careerId === this.careerId())
      .map((c) => c.semester)
      .filter((n): n is number => n != null))].sort((a, b) => a - b),
  );

  constructor() {
    effect(() => {
      const preset = this.careerIdParam();
      if (preset) this.careerId.set(preset);
    });
    // Periodo: el de la URL o, por defecto, el que está en curso (una sola vez).
    let presetApplied = false;
    effect(() => {
      if (presetApplied) return;
      const fromUrl = this.periodIdParam();
      const active = this.periods().find((p) => p.status === 'ACTIVE');
      if (fromUrl || active) {
        this.periodId.set(fromUrl ?? active!.id);
        presetApplied = true;
      }
    });
  }
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly courses = toSignal(this.scope.courses$, { initialValue: [] });
  private readonly careerList = toSignal(
    inject(CareerService).getAll().pipe(catchError(() => of([] as Career[]))),
    { initialValue: [] as Career[] },
  );
  private readonly teachers = toSignal(this.scope.teachers$, { initialValue: [] });
  private readonly enrollments = toSignal(this.scope.enrollments$, { initialValue: [] });

  protected readonly studentCount = computed(() => {
    const counts = new Map<string, number>();
    for (const e of this.enrollments()) {
      if (e.status === 'ACTIVE') counts.set(e.courseId, (counts.get(e.courseId) ?? 0) + 1);
    }
    return counts;
  });

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.courses().filter((c) => {
      if (this.status() && c.status !== this.status()) return false;
      if (this.periodId() && c.academicPeriodId !== this.periodId()) return false;
      if (this.careerId() && c.careerId !== this.careerId()) return false;
      if (this.semester() && String(c.semester) !== this.semester()) return false;
      if (!term) return true;
      return [c.courseCode, c.name, c.section, c.careerName].some((v) => v?.toLowerCase().includes(term));
    });
  });

  protected teacherNames(course: Course): string {
    const names = course.teacherIds
      .map((id) => this.teachers().find((t) => t.uid === id))
      .filter((t) => !!t)
      .map((t) => fullName(t));
    return names.length ? names.join(', ') : course.teacherIds.length ? `${course.teacherIds.length} docente(s)` : 'Sin asignar';
  }

  async toggleStatus(course: Course): Promise<void> {
    const next: CourseStatus = course.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const reason = await this.dialogs.reason({
      title: `${next === 'ACTIVE' ? 'Activar' : 'Desactivar'} curso`,
      message: `${course.courseCode} · ${course.name}`,
      confirmText: next === 'ACTIVE' ? 'Activar' : 'Desactivar',
      tone: next === 'ACTIVE' ? 'primary' : 'danger',
      required: false,
    });
    if (reason === null) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.courseService.setStatus(course, next, reason || null);
      if (next === 'ACTIVE') this.toast.success(`${course.courseCode} · ${course.name}`, { title: 'Curso activado' });
      else this.toast.warning(`${course.courseCode} · ${course.name} ya no admite nuevas sesiones.`, { title: 'Curso desactivado' });
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  exportCsv(): void {
    downloadCsv(
      `cursos-${fileDate()}`,
      ['Código', 'Nombre', 'Periodo', 'Carrera', 'Ciclo', 'Sección', 'Docentes', 'Estudiantes', 'Estado'],
      this.filtered().map((c) => [
        c.courseCode,
        c.name,
        c.academicPeriodName,
        c.careerName,
        c.semester,
        c.section,
        this.teacherNames(c),
        this.studentCount().get(c.id) ?? 0,
        this.statusLabels[c.status],
      ]),
    );
  }
}
