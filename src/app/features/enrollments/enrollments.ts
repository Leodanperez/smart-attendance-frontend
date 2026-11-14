import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of, switchMap } from 'rxjs';

import { courseLabel, SHIFT_LABELS } from '../../core/models/course.model';
import {
  ENROLLMENT_STATUS_LABELS,
  Enrollment,
  EnrollmentCode,
} from '../../core/models/enrollment.model';
import { semesterLabel } from '../../core/models/career.model';
import { fullName } from '../../core/models/user.model';
import { AcademicScopeService } from '../../core/services/academic-scope.service';
import { EnrollmentService } from '../../core/services/enrollment.service';
import { errorMessage } from '../../core/services/error-message';
import { tsMillis, tsToDate } from '../../core/services/firestore.utils';
import { CoursePicker } from '../../shared/components/course-picker';
import { StudentPicker } from '../../shared/components/student-picker';
import { TsDatePipe } from '../../shared/pipes/ts-date.pipe';
import { downloadCsv, fileDate } from '../../shared/utils/csv';
import { DialogService } from '../../shared/dialogs/dialog.service';
import { ToastService } from '../../shared/toast/toast.service';

/** W07 — Inscripciones y códigos. */
@Component({
  selector: 'app-enrollments',
  imports: [ReactiveFormsModule, DatePipe, TsDatePipe, CoursePicker, StudentPicker],
  template: `
    <header>
      <h1 class="page-title">Inscripciones</h1>
      <p class="page-subtitle">Genera códigos de inscripción y consulta los estudiantes inscritos por curso.</p>
    </header>

    <div class="mt-8 rounded-3xl border border-outline-variant/60 bg-surface-container p-5 shadow-sm">
      <app-course-picker [courses]="courses()" [selected]="courseId() ? [courseId()] : []"
        label="Seleccionar curso" placeholder="Buscar y seleccionar un curso…"
        (selectedChange)="onCoursePicked($event)" />
    </div>

    @if (error()) {
      <p role="alert" class="alert-error mt-4">{{ error() }}</p>
    }
    @if (message()) {
      <p role="status" class="alert-success mt-4">{{ message() }}</p>
    }

    @if (courseId()) {
      <!-- Código generado: se muestra una sola vez -->
      @if (generatedCode()) {
        <div class="mt-6 overflow-hidden rounded-3xl border border-primary/30 bg-primary-fixed p-6 shadow-sm" role="status">
          <div class="flex items-start gap-3">
            <span aria-hidden="true" class="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              </svg>
            </span>
            <div>
              <p class="text-sm font-semibold text-on-surface">Código generado</p>
              <p class="text-sm text-on-surface-variant">Cópialo ahora: por seguridad no se volverá a mostrar.</p>
            </div>
          </div>
          <div class="mt-4 flex flex-wrap items-center gap-3">
            <span class="rounded-2xl border border-primary/20 bg-surface-container px-6 py-3 font-mono text-3xl font-semibold tracking-[0.3em] text-primary select-all">{{ generatedCode() }}</span>
            <button type="button" class="btn btn-primary btn-sm" (click)="copy()">Copiar</button>
            <button type="button" class="btn btn-secondary btn-sm" (click)="generatedCode.set(null)">Ocultar</button>
          </div>
        </div>
      }

      <div class="mt-6 grid items-start gap-6 lg:grid-cols-[22rem_1fr]">
        <!-- Generar código -->
        <section class="rounded-3xl border border-outline-variant/60 bg-surface-container p-5 shadow-sm" aria-labelledby="gen-title">
          <h2 id="gen-title" class="text-base font-semibold tracking-tight text-on-surface">Generar código de inscripción</h2>
          <p class="mt-1 text-sm text-on-surface-variant">Los estudiantes lo usarán para inscribirse por su cuenta.</p>

          <form [formGroup]="codeForm" (ngSubmit)="generate()" novalidate class="mt-4 space-y-4">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="validDays" class="label">Vigencia (días)</label>
                <input id="validDays" type="number" min="1" max="90" formControlName="validDays" class="input"
                  [attr.aria-invalid]="codeForm.controls.validDays.invalid" />
              </div>
              <div>
                <label for="maxUses" class="label">Límite de usos</label>
                <input id="maxUses" type="number" min="1" max="500" formControlName="maxUses" class="input"
                  [attr.aria-invalid]="codeForm.controls.maxUses.invalid" />
              </div>
            </div>
            <button type="submit" class="btn btn-primary w-full" [disabled]="busy() || codeForm.invalid">Generar código</button>
          </form>

          <hr class="my-6 border-outline-variant/50" />

          <h3 class="text-sm font-semibold text-on-surface">Códigos del curso</h3>
          <ul class="mt-3 space-y-2 text-sm">
            @for (code of codes(); track code.id) {
              <li class="rounded-2xl border border-outline-variant/50 bg-surface-container-high/40 p-3">
                <div class="flex items-center justify-between gap-2">
                  <span [class]="codeBadge(code)">{{ codeStatus(code) }}</span>
                  @if (code.status === 'ACTIVE') {
                    <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="disable(code)">Desactivar</button>
                  }
                </div>

                <div class="mt-3 flex items-center justify-between text-xs text-on-surface-variant">
                  <span>Usos</span>
                  <span class="font-medium text-on-surface">{{ code.uses }}/{{ code.maxUses }}</span>
                </div>
                <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-container-high"
                  role="progressbar" aria-label="Usos del código"
                  [attr.aria-valuenow]="code.uses" aria-valuemin="0" [attr.aria-valuemax]="code.maxUses">
                  <div class="h-full rounded-full bg-primary transition-[width] duration-300"
                    [style.width.%]="code.maxUses ? (code.uses / code.maxUses) * 100 : 0"></div>
                </div>

                <p class="mt-2 text-xs text-on-surface-variant">
                  Vence {{ code.expiresAt | tsDate | date: 'dd/MM/yyyy HH:mm' }}
                </p>
              </li>
            } @empty {
              <li class="rounded-2xl border border-dashed border-outline-variant px-4 py-6 text-center text-on-surface-variant">
                Aún no hay códigos para este curso.
              </li>
            }
          </ul>
        </section>

        <!-- Estudiantes inscritos -->
        <section class="rounded-3xl border border-outline-variant/60 bg-surface-container p-5 shadow-sm" aria-labelledby="enrolled-title">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <h2 id="enrolled-title" class="text-base font-semibold tracking-tight text-on-surface">Estudiantes inscritos</h2>
              <span class="rounded-full bg-primary-fixed px-2.5 py-0.5 text-xs font-semibold text-primary">{{ activeCount() }}</span>
            </div>
            <button type="button" class="btn btn-secondary btn-sm inline-flex items-center gap-1.5" (click)="exportCsv()">
              <svg aria-hidden="true" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              Exportar lista
            </button>
          </div>

          <div class="mt-4 rounded-2xl bg-surface-container-high/40 p-4">
            @if (matchedCount(); as mc) {
              @if (mc.matched === 0) {
                <p class="mb-3 rounded-xl bg-surface-container-high px-4 py-2.5 text-xs text-on-surface-variant">
                  No hay estudiantes sin inscribir que coincidan con el ciclo y turno de este curso.
                </p>
              } @else if (mc.matched < mc.total) {
                <p class="mb-3 rounded-xl bg-primary-fixed px-4 py-2.5 text-xs text-primary">
                  <strong>Mostrando {{ mc.matched }} de {{ mc.total }} estudiantes</strong> que coinciden con la carrera, ciclo y turno del curso.
                </p>
              }
            }
            @for (cid of [courseId()]; track cid) {
              <app-student-picker [students]="enrollable()" [selected]="pendingStudentIds()"
                label="Inscribir estudiantes manualmente" placeholder="Buscar y seleccionar estudiantes activos…"
                [disabled]="busy()" (selectedChange)="studentsToEnroll.set($event)" />
            }
            <div class="mt-3 flex justify-end">
              <button type="button" class="btn btn-primary w-full sm:w-auto"
                [disabled]="busy() || !pendingStudentIds().length" (click)="enrollSelected()">
                {{ pendingStudentIds().length > 1 ? 'Inscribir ' + pendingStudentIds().length + ' estudiantes' : 'Inscribir' }}
              </button>
            </div>
          </div>

          <!-- Tabla (escritorio) -->
          <div class="mt-5 hidden overflow-x-auto rounded-2xl border border-outline-variant/50 md:block">
            <table class="table">
              <thead>
                <tr>
                  <th scope="col">Código</th>
                  <th scope="col">Estudiante</th>
                  <th scope="col">Inscrito</th>
                  <th scope="col">Estado</th>
                  <th scope="col"><span class="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.enrollment.id) {
                  <tr>
                    <td class="font-mono text-xs">{{ row.code || '—' }}</td>
                    <td>
                      <div class="flex items-center gap-3">
                        <span aria-hidden="true" class="grid size-9 shrink-0 place-items-center rounded-full bg-primary-fixed text-xs font-semibold text-primary">{{ initials(row.name) }}</span>
                        <div class="min-w-0">
                          <p class="truncate font-medium text-on-surface">{{ row.name }}</p>
                          <p class="truncate text-xs text-on-surface-variant">{{ row.email }}</p>
                        </div>
                      </div>
                    </td>
                    <td class="whitespace-nowrap">{{ row.enrollment.enrolledAt | tsDate | date: 'dd/MM/yyyy' }}</td>
                    <td>
                      <span [class]="row.enrollment.status === 'ACTIVE' ? 'badge badge-green' : 'badge badge-gray'">{{ enrollmentLabels[row.enrollment.status] }}</span>
                    </td>
                    <td class="text-right">
                      @if (row.enrollment.status === 'ACTIVE') {
                        <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="drop(row.enrollment, row.name)">Retirar</button>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="5" class="py-10 text-center text-on-surface-variant">Sin estudiantes inscritos.</td></tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Tarjetas (móvil) -->
          <ul class="mt-5 space-y-3 md:hidden">
            @for (row of rows(); track row.enrollment.id) {
              <li class="rounded-2xl border border-outline-variant/50 bg-surface-container-high/40 p-3">
                <div class="flex items-start gap-3">
                  <span aria-hidden="true" class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-fixed text-sm font-semibold text-primary">{{ initials(row.name) }}</span>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium text-on-surface">{{ row.name }}</p>
                    <p class="truncate text-xs text-on-surface-variant">{{ row.email }}</p>
                  </div>
                  <span [class]="row.enrollment.status === 'ACTIVE' ? 'badge badge-green shrink-0' : 'badge badge-gray shrink-0'">{{ enrollmentLabels[row.enrollment.status] }}</span>
                </div>
                <div class="mt-3 flex items-center justify-between gap-2">
                  <p class="text-xs text-on-surface-variant">
                    <span class="font-mono">{{ row.code || '—' }}</span> · {{ row.enrollment.enrolledAt | tsDate | date: 'dd/MM/yyyy' }}
                  </p>
                  @if (row.enrollment.status === 'ACTIVE') {
                    <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="drop(row.enrollment, row.name)">Retirar</button>
                  }
                </div>
              </li>
            } @empty {
              <li class="rounded-2xl border border-dashed border-outline-variant px-4 py-8 text-center text-sm text-on-surface-variant">Sin estudiantes inscritos.</li>
            }
          </ul>
        </section>
      </div>
    } @else {
      <div class="mt-6 grid place-items-center gap-3 rounded-3xl border border-dashed border-outline-variant px-4 py-20 text-center">
        <span aria-hidden="true" class="grid size-16 place-items-center rounded-2xl bg-primary-fixed text-primary">
          <svg class="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" /><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
          </svg>
        </span>
        <p class="text-base font-medium text-on-surface">Elige un curso</p>
        <p class="max-w-xs text-sm text-on-surface-variant">Selecciónalo arriba para generar códigos y gestionar a sus estudiantes inscritos.</p>
      </div>
    }
  `,
})
export class Enrollments {
  readonly courseIdParam = input<string | undefined>(undefined, { alias: 'courseId' });

  private readonly scope = inject(AcademicScopeService);
  private readonly enrollmentService = inject(EnrollmentService);
  private readonly dialogs = inject(DialogService);

  protected readonly label = courseLabel;
  protected readonly name = fullName;
  protected readonly enrollmentLabels = ENROLLMENT_STATUS_LABELS;
  protected readonly shiftLabels = SHIFT_LABELS;
  protected readonly semesterLabel = semesterLabel;

  protected readonly courses = toSignal(this.scope.courses$, { initialValue: [] });
  private readonly students = toSignal(this.scope.students$, { initialValue: [] });

  protected readonly courseId = signal('');
  protected readonly busy = signal(false);
  private readonly toast = inject(ToastService);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly generatedCode = signal<string | null>(null);
  /** Estudiantes elegidos en el buscador para inscribirlos manualmente. */
  protected readonly studentsToEnroll = signal<string[]>([]);

  protected readonly codeForm = inject(NonNullableFormBuilder).group({
    validDays: [7, [Validators.required, Validators.min(1), Validators.max(90)]],
    maxUses: [40, [Validators.required, Validators.min(1), Validators.max(500)]],
  });

  private readonly courseId$ = toObservable(this.courseId);

  private readonly enrollments = toSignal(
    this.courseId$.pipe(
      switchMap((id) => (id ? this.enrollmentService.getByCourse(id) : of([] as Enrollment[]))),
      catchError((e) => {
        this.error.set(errorMessage(e));
        return of([] as Enrollment[]);
      }),
    ),
    { initialValue: [] as Enrollment[] },
  );

  protected readonly codes = toSignal(
    this.courseId$.pipe(
      switchMap((id) => (id ? this.enrollmentService.getCodes(id) : of([] as EnrollmentCode[]))),
      catchError(() => of([] as EnrollmentCode[])),
    ),
    { initialValue: [] as EnrollmentCode[] },
  );

  constructor() {
    effect(() => {
      const preset = this.courseIdParam();
      if (preset) this.courseId.set(preset);
    });
  }

  /** Iniciales (máx. 2) para el avatar del estudiante. */
  protected initials(name: string): string {
    return (
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0])
        .join('')
        .toUpperCase() || '?'
    );
  }

  protected readonly rows = computed(() => {
    const byId = new Map(this.students().map((s) => [s.uid, s]));
    return this.enrollments()
      .map((enrollment) => {
        const s = byId.get(enrollment.studentId);
        return {
          enrollment,
          name: s ? fullName(s) : enrollment.studentId,
          code: s?.institutionalCode ?? null,
          email: s?.email ?? '',
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });

  protected readonly activeCount = computed(() => this.enrollments().filter((e) => e.status === 'ACTIVE').length);

  protected readonly enrollable = computed(() => {
    const enrolled = new Set(this.enrollments().filter((e) => e.status === 'ACTIVE').map((e) => e.studentId));
    const notEnrolled = this.students().filter((s) => s.status === 'ACTIVE' && !enrolled.has(s.uid));
    const course = this.courses().find((c) => c.id === this.courseId());
    if (!course) return notEnrolled;
    const { careerId, semester, shift } = course;
    if (!careerId && !semester && !shift) return notEnrolled;

    return notEnrolled.filter((s) => {
      if (careerId && s.careerId && s.careerId !== careerId) return false;
      if (semester && s.semester && s.semester !== semester) return false;
      if (shift && s.shift && s.shift !== shift) return false;
      return true;
    });
  });

  /** Cantidad de alumnos que coinciden con el filtro carrera+ciclo+turno del curso. */
  protected readonly matchedCount = computed(() => {
    const enrolled = new Set(this.enrollments().filter((e) => e.status === 'ACTIVE').map((e) => e.studentId));
    const notEnrolled = this.students().filter((s) => s.status === 'ACTIVE' && !enrolled.has(s.uid));
    const course = this.courses().find((c) => c.id === this.courseId());
    if (!course) return null;
    const { careerId, semester, shift } = course;
    if (!careerId && !semester && !shift) return null;
    const matched = notEnrolled.filter((s) => {
      if (careerId && s.careerId && s.careerId !== careerId) return false;
      if (semester && s.semester && s.semester !== semester) return false;
      if (shift && s.shift && s.shift !== shift) return false;
      return true;
    });
    return { matched: matched.length, total: notEnrolled.length };
  });

  /** El selector emite una lista; aquí solo se trabaja con un curso (o ninguno al limpiar). */
  protected onCoursePicked(ids: string[]): void {
    this.selectCourse(ids[0] ?? '');
  }

  protected selectCourse(id: string): void {
    this.courseId.set(id);
    this.studentsToEnroll.set([]);
    this.generatedCode.set(null);
    this.message.set(null);
    this.error.set(null);
  }

  protected codeStatus(code: EnrollmentCode): string {
    if (code.status === 'DISABLED') return 'Desactivado';
    if (tsMillis(code.expiresAt) < Date.now()) return 'Vencido';
    if (code.uses >= code.maxUses) return 'Agotado';
    return 'Activo';
  }

  protected codeBadge(code: EnrollmentCode): string {
    return this.codeStatus(code) === 'Activo' ? 'badge badge-green' : 'badge badge-gray';
  }

  async generate(): Promise<void> {
    if (this.codeForm.invalid) return;
    const { validDays, maxUses } = this.codeForm.getRawValue();
    await this.run(async () => {
      const code = await this.enrollmentService.generateCode(this.courseId(), validDays, maxUses);
      this.generatedCode.set(code);
      this.toast.warning('Cópialo ahora: por seguridad no se volverá a mostrar.', { title: 'Código generado' });
      return null;
    });
  }

  async disable(code: EnrollmentCode): Promise<void> {
    const ok = await this.dialogs.confirm({
      title: 'Desactivar código',
      message: 'El código dejará de funcionar y los estudiantes ya no podrán usarlo para inscribirse.',
      confirmText: 'Desactivar',
      tone: 'danger',
    });
    if (!ok) return;
    await this.run(async () => {
      await this.enrollmentService.disableCode(code);
      return 'Código desactivado.';
    });
  }

  /** Seleccionados que siguen siendo inscribibles (al inscribirse desaparecen de la lista). */
  protected readonly pendingStudentIds = computed(() => {
    const allowed = new Set(this.enrollable().map((s) => s.uid));
    return this.studentsToEnroll().filter((id) => allowed.has(id));
  });

  async enrollSelected(): Promise<void> {
    const ids = this.pendingStudentIds();
    if (!ids.length) return;
    await this.run(async () => {
      await this.enrollmentService.enrollMany(this.courseId(), ids);
      this.studentsToEnroll.set([]);
      return ids.length === 1 ? 'Estudiante inscrito.' : `${ids.length} estudiantes inscritos.`;
    });
  }

  async drop(enrollment: Enrollment, studentName: string): Promise<void> {
    const reason = await this.dialogs.reason({
      title: 'Retirar inscripción',
      message: `${studentName} dejará de figurar como inscrito en el curso.`,
      confirmText: 'Retirar',
      tone: 'danger',
    });
    if (!reason) return;
    await this.run(async () => {
      await this.enrollmentService.drop(enrollment, reason);
      return 'Inscripción retirada.';
    });
  }

  async copy(): Promise<void> {
    const code = this.generatedCode();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.toast.info('Compártelo con los estudiantes del curso.', { title: 'Código copiado' });
    } catch {
      this.toast.warning('Selecciónalo y cópialo manualmente.', { title: 'No se pudo copiar' });
    }
  }

  exportCsv(): void {
    const course = this.courses().find((c) => c.id === this.courseId());
    downloadCsv(
      `inscritos-${course?.courseCode ?? 'curso'}-${fileDate()}`,
      ['Código institucional', 'Nombre', 'Correo', 'Fecha de inscripción', 'Estado'],
      this.rows().map((r) => [
        r.code,
        r.name,
        r.email,
        tsToDate(r.enrollment.enrolledAt)?.toLocaleDateString('es-PE') ?? '',
        this.enrollmentLabels[r.enrollment.status],
      ]),
    );
  }

  private async run(action: () => Promise<string | null>): Promise<void> {
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