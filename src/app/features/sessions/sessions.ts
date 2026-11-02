import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { courseLabel } from '../../core/models/course.model';
import {
  ClassSession,
  SESSION_STATUSES,
  SESSION_STATUS_BADGE,
  SESSION_STATUS_LABELS,
  SessionStatus,
} from '../../core/models/session.model';
import { AcademicScopeService } from '../../core/services/academic-scope.service';
import { errorMessage } from '../../core/services/error-message';
import { SessionService } from '../../core/services/session.service';
import { SettingsService } from '../../core/services/settings.service';
import { TsDatePipe } from '../../shared/pipes/ts-date.pipe';

/** Fecha local en formato de <input type="datetime-local">. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** W10 — Crear y administrar sesiones. */
@Component({
  selector: 'app-sessions',
  imports: [ReactiveFormsModule, RouterLink, DatePipe, TsDatePipe],
  template: `
    <h1 class="page-title">Sesiones</h1>
    <p class="page-subtitle">Crea sesiones para tus cursos, muestra el QR y ciérralas al terminar.</p>

    @if (error() || scope.error()) {
      <p role="alert" class="alert-error mt-4">{{ error() || scope.error() }}</p>
    }
    @if (message()) {
      <p role="status" class="alert-success mt-4">{{ message() }}</p>
    }

    <div class="mt-6 grid gap-4 lg:grid-cols-3">
      <!-- Crear sesión -->
      <section class="card" aria-labelledby="create-title">
        <h2 id="create-title" class="font-medium text-gray-900">Crear sesión</h2>
        <form [formGroup]="form" (ngSubmit)="create()" novalidate class="mt-3 space-y-3">
          <div>
            <label for="courseId" class="label">Curso asignado *</label>
            <select id="courseId" formControlName="courseId" class="input" [attr.aria-invalid]="invalid('courseId')">
              <option value="" disabled>Selecciona</option>
              @for (c of activeCourses(); track c.id) {
                <option [value]="c.id">{{ label(c) }}</option>
              }
            </select>
          </div>
          <div>
            <label for="title" class="label">Título o tema *</label>
            <input id="title" formControlName="title" placeholder="Semana 1 - Introducción" class="input"
              [attr.aria-invalid]="invalid('title')" />
          </div>
          <div>
            <label for="startsAt" class="label">Fecha y hora *</label>
            <input id="startsAt" type="datetime-local" formControlName="startsAt" class="input"
              [attr.aria-invalid]="invalid('startsAt')" />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label for="duration" class="label">Duración (min) *</label>
              <input id="duration" type="number" min="5" max="600" formControlName="durationMinutes" class="input"
                [attr.aria-invalid]="invalid('durationMinutes')" />
            </div>
            <div>
              <label for="lateAfter" class="label">Tardanza tras (min)</label>
              <input id="lateAfter" type="number" min="0" max="600" formControlName="lateAfterMinutes" class="input"
                aria-describedby="late-help" [attr.aria-invalid]="invalid('lateAfterMinutes')" />
            </div>
          </div>
          <p id="late-help" class="text-xs text-gray-500">Vacío = sin control de tardanza.</p>
          <button type="submit" class="btn btn-primary w-full" [disabled]="busy()">Crear sesión</button>
        </form>
      </section>

      <!-- Lista -->
      <section class="lg:col-span-2" aria-labelledby="list-title">
        <h2 id="list-title" class="sr-only">Sesiones</h2>
        <div class="card grid gap-3 sm:grid-cols-2">
          <div>
            <label for="f-course" class="label">Curso</label>
            <select id="f-course" class="input" #fc (change)="filterCourse.set(fc.value)">
              <option value="">Todos</option>
              @for (c of courses(); track c.id) {
                <option [value]="c.id">{{ label(c) }}</option>
              }
            </select>
          </div>
          <div>
            <label for="f-status" class="label">Estado</label>
            <select id="f-status" class="input" #fs (change)="filterStatus.set($any(fs.value))">
              <option value="">Todos</option>
              @for (s of statuses; track s) {
                <option [value]="s">{{ statusLabels[s] }}</option>
              }
            </select>
          </div>
        </div>

        <div class="table-wrap mt-4">
          <table class="table">
            <thead>
              <tr>
                <th scope="col">Curso</th>
                <th scope="col">Tema</th>
                <th scope="col">Inicio</th>
                <th scope="col">Fin</th>
                <th scope="col">Estado</th>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              @for (s of filtered(); track s.id) {
                <tr>
                  <td>{{ courseName(s.courseId) }}</td>
                  <td class="font-medium text-gray-900">{{ s.title }}</td>
                  <td class="whitespace-nowrap">{{ s.startsAt | tsDate | date: 'dd/MM/yyyy HH:mm' }}</td>
                  <td class="whitespace-nowrap">{{ s.expiresAt | tsDate | date: 'HH:mm' }}</td>
                  <td>
                    <span [class]="statusBadge[s.status]">{{ statusLabels[s.status] }}</span>
                    @if (isExpired(s)) {
                      <span class="badge badge-yellow ml-1">Hora vencida</span>
                    }
                  </td>
                  <td>
                    <div class="flex justify-end gap-2">
                      <a routerLink="/live-attendance" [queryParams]="{ sessionId: s.id }" class="btn btn-secondary btn-sm">
                        {{ s.status === 'ACTIVE' ? 'QR / En vivo' : 'Ver asistencia' }}
                      </a>
                      @if (s.status === 'ACTIVE') {
                        <button type="button" class="btn btn-danger btn-sm" [disabled]="busy()" (click)="close(s)">Cerrar</button>
                      }
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="text-center text-gray-500">Sin sesiones.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `,
})
export class Sessions {
  readonly courseIdParam = input<string | undefined>(undefined, { alias: 'courseId' });

  protected readonly scope = inject(AcademicScopeService);
  private readonly sessionService = inject(SessionService);
  private readonly settings = inject(SettingsService).settings;
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly label = courseLabel;
  protected readonly statuses = SESSION_STATUSES;
  protected readonly statusLabels = SESSION_STATUS_LABELS;
  protected readonly statusBadge = SESSION_STATUS_BADGE;

  protected readonly courses = toSignal(this.scope.courses$, { initialValue: [] });
  private readonly sessions = toSignal(this.scope.sessions$, { initialValue: [] as ClassSession[] });

  protected readonly activeCourses = computed(() => this.courses().filter((c) => c.status === 'ACTIVE'));
  protected readonly filterCourse = signal('');
  protected readonly filterStatus = signal<SessionStatus | ''>('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  private readonly now = signal(Date.now());

  protected readonly form = this.fb.group({
    courseId: ['', Validators.required],
    title: ['', [Validators.required, Validators.maxLength(120)]],
    startsAt: [toLocalInput(new Date()), Validators.required],
    durationMinutes: [90, [Validators.required, Validators.min(5), Validators.max(600)]],
    lateAfterMinutes: this.fb.control<number | null>(15, [Validators.min(0), Validators.max(600)]),
  });

  constructor() {
    effect(() => {
      const preset = this.courseIdParam();
      if (preset) this.form.controls.courseId.setValue(preset);
    });
    // Valores por defecto desde Configuración (solo si el usuario no los tocó).
    effect(() => {
      const s = this.settings();
      if (this.form.controls.durationMinutes.pristine) this.form.controls.durationMinutes.setValue(s.defaultSessionMinutes);
      if (this.form.controls.lateAfterMinutes.pristine) this.form.controls.lateAfterMinutes.setValue(s.defaultLateAfterMinutes);
    });
  }

  protected readonly filtered = computed(() =>
    this.sessions().filter(
      (s) =>
        (!this.filterCourse() || s.courseId === this.filterCourse()) &&
        (!this.filterStatus() || s.status === this.filterStatus()),
    ),
  );

  protected courseName(id: string): string {
    return courseLabel(this.courses().find((c) => c.id === id));
  }

  protected isExpired(s: ClassSession): boolean {
    return s.status === 'ACTIVE' && s.expiresAt.toMillis() < this.now();
  }

  protected invalid(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  async create(): Promise<void> {
    this.error.set(null);
    this.message.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revisa los campos de la sesión.');
      return;
    }
    const value = this.form.getRawValue();
    const startsAt = new Date(value.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      this.error.set('La fecha y hora no es válida.');
      return;
    }
    if (value.lateAfterMinutes != null && value.lateAfterMinutes > value.durationMinutes) {
      this.error.set('La tardanza no puede superar la duración de la sesión.');
      return;
    }
    this.busy.set(true);
    try {
      const id = await this.sessionService.create({
        courseId: value.courseId,
        title: value.title,
        startsAt,
        durationMinutes: value.durationMinutes,
        lateAfterMinutes: value.lateAfterMinutes ?? null,
      });
      this.form.controls.title.reset('');
      await this.router.navigate(['/live-attendance'], { queryParams: { sessionId: id } });
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  async close(session: ClassSession): Promise<void> {
    if (!window.confirm(`¿Cerrar la sesión "${session.title}"? Ya no se podrá registrar asistencia por QR.`)) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.sessionService.close(session);
      this.message.set('Sesión cerrada.');
      this.now.set(Date.now());
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
