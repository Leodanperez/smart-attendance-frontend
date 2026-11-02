import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

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
import { askOptionalReason } from '../../shared/utils/prompt';

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

    <div class="card mt-4 grid gap-3 sm:grid-cols-3">
      <div class="sm:col-span-2">
        <label for="search" class="label">Buscar</label>
        <input id="search" type="search" class="input" placeholder="Código, nombre o sección" #q (input)="search.set(q.value)" />
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
              <td class="font-medium text-gray-900">{{ c.name }}</td>
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
            <tr><td colspan="7" class="text-center text-gray-500">No hay cursos.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class CoursesList {
  protected readonly scope = inject(AcademicScopeService);
  private readonly courseService = inject(CourseService);
  private readonly user = inject(AuthService).currentUser;

  protected readonly statuses = COURSE_STATUSES;
  protected readonly statusLabels = COURSE_STATUS_LABELS;
  protected readonly statusBadge = COURSE_STATUS_BADGE;

  protected readonly isAdmin = computed(() => this.user()?.role === 'ADMIN');
  protected readonly isStudent = computed(() => this.user()?.role === 'STUDENT');

  protected readonly search = signal('');
  protected readonly status = signal<CourseStatus | ''>('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly courses = toSignal(this.scope.courses$, { initialValue: [] });
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
      if (!term) return true;
      return [c.courseCode, c.name, c.section].some((v) => v?.toLowerCase().includes(term));
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
    const reason = askOptionalReason(`Motivo para ${next === 'ACTIVE' ? 'activar' : 'desactivar'} "${course.name}" (opcional):`);
    if (reason === null) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.courseService.setStatus(course, next, reason || null);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  exportCsv(): void {
    downloadCsv(
      `cursos-${fileDate()}`,
      ['Código', 'Nombre', 'Sección', 'Docentes', 'Estudiantes', 'Estado'],
      this.filtered().map((c) => [
        c.courseCode,
        c.name,
        c.section,
        this.teacherNames(c),
        this.studentCount().get(c.id) ?? 0,
        this.statusLabels[c.status],
      ]),
    );
  }
}
