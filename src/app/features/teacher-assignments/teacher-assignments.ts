import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { Course, courseLabel } from '../../core/models/course.model';
import { UserProfile, fullName } from '../../core/models/user.model';
import { AcademicScopeService } from '../../core/services/academic-scope.service';
import { CourseService } from '../../core/services/course.service';
import { errorMessage } from '../../core/services/error-message';
import { DialogService } from '../../shared/dialogs/dialog.service';
import { ToastService } from '../../shared/toast/toast.service';

/** W06 — Asignación de docentes. */
@Component({
  selector: 'app-teacher-assignments',
  imports: [RouterLink],
  template: `
    <h1 class="page-title">Asignación de docentes</h1>
    <p class="page-subtitle">Busca un docente activo, revisa sus cursos y asigna o retira cursos.</p>

    @if (error()) {
      <p role="alert" class="alert-error mt-4">{{ error() }}</p>
    }
    @if (message()) {
      <p role="status" class="alert-success mt-4">{{ message() }}</p>
    }

    <div class="mt-6 grid gap-4 lg:grid-cols-3">
      <!-- Docentes -->
      <section class="card" aria-labelledby="teachers-title">
        <h2 id="teachers-title" class="font-medium text-on-surface">Docentes activos</h2>
        <label for="t-search" class="sr-only">Buscar docente</label>
        <input id="t-search" type="search" class="input mt-3" placeholder="Buscar por nombre o correo"
          #q (input)="search.set(q.value)" />
        <ul class="mt-3 max-h-112 space-y-1 overflow-y-auto" role="listbox" aria-label="Docentes">
          @for (t of filteredTeachers(); track t.uid) {
            <li>
              <button type="button" role="option" [attr.aria-selected]="t.uid === teacherId()"
                (click)="teacherId.set(t.uid)"
                class="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-surface-container-high"
                [class.bg-primary-fixed]="t.uid === teacherId()" [class.text-primary]="t.uid === teacherId()">
                <span class="block font-medium">{{ name(t) }}</span>
                <span class="block text-xs text-on-surface-variant">{{ t.email }} · {{ coursesOf(t.uid).length }} curso(s)</span>
              </button>
            </li>
          } @empty {
            <li class="px-3 py-2 text-sm text-on-surface-variant">No hay docentes activos.</li>
          }
        </ul>
      </section>

      <!-- Asignación -->
      <section class="card lg:col-span-2" aria-labelledby="assign-title">
        @if (teacher(); as t) {
          <h2 id="assign-title" class="font-medium text-on-surface">{{ name(t) }}</h2>
          <p class="text-sm text-on-surface-variant">{{ t.email }}</p>

          <div class="mt-4 flex flex-wrap items-end gap-2">
            <div class="w-full flex-1 sm:w-auto sm:min-w-64">
              <label for="course" class="label">Seleccionar curso</label>
              <select id="course" class="input" #sel [value]="courseId()" (change)="courseId.set(sel.value)">
                <option value="">Selecciona un curso activo</option>
                @for (c of assignable(); track c.id) {
                  <option [value]="c.id">{{ label(c) }}</option>
                }
              </select>
            </div>
            <button type="button" class="btn btn-primary" [disabled]="!courseId() || busy()" (click)="assign(t)">
              Asignar docente
            </button>
          </div>

          <h3 class="mt-6 text-sm font-medium text-on-surface">Cursos actuales del docente</h3>
          <ul class="mt-2 divide-y divide-outline-variant/50">
            @for (c of coursesOf(t.uid); track c.id) {
              <li class="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <a [routerLink]="['/courses', c.id]" class="text-primary hover:underline">{{ label(c) }}</a>
                <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="remove(t, c)">
                  Retirar
                </button>
              </li>
            } @empty {
              <li class="py-2 text-sm text-on-surface-variant">Sin cursos asignados.</li>
            }
          </ul>
        } @else {
          <h2 id="assign-title" class="sr-only">Asignación</h2>
          <p class="text-sm text-on-surface-variant">Selecciona un docente de la lista.</p>
        }
      </section>
    </div>
  `,
})
export class TeacherAssignments {
  /** Query param opcional para preseleccionar un curso. */
  readonly courseIdParam = input<string | undefined>(undefined, { alias: 'courseId' });

  private readonly scope = inject(AcademicScopeService);
  private readonly courseService = inject(CourseService);
  private readonly dialogs = inject(DialogService);

  protected readonly name = fullName;
  protected readonly label = courseLabel;

  private readonly teachers = toSignal(this.scope.teachers$, { initialValue: [] });
  private readonly courses = toSignal(this.scope.courses$, { initialValue: [] });

  protected readonly search = signal('');
  protected readonly teacherId = signal<string | null>(null);
  protected readonly courseId = signal('');
  protected readonly busy = signal(false);
  private readonly toast = inject(ToastService);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);

  constructor() {
    effect(() => {
      const preset = this.courseIdParam();
      if (preset) this.courseId.set(preset);
    });
  }

  protected readonly filteredTeachers = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.teachers()
      .filter((t) => t.status === 'ACTIVE')
      .filter((t) => !term || `${fullName(t)} ${t.email}`.toLowerCase().includes(term));
  });

  protected readonly teacher = computed(() => this.teachers().find((t) => t.uid === this.teacherId()) ?? null);

  protected readonly assignable = computed(() => {
    const uid = this.teacherId();
    return this.courses().filter((c) => c.status === 'ACTIVE' && (!uid || !c.teacherIds.includes(uid)));
  });

  protected coursesOf(uid: string): Course[] {
    return this.courses().filter((c) => c.teacherIds.includes(uid));
  }

  async assign(teacher: UserProfile): Promise<void> {
    const course = this.courses().find((c) => c.id === this.courseId());
    if (!course) return;
    const ok = await this.dialogs.confirm({
      title: 'Asignar docente',
      message: `¿Asignar a ${fullName(teacher)} al curso ${courseLabel(course)}?`,
      confirmText: 'Asignar',
    });
    if (!ok) return;
    await this.run(async () => {
      await this.courseService.assignTeacher(course, teacher.uid, fullName(teacher));
      this.courseId.set('');
      return `${fullName(teacher)} asignado a ${course.name}.`;
    });
  }

  async remove(teacher: UserProfile, course: Course): Promise<void> {
    const reason = await this.dialogs.reason({
      title: 'Retirar docente',
      message: `¿Retirar a ${fullName(teacher)} del curso ${courseLabel(course)}?`,
      confirmText: 'Retirar',
      tone: 'danger',
      required: false,
    });
    if (reason === null) return;
    await this.run(async () => {
      await this.courseService.removeTeacher(course, teacher.uid, reason || null);
      return `${fullName(teacher)} retirado de ${course.name}.`;
    });
  }

  private async run(action: () => Promise<string>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.message.set(null);
    try {
      const msg = await action();
      if (msg) this.toast.success(msg);
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
