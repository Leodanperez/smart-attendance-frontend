import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';

import {
  COURSE_STATUSES,
  COURSE_STATUS_LABELS,
  Course,
  CourseStatus,
  ScheduleBlock,
  WEEK_DAYS,
  WEEK_DAY_LABELS,
  WeekDay,
  courseCodePreview,
} from '../../core/models/course.model';
import { PERIOD_STATUS_LABELS } from '../../core/models/academic-period.model';
import { Career, semesterLabel, semesterOptions } from '../../core/models/career.model';
import { AcademicPeriodService } from '../../core/services/academic-period.service';
import { fullName } from '../../core/models/user.model';
import { AcademicScopeService } from '../../core/services/academic-scope.service';
import { CareerService } from '../../core/services/career.service';
import { CourseService } from '../../core/services/course.service';
import { errorMessage } from '../../core/services/error-message';
import { ToastService } from '../../shared/toast/toast.service';

/** Formulario de curso (crear / editar). */
@Component({
  selector: 'app-course-form',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="mx-auto max-w-3xl">
      <a routerLink="/courses" class="text-sm text-primary hover:underline">← Volver a cursos</a>
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
            <label for="courseCode" class="label">Código {{ course() ? '' : '(se genera al guardar)' }}</label>
            <output id="courseCode" aria-live="polite" aria-describedby="code-help"
              class="input block bg-primary-fixed/50 font-mono font-semibold text-primary">
              {{ course()?.courseCode ?? codePreview() }}
            </output>
            <p id="code-help" class="hint">
              @if (course()) {
                El código no cambia al editar.
              } @else {
                Vista previa. Al guardar, los <code>####</code> se reemplazan por un número aleatorio único (ej. {{ codeExample() }}).
              }
            </p>
          </div>
          <div>
            <label for="periodId" class="label">Periodo académico *</label>
            <select id="periodId" formControlName="academicPeriodId" class="input"
              [attr.aria-invalid]="invalid('academicPeriodId')" aria-describedby="period-error">
              <option value="" disabled>Selecciona un periodo</option>
              @for (p of periodOptions(); track p.id) {
                <option [value]="p.id">{{ p.name }} · {{ periodStatusLabels[p.status] }}</option>
              }
            </select>
            @if (invalid('academicPeriodId')) {
              <p id="period-error" class="error">Selecciona el periodo en que se dicta.</p>
            } @else if (!periodOptions().length) {
              <p id="period-error" class="hint">
                No hay periodos abiertos. <a routerLink="/academic-periods" class="text-primary hover:underline">Crea el periodo</a>.
              </p>
            }
          </div>
          <div>
            <label for="careerId" class="label">Carrera *</label>
            <select id="careerId" formControlName="careerId" class="input"
              [attr.aria-invalid]="invalid('careerId')" aria-describedby="career-error">
              <option value="" disabled>Selecciona una carrera</option>
              @for (c of careerOptions(); track c.id) {
                <option [value]="c.id">{{ c.code }} · {{ c.name }}{{ c.status === 'INACTIVE' ? ' (inactiva)' : '' }}</option>
              }
            </select>
            @if (invalid('careerId')) {
              <p id="career-error" class="error">Selecciona la carrera del curso.</p>
            } @else if (!careerOptions().length) {
              <p id="career-error" class="hint">
                No hay carreras activas. <a routerLink="/careers" class="text-primary hover:underline">Crea una carrera</a>.
              </p>
            }
          </div>
          <div>
            <label for="semester" class="label">Ciclo *</label>
            <select id="semester" formControlName="semester" class="input"
              [attr.aria-invalid]="invalid('semester')" aria-describedby="semester-error">
              <option [ngValue]="null" disabled>Selecciona</option>
              @for (n of semesters(); track n) {
                <option [ngValue]="n">{{ semesterLabel(n) }}</option>
              }
            </select>
            @if (invalid('semester')) {
              <p id="semester-error" class="error">Selecciona el ciclo en que se dicta.</p>
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
            <div class="mt-1 max-h-56 space-y-1 overflow-y-auto rounded-md border border-outline-variant p-2">
              @for (t of activeTeachers(); track t.uid) {
                <label class="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-surface-container-low">
                  <input type="checkbox" [checked]="selected().has(t.uid)" (change)="toggleTeacher(t.uid)" />
                  {{ name(t) }} <span class="text-xs text-on-surface-variant">{{ t.email }}</span>
                </label>
              } @empty {
                <p class="px-2 py-1 text-sm text-on-surface-variant">No hay docentes activos registrados.</p>
              }
            </div>
          </fieldset>

          <fieldset class="sm:col-span-2">
            <legend class="label">Horario semanal</legend>
            <p class="hint mb-2">Agrega los bloques en que se dicta el curso (día y rango de horas).</p>
            <div class="space-y-2">
              @for (block of schedule(); track $index) {
                <div class="flex flex-wrap items-end gap-2 rounded-md border border-outline-variant p-2">
                  <div class="min-w-32 flex-1">
                    <label class="label text-xs" [attr.for]="'sch-day-' + $index">Día</label>
                    <select [id]="'sch-day-' + $index" class="input" [value]="block.day"
                      (change)="updateBlock($index, 'day', $any($event.target).value)">
                      @for (d of weekDays; track d) {
                        <option [value]="d">{{ weekDayLabels[d] }}</option>
                      }
                    </select>
                  </div>
                  <div class="w-28">
                    <label class="label text-xs" [attr.for]="'sch-start-' + $index">Inicio</label>
                    <input [id]="'sch-start-' + $index" type="time" class="input" [value]="block.start"
                      (change)="updateBlock($index, 'start', $any($event.target).value)" />
                  </div>
                  <div class="w-28">
                    <label class="label text-xs" [attr.for]="'sch-end-' + $index">Fin</label>
                    <input [id]="'sch-end-' + $index" type="time" class="input" [value]="block.end"
                      (change)="updateBlock($index, 'end', $any($event.target).value)" />
                  </div>
                  <button type="button" class="btn btn-secondary" (click)="removeBlock($index)">Quitar</button>
                </div>
              } @empty {
                <p class="text-sm text-on-surface-variant">Sin horario definido.</p>
              }
            </div>
            <button type="button" class="btn btn-secondary mt-2" (click)="addBlock()">+ Agregar bloque</button>
            @if (scheduleError()) {
              <p class="error mt-1">{{ scheduleError() }}</p>
            }
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
  private readonly careerService = inject(CareerService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly scope = inject(AcademicScopeService);

  protected readonly statuses = COURSE_STATUSES;
  protected readonly statusLabels = COURSE_STATUS_LABELS;
  protected readonly name = fullName;

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly selected = signal(new Set<string>());
  protected readonly schedule = signal<ScheduleBlock[]>([]);
  protected readonly scheduleError = signal<string | null>(null);

  protected readonly weekDays = WEEK_DAYS;
  protected readonly weekDayLabels = WEEK_DAY_LABELS;

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
    academicPeriodId: ['', Validators.required],
    careerId: ['', Validators.required],
    semester: this.fb.control<number | null>(null, Validators.required),
    section: ['', [Validators.required, Validators.maxLength(10)]],
    status: this.fb.control<CourseStatus>('ACTIVE'),
  });

  protected readonly semesterLabel = semesterLabel;
  protected readonly periodStatusLabels = PERIOD_STATUS_LABELS;
  private readonly periods = inject(AcademicPeriodService).periods;
  /** Periodos no cerrados + el actual del curso. */
  protected readonly periodOptions = computed(() =>
    this.periods().filter((p) => p.status !== 'CLOSED' || p.id === this.course()?.academicPeriodId),
  );
  private readonly careers = toSignal(this.careerService.getAll().pipe(catchError(() => of([] as Career[]))), {
    initialValue: [] as Career[],
  });
  private readonly careerIdValue = toSignal(this.form.controls.careerId.valueChanges, { initialValue: '' });
  /** Activas + la actual del curso (aunque esté inactiva) para no perderla al editar. */
  protected readonly careerOptions = computed(() =>
    this.careers().filter((c) => c.status === 'ACTIVE' || c.id === this.course()?.careerId),
  );
  private readonly selectedCareer = computed(() => this.careers().find((c) => c.id === this.careerIdValue()));
  protected readonly semesters = computed(() => semesterOptions(this.selectedCareer()));

  /** Nombre en vivo para la vista previa del código (IGS-2026-####). */
  private readonly nameValue = toSignal(this.form.controls.name.valueChanges, { initialValue: '' });
  protected readonly codePreview = computed(() =>
    this.nameValue().trim() ? courseCodePreview(this.nameValue()) : 'Escribe el nombre del curso',
  );
  /** Ejemplo con un número concreto, para que se entienda que #### es aleatorio. */
  protected readonly codeExample = computed(() =>
    this.nameValue().trim() ? courseCodePreview(this.nameValue()).replace('####', '4821') : 'IGS-2026-4821',
  );

  private loadedId: string | null = null;

  constructor() {
    // Curso nuevo: preselecciona el periodo en curso.
    effect(() => {
      if (this.id()) return;
      const active = this.periods().find((p) => p.status === 'ACTIVE');
      const control = this.form.controls.academicPeriodId;
      if (active && !control.value) control.setValue(active.id);
    });
    // Carga los datos una sola vez por curso para no pisar lo que el usuario está editando.
    effect(() => {
      const course = this.course();
      if (!course || this.loadedId === course.id) return;
      this.loadedId = course.id;
      this.form.reset({
        name: course.name,
        description: course.description,
        academicPeriodId: course.academicPeriodId ?? '',
        careerId: course.careerId ?? '',
        semester: course.semester,
        section: course.section,
        status: course.status,
      });
      this.selected.set(new Set(course.teacherIds));
      this.schedule.set(course.schedule.map((b) => ({ ...b })));
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

  protected addBlock(): void {
    this.scheduleError.set(null);
    this.schedule.update((list) => [...list, { day: 'MON', start: '08:00', end: '10:00' }]);
  }

  protected removeBlock(index: number): void {
    this.scheduleError.set(null);
    this.schedule.update((list) => list.filter((_, i) => i !== index));
  }

  protected updateBlock(index: number, field: keyof ScheduleBlock, value: string): void {
    this.scheduleError.set(null);
    this.schedule.update((list) =>
      list.map((b, i) => (i === index ? { ...b, [field]: field === 'day' ? (value as WeekDay) : value } : b)),
    );
  }

  async submit(): Promise<void> {
    this.error.set(null);
    this.scheduleError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revisa los campos marcados.');
      return;
    }
    const badBlock = this.schedule().find((b) => !b.start || !b.end || b.start >= b.end);
    if (badBlock) {
      this.scheduleError.set('Cada bloque necesita hora de inicio y fin, y el inicio debe ser antes del fin.');
      this.error.set('Revisa el horario.');
      return;
    }
    this.saving.set(true);
    try {
      const value = this.form.getRawValue();
      const career = this.careers().find((c) => c.id === value.careerId);
      if (!career) throw { code: 'app/not-found' };
      if (value.semester == null || value.semester > career.durationSemesters) {
        this.form.controls.semester.setErrors({ range: true });
        this.form.controls.semester.markAsTouched();
        this.error.set(`${career.name} tiene ${career.durationSemesters} ciclos.`);
        return;
      }
      const period = this.periods().find((p) => p.id === value.academicPeriodId);
      if (!period) throw { code: 'app/not-found' };
      if (period.status === 'CLOSED' && period.id !== this.course()?.academicPeriodId) throw { code: 'app/period-closed' };
      const input = {
        ...value,
        semester: value.semester,
        academicPeriodName: period.name,
        careerName: career.name,
        teacherIds: [...this.selected()],
        schedule: this.schedule(),
      };
      const course = this.course();
      let id: string;
      if (course) {
        await this.courseService.update(course, input);
        id = course.id;
        this.toast.success(`Se guardaron los cambios de ${input.name}.`, { title: 'Curso actualizado' });
      } else {
        const created = await this.courseService.create(input);
        id = created.id;
        this.toast.success(`${input.name} · ${created.courseCode} (${period.name}).`, { title: 'Curso creado' });
      }
      await this.router.navigate(['/courses', id]);
    } catch (e) {
      this.toast.error(errorMessage(e), { title: 'No se pudo guardar el curso' });
    } finally {
      this.saving.set(false);
    }
  }
}
