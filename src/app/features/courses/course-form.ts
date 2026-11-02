import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';

import { COURSE_STATUSES, COURSE_STATUS_LABELS, Course, CourseStatus } from '../../core/models/course.model';
import { fullName } from '../../core/models/user.model';
import { AcademicScopeService } from '../../core/services/academic-scope.service';
import { CourseService } from '../../core/services/course.service';
import { errorMessage } from '../../core/services/error-message';

/** Formulario de curso (crear / editar). */
@Component({
  selector: 'app-course-form',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="mx-auto max-w-3xl">
      <a routerLink="/courses" class="text-sm text-blue-600 hover:underline">← Volver a cursos</a>
      <h1 class="page-title mt-2">{{ id() ? 'Editar curso' : 'Crear curso' }}</h1>

      @if (id() && course() === null) {
        <p class="alert-error mt-4">El curso no existe.</p>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="card mt-6 grid gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label for="name" class="label">Nombre *</label>
            <input id="name" formControlName="name" class="input" [attr.aria-invalid]="invalid('name')" aria-describedby="name-error" />
            @if (invalid('name')) {
              <p id="name-error" class="error">Ingresa el nombre (máx. 100 caracteres).</p>
            }
          </div>
          <div class="sm:col-span-2">
            <label for="description" class="label">Descripción</label>
            <textarea id="description" formControlName="description" rows="3" class="input"></textarea>
          </div>
          <div>
            <label for="courseCode" class="label">Código *</label>
            <input id="courseCode" formControlName="courseCode" placeholder="DS-2026-01" class="input"
              [attr.aria-invalid]="invalid('courseCode')" aria-describedby="code-error" />
            @if (invalid('courseCode')) {
              <p id="code-error" class="error">2 a 20 caracteres: letras, números o guiones.</p>
            }
          </div>
          <div>
            <label for="section" class="label">Sección *</label>
            <input id="section" formControlName="section" placeholder="A" class="input"
              [attr.aria-invalid]="invalid('section')" aria-describedby="section-error" />
            @if (invalid('section')) {
              <p id="section-error" class="error">Ingresa la sección (máx. 10 caracteres).</p>
            }
          </div>
          <div>
            <label for="status" class="label">Estado *</label>
            <select id="status" formControlName="status" class="input">
              @for (s of statuses; track s) {
                <option [value]="s">{{ statusLabels[s] }}</option>
              }
            </select>
          </div>

          <fieldset class="sm:col-span-2">
            <legend class="label">Docente(s)</legend>
            <div class="mt-1 max-h-56 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2">
              @for (t of activeTeachers(); track t.uid) {
                <label class="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50">
                  <input type="checkbox" [checked]="selected().has(t.uid)" (change)="toggleTeacher(t.uid)" />
                  {{ name(t) }} <span class="text-xs text-gray-500">{{ t.email }}</span>
                </label>
              } @empty {
                <p class="px-2 py-1 text-sm text-gray-500">No hay docentes activos registrados.</p>
              }
            </div>
          </fieldset>

          @if (error()) {
            <p role="alert" class="alert-error sm:col-span-2">{{ error() }}</p>
          }

          <div class="flex justify-end gap-3 sm:col-span-2">
            <a routerLink="/courses" class="btn btn-secondary">Cancelar</a>
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </form>
      }
    </div>
  `,
})
export class CourseForm {
  /** Parámetro :id (solo al editar). */
  readonly id = input<string>();

  private readonly courseService = inject(CourseService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly scope = inject(AcademicScopeService);

  protected readonly statuses = COURSE_STATUSES;
  protected readonly statusLabels = COURSE_STATUS_LABELS;
  protected readonly name = fullName;

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly selected = signal(new Set<string>());

  private readonly teachers = toSignal(this.scope.teachers$, { initialValue: [] });
  protected readonly activeTeachers = computed(() =>
    this.teachers().filter((t) => t.status === 'ACTIVE' || this.selected().has(t.uid)),
  );

  protected readonly course = toSignal(
    toObservable(this.id).pipe(
      switchMap((id) => (id ? this.courseService.getById(id).pipe(catchError(() => of(null))) : of(undefined))),
    ),
    { initialValue: undefined as Course | null | undefined },
  );

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', [Validators.maxLength(500)]],
    courseCode: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9-]{2,20}$/)]],
    section: ['', [Validators.required, Validators.maxLength(10)]],
    status: this.fb.control<CourseStatus>('ACTIVE'),
  });

  private loadedId: string | null = null;

  constructor() {
    // Carga los datos una sola vez por curso para no pisar lo que el usuario está editando.
    effect(() => {
      const course = this.course();
      if (!course || this.loadedId === course.id) return;
      this.loadedId = course.id;
      this.form.reset({
        name: course.name,
        description: course.description,
        courseCode: course.courseCode,
        section: course.section,
        status: course.status,
      });
      this.selected.set(new Set(course.teacherIds));
    });
  }

  protected invalid(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  protected toggleTeacher(uid: string): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  async submit(): Promise<void> {
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revisa los campos marcados.');
      return;
    }
    this.saving.set(true);
    try {
      const input = { ...this.form.getRawValue(), teacherIds: [...this.selected()] };
      const course = this.course();
      let id: string;
      if (course) {
        await this.courseService.update(course, input);
        id = course.id;
      } else {
        id = await this.courseService.create(input);
      }
      await this.router.navigate(['/courses', id]);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }
}
