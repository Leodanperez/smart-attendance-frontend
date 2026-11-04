import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
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
import { DialogService } from '../../shared/dialogs/dialog.service';
import { TsDatePipe } from '../../shared/pipes/ts-date.pipe';
import { ToastService } from '../../shared/toast/toast.service';

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
    <header>
      <h1 class="page-title">Sesiones</h1>
      <p class="page-subtitle">Crea sesiones para tus cursos, muestra el QR y ciérralas al terminar.</p>
    </header>

    @if (error() || scope.error()) {
      <p role="alert" class="alert-error mt-4">{{ error() || scope.error() }}</p>
    }
    @if (message()) {
      <p role="status" class="alert-success mt-4">{{ message() }}</p>
    }

    <div class="mt-8 grid items-start gap-6 lg:grid-cols-[22rem_1fr]">
      <!-- Crear sesión -->
      <section
        class="rounded-3xl border border-outline-variant/60 bg-surface-container p-5 shadow-sm lg:sticky lg:top-4"
        aria-labelledby="create-title"
      >
        <h2 id="create-title" class="text-base font-semibold tracking-tight text-on-surface">Crear sesión</h2>
        <p class="mt-1 text-sm text-on-surface-variant">Al crearla pasarás directo al QR en vivo.</p>

        <form [formGroup]="form" (ngSubmit)="create()" novalidate class="mt-5 space-y-4">
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
          <div class="grid grid-cols-2 gap-3">
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
          <p id="late-help" class="-mt-2 text-xs text-on-surface-variant">Vacío = sin control de tardanza.</p>

          @if (endPreview(); as end) {
            <div class="flex items-start gap-3 rounded-2xl bg-primary-fixed p-3">
              <span aria-hidden="true" class="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
                </svg>
              </span>
              <p class="text-sm text-on-surface">
                Fin de la sesión: <strong class="font-semibold">{{ end | date: 'dd/MM/yyyy HH:mm' }}</strong>
                <span class="mt-0.5 block text-xs text-on-surface-variant">Al llegar esta hora ciérrala para marcar faltas a quienes no registraron.</span>
              </p>
            </div>
          }

          <button type="submit" class="btn btn-primary w-full" [disabled]="busy()">Crear sesión</button>
        </form>
      </section>

      <!-- Lista -->
      <section aria-labelledby="list-title">
        <h2 id="list-title" class="sr-only">Sesiones</h2>

        <div class="grid gap-4 rounded-3xl border border-outline-variant/60 bg-surface-container p-5 shadow-sm sm:grid-cols-2">
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

        <p class="mt-4 px-1 text-sm text-on-surface-variant">
          {{ filtered().length }} sesión(es)
        </p>

        <!-- Tabla (escritorio) -->
        <div class="table-wrap mt-2 hidden overflow-hidden rounded-3xl border border-outline-variant/60 shadow-sm md:block">
          <table class="table">
            <thead>
              <tr>
                <th scope="col">Sesión</th>
                <th scope="col">Inicio</th>
                <th scope="col">Fin</th>
                <th scope="col">Estado</th>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              @for (s of filtered(); track s.id) {
                <tr>
                  <td>
                    <p class="font-medium text-on-surface">{{ s.title }}</p>
                    <p class="text-xs text-on-surface-variant">{{ courseName(s.courseId) }}</p>
                  </td>
                  <td class="whitespace-nowrap">{{ s.startsAt | tsDate | date: 'dd/MM/yyyy HH:mm' }}</td>
                  <td class="whitespace-nowrap">{{ s.expiresAt | tsDate | date: 'HH:mm' }}</td>
                  <td>
                    <div class="flex flex-wrap items-center gap-1.5">
                      @if (s.status === 'ACTIVE') {
                        <span aria-hidden="true" class="relative flex size-2">
                          <span class="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none"></span>
                          <span class="relative inline-flex size-2 rounded-full bg-primary"></span>
                        </span>
                      }
                      <span [class]="statusBadge[s.status]">{{ statusLabels[s.status] }}</span>
                      @if (isExpired(s)) {
                        <span class="badge badge-yellow">Hora vencida</span>
                      }
                    </div>
                  </td>
                  <td>
                    <div class="flex justify-end gap-2">
                      <a routerLink="/live-attendance" [queryParams]="{ sessionId: s.id }"
                        [class]="s.status === 'ACTIVE' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'">
                        {{ s.status === 'ACTIVE' ? 'QR / En vivo' : 'Ver asistencia' }}
                      </a>
                      @if (s.status === 'ACTIVE') {
                        <button type="button" class="btn btn-danger btn-sm" [disabled]="busy()" (click)="close(s)">Cerrar</button>
                      }
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="py-12 text-center text-on-surface-variant">No hay sesiones con ese filtro.</td></tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Tarjetas (móvil) -->
        <ul class="mt-2 space-y-3 md:hidden">
          @for (s of filtered(); track s.id) {
            <li class="rounded-2xl border border-outline-variant/60 bg-surface-container p-4 shadow-sm">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate font-medium text-on-surface">{{ s.title }}</p>
                  <p class="truncate text-xs text-on-surface-variant">{{ courseName(s.courseId) }}</p>
                </div>
                <div class="flex shrink-0 flex-col items-end gap-1">
                  <span class="inline-flex items-center gap-1.5">
                    @if (s.status === 'ACTIVE') {
                      <span aria-hidden="true" class="relative flex size-2">
                        <span class="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none"></span>
                        <span class="relative inline-flex size-2 rounded-full bg-primary"></span>
                      </span>
                    }
                    <span [class]="statusBadge[s.status]">{{ statusLabels[s.status] }}</span>
                  </span>
                  @if (isExpired(s)) {
                    <span class="badge badge-yellow">Hora vencida</span>
                  }
                </div>
              </div>
              <p class="mt-3 flex items-center gap-1.5 text-xs text-on-surface-variant">
                <svg aria-hidden="true" class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
                </svg>
                {{ s.startsAt | tsDate | date: 'dd/MM/yyyy HH:mm' }} – {{ s.expiresAt | tsDate | date: 'HH:mm' }}
              </p>
              <div class="mt-3 flex flex-wrap justify-end gap-2 border-t border-outline-variant/50 pt-3">
                <a routerLink="/live-attendance" [queryParams]="{ sessionId: s.id }"
                  [class]="s.status === 'ACTIVE' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'">
                  {{ s.status === 'ACTIVE' ? 'QR / En vivo' : 'Ver asistencia' }}
                </a>
                @if (s.status === 'ACTIVE') {
                  <button type="button" class="btn btn-danger btn-sm" [disabled]="busy()" (click)="close(s)">Cerrar</button>
                }
              </div>
            </li>
          } @empty {
            <li class="rounded-2xl border border-dashed border-outline-variant px-4 py-10 text-center text-sm text-on-surface-variant">
              No hay sesiones con ese filtro.
            </li>
          }
        </ul>
      </section>
    </div>
  `,
})
export class Sessions {
  readonly courseIdParam = input<string | undefined>(undefined, { alias: 'courseId' });

  protected readonly scope = inject(AcademicScopeService);
  private readonly sessionService = inject(SessionService);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly settings = inject(SettingsService).settings;
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly label = courseLabel;
  protected readonly statuses = SESSION_STATUSES;
  protected readonly statusLabels = SESSION_STATUS_LABELS;
  protected readonly statusBadge = SESSION_STATUS_BADGE;

  protected readonly courses = toSignal(this.scope.courses$, { initialValue: [] });
  private readonly sessions = toSignal(this.scope.sessions$, { initialValue: [] as ClassSession[] });
  private readonly enrollments = toSignal(this.scope.enrollments$, { initialValue: [] });
  private readonly attendances = toSignal(this.scope.attendances$, { initialValue: [] });

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

  private readonly startsAtValue = toSignal(this.form.controls.startsAt.valueChanges, {
    initialValue: this.form.controls.startsAt.value,
  });
  private readonly durationValue = toSignal(this.form.controls.durationMinutes.valueChanges, {
    initialValue: this.form.controls.durationMinutes.value,
  });

  /** Fecha/hora fin calculada (inicio + duración) para mostrarla en el formulario. */
  protected readonly endPreview = computed<Date | null>(() => {
    const start = new Date(this.startsAtValue());
    const minutes = this.durationValue();
    if (Number.isNaN(start.getTime()) || !minutes || minutes <= 0) return null;
    return new Date(start.getTime() + minutes * 60_000);
  });

  /** Sesiones ya cerradas automáticamente en esta visita (evita reintentos en cada recálculo). */
  private readonly autoClosed = new Set<string>();

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
    // Refresca "ahora" cada 30 s para detectar vencimientos mientras el docente mira la lista.
    const timer = setInterval(() => this.now.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    // Cierre diferido: al entrar, cierra y marca faltas en sesiones ACTIVE cuya hora fin ya pasó.
    // Sin Cloud Functions esto ocurre cuando el docente abre el panel (no al segundo exacto del fin).
    effect(() => {
      const nowMs = this.now();
      for (const s of this.sessions()) {
        if (s.status === 'ACTIVE' && s.expiresAt.toMillis() < nowMs && !this.autoClosed.has(s.id)) {
          this.autoClosed.add(s.id);
          void this.autoClose(s);
        }
      }
    });
  }

  /** Cierra automáticamente una sesión vencida y marca faltas (cierre diferido). */
  private async autoClose(session: ClassSession): Promise<void> {
    try {
      await this.sessionService.closeAndMarkAbsent(session, this.absentStudentIds(session));
      this.toast.info(`"${session.title}" venció y se cerró automáticamente. Se marcaron las faltas.`, {
        title: 'Sesión cerrada',
      });
    } catch {
      // Si falla (p. ej. permisos o ya cerrada por otro), se reintenta en la próxima visita.
      this.autoClosed.delete(session.id);
    }
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
      this.toast.success(`${value.title.trim()} · ${this.courseName(value.courseId)}. Ya puedes mostrar el QR.`, {
        title: 'Sesión creada',
      });
      await this.router.navigate(['/live-attendance'], { queryParams: { sessionId: id } });
    } catch (e) {
      this.toast.error(errorMessage(e), { title: 'No se pudo crear la sesión' });
    } finally {
      this.busy.set(false);
    }
  }

  /** Inscritos ACTIVE del curso sin registro de asistencia en la sesión → faltas al cerrar. */
  private absentStudentIds(session: ClassSession): string[] {
    const registered = new Set(
      this.attendances()
        .filter((a) => a.sessionId === session.id)
        .map((a) => a.studentId),
    );
    return this.enrollments()
      .filter((e) => e.courseId === session.courseId && e.status === 'ACTIVE' && !registered.has(e.studentId))
      .map((e) => e.studentId);
  }

  async close(session: ClassSession): Promise<void> {
    const absentIds = this.absentStudentIds(session);
    const ok = await this.dialogs.confirm({
      title: 'Cerrar sesión y marcar faltas',
      message:
        absentIds.length > 0
          ? `"${session.title}" se cerrará. ${absentIds.length} estudiante(s) sin registro quedarán marcados como falta. Podrás corregir con un motivo después.`
          : `"${session.title}" se cerrará y ya no se podrá registrar asistencia por QR.`,
      confirmText: 'Cerrar y marcar faltas',
      tone: 'danger',
    });
    if (!ok) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.sessionService.closeAndMarkAbsent(session, absentIds);
      this.toast.success(
        absentIds.length > 0
          ? `"${session.title}" se cerró. ${absentIds.length} falta(s) registrada(s).`
          : `"${session.title}" se cerró. Ya no se registra asistencia por QR.`,
        { title: 'Sesión cerrada' },
      );
      this.now.set(Date.now());
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
