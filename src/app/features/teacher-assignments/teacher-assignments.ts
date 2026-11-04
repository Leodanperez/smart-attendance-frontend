import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { Course, courseLabel } from '../../core/models/course.model';
import { UserProfile, fullName } from '../../core/models/user.model';
import { AcademicScopeService } from '../../core/services/academic-scope.service';
import { CourseService } from '../../core/services/course.service';
import { errorMessage } from '../../core/services/error-message';
import { CoursePicker } from '../../shared/components/course-picker';
import { DialogService } from '../../shared/dialogs/dialog.service';
import { ToastService } from '../../shared/toast/toast.service';

/** W06 — Asignación de docentes. */
@Component({
  selector: 'app-teacher-assignments',
  imports: [RouterLink, CoursePicker],
  template: `
    <header>
      <h1 class="page-title">Asignación de docentes</h1>
      <p class="page-subtitle">Busca un docente activo, revisa sus cursos y asigna o retira cursos.</p>
    </header>
 
    @if (error()) {
      <p role="alert" class="alert-error mt-4">{{ error() }}</p>
    }
    @if (message()) {
      <p role="status" class="alert-success mt-4">{{ message() }}</p>
    }
 
    <div class="mt-8 grid items-start gap-6 lg:grid-cols-[22rem_1fr]">
      <!-- Docentes -->
      <section
        class="rounded-3xl border border-outline-variant/60 bg-surface-container p-4 shadow-sm lg:sticky lg:top-4"
        aria-labelledby="teachers-title"
      >
        <div class="flex items-center justify-between px-2 pt-1">
          <h2 id="teachers-title" class="text-base font-semibold tracking-tight text-on-surface">Docentes activos</h2>
          <span class="rounded-full bg-primary-fixed px-2.5 py-0.5 text-xs font-semibold text-primary">
            {{ filteredTeachers().length }}
          </span>
        </div>
 
        <div class="relative mt-3">
          <svg
            aria-hidden="true"
            class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-on-surface-variant"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
          >
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <label for="t-search" class="sr-only">Buscar docente</label>
          <input id="t-search" type="search" class="input pl-9" placeholder="Buscar por nombre o correo"
            #q (input)="search.set(q.value)" />
        </div>
 
        <ul class="mt-3 max-h-112 space-y-1 overflow-y-auto pr-1" role="listbox" aria-label="Docentes">
          @for (t of filteredTeachers(); track t.uid) {
            <li>
              <button
                type="button" role="option" [attr.aria-selected]="t.uid === teacherId()"
                (click)="teacherId.set(t.uid)"
                class="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-primary"
                [class.bg-primary-fixed]="t.uid === teacherId()"
              >
                <span
                  aria-hidden="true"
                  class="grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold transition-colors"
                  [class]="t.uid === teacherId()
                    ? 'bg-primary text-surface-container'
                    : 'bg-surface-container-high text-on-surface-variant group-hover:bg-primary-fixed group-hover:text-primary'"
                >{{ initials(t) }}</span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium"
                    [class.text-primary]="t.uid === teacherId()"
                    [class.text-on-surface]="t.uid !== teacherId()">{{ name(t) }}</span>
                  <span class="block truncate text-xs text-on-surface-variant">{{ t.email }}</span>
                </span>
                <span class="shrink-0 rounded-full bg-surface-container-high px-2 py-0.5 text-xs font-medium text-on-surface-variant"
                  [attr.aria-label]="coursesOf(t.uid).length + ' cursos'">
                  {{ coursesOf(t.uid).length }}
                </span>
              </button>
            </li>
          } @empty {
            <li class="px-3 py-8 text-center text-sm text-on-surface-variant">No hay docentes activos.</li>
          }
        </ul>
      </section>
 
      <!-- Asignación -->
      <section
        class="rounded-3xl border border-outline-variant/60 bg-surface-container p-6 shadow-sm"
        aria-labelledby="assign-title"
      >
        @if (teacher(); as t) {
          <div class="flex items-center gap-4">
            <span
              aria-hidden="true"
              class="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary text-lg font-semibold text-surface-container"
            >{{ initials(t) }}</span>
            <div class="min-w-0">
              <h2 id="assign-title" class="truncate text-xl font-semibold tracking-tight text-on-surface">{{ name(t) }}</h2>
              <p class="truncate text-sm text-on-surface-variant">{{ t.email }}</p>
            </div>
            <span class="ml-auto hidden shrink-0 rounded-full bg-primary-fixed px-3 py-1 text-xs font-semibold text-primary sm:inline">
              {{ coursesOf(t.uid).length }} curso(s) asignado(s)
            </span>
          </div>
 
          <hr class="my-6 border-outline-variant/50" />
 
          <app-course-picker [courses]="assignable()" [selected]="selectedIdList()" [multiple]="true"
            label="Cursos a asignar" placeholder="Buscar y seleccionar cursos…"
            (selectedChange)="onSelectionChange($event)" />

          <div class="mt-4 flex justify-end">
            <button type="button" class="btn btn-primary w-full sm:w-auto" [disabled]="!selectedCourses().length || busy()" (click)="assign(t)">
              {{ selectedCourses().length > 1 ? 'Asignar ' + selectedCourses().length + ' cursos' : 'Asignar docente' }}
            </button>
          </div>
 
          <div class="mt-8 flex items-center justify-between">
            <h3 class="text-base font-semibold tracking-tight text-on-surface">Cursos actuales</h3>
            <span class="text-xs text-on-surface-variant">{{ coursesOf(t.uid).length }} en total</span>
          </div>
 
          <ul class="mt-3 space-y-2">
            @for (c of coursesOf(t.uid); track c.id) {
              <li class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-outline-variant/50 bg-surface-container-high/40 px-4 py-3 transition-colors hover:bg-surface-container-high">
                <a [routerLink]="['/courses', c.id]" class="min-w-0 flex-1 truncate text-sm font-medium text-primary hover:underline">{{ label(c) }}</a>
                <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="remove(t, c)">
                  Retirar
                </button>
              </li>
            } @empty {
              <li class="rounded-2xl border border-dashed border-outline-variant px-4 py-8 text-center text-sm text-on-surface-variant">
                Este docente aún no tiene cursos. Usa el selector de arriba para asignarle el primero.
              </li>
            }
          </ul>
        } @else {
          <h2 id="assign-title" class="sr-only">Asignación</h2>
          <div class="grid place-items-center gap-3 px-4 py-20 text-center">
            <span aria-hidden="true" class="grid size-16 place-items-center rounded-2xl bg-primary-fixed text-primary">
              <svg class="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" />
              </svg>
            </span>
            <p class="text-base font-medium text-on-surface">Elige un docente</p>
            <p class="max-w-xs text-sm text-on-surface-variant">Selecciónalo en la lista para ver sus cursos y asignarle nuevos.</p>
          </div>
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
  protected readonly busy = signal(false);
  private readonly toast = inject(ToastService);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);

  // Selección múltiple de cursos (la UI vive en <app-course-picker>).
  private readonly selectedIds = signal<ReadonlySet<string>>(new Set());

  constructor() {
    // ?courseId= preselecciona ese curso.
    effect(() => {
      const preset = this.courseIdParam();
      if (preset) this.selectedIds.set(new Set([preset]));
    });
  }
  /** Iniciales (máx. 2) para el avatar del docente. */
  protected initials(t: UserProfile): string {
    return (
      fullName(t)
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0])
        .join('')
        .toUpperCase() || '?'
    );
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

  /** Seleccionados que siguen siendo asignables (si cambia el docente, se descartan los ya asignados). */
  protected readonly selectedCourses = computed(() => {
    const ids = this.selectedIds();
    return this.assignable().filter((c) => ids.has(c.id));
  });

  protected readonly selectedIdList = computed(() => this.selectedCourses().map((c) => c.id));

  protected onSelectionChange(ids: string[]): void {
    this.selectedIds.set(new Set(ids));
  }
  async assign(teacher: UserProfile): Promise<void> {
    const courses = this.selectedCourses();
    if (!courses.length) return;
    const list = courses.length === 1 ? courseLabel(courses[0]) : `${courses.length} cursos`;
    const ok = await this.dialogs.confirm({
      title: 'Asignar docente',
      message: `¿Asignar a ${fullName(teacher)} a ${list}?`,
      confirmText: 'Asignar',
    });
    if (!ok) return;
    await this.run(async () => {
      let done = 0;
      // Uno por uno: si alguno falla, los ya asignados quedan guardados y los demás siguen seleccionados.
      for (const course of courses) {
        await this.courseService.assignTeacher(course, teacher.uid, fullName(teacher));
        this.selectedIds.update((set) => {
          const next = new Set(set);
          next.delete(course.id);
          return next;
        });
        done++;
      }
      return done === 1
        ? `${fullName(teacher)} asignado a ${courses[0].name}.`
        : `${fullName(teacher)} asignado a ${done} cursos.`;
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