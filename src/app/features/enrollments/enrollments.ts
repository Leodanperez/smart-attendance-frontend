import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of, switchMap } from 'rxjs';

import { courseLabel } from '../../core/models/course.model';
import {
  ENROLLMENT_STATUS_LABELS,
  Enrollment,
  EnrollmentCode,
} from '../../core/models/enrollment.model';
import { fullName } from '../../core/models/user.model';
import { AcademicScopeService } from '../../core/services/academic-scope.service';
import { EnrollmentService } from '../../core/services/enrollment.service';
import { errorMessage } from '../../core/services/error-message';
import { tsMillis, tsToDate } from '../../core/services/firestore.utils';
import { TsDatePipe } from '../../shared/pipes/ts-date.pipe';
import { downloadCsv, fileDate } from '../../shared/utils/csv';
import { DialogService } from '../../shared/dialogs/dialog.service';
import { ToastService } from '../../shared/toast/toast.service';

/** W07 — Inscripciones y códigos. */
@Component({
  selector: 'app-enrollments',
  imports: [ReactiveFormsModule, DatePipe, TsDatePipe],
  template: `
    <h1 class="page-title">Inscripciones</h1>
    <p class="page-subtitle">Genera códigos de inscripción y consulta los estudiantes inscritos por curso.</p>

    <div class="card mt-6">
      <label for="course" class="label">Seleccionar curso</label>
      <select id="course" class="input max-w-xl" #sel [value]="courseId()" (change)="selectCourse(sel.value)">
        <option value="">Selecciona un curso</option>
        @for (c of courses(); track c.id) {
          <option [value]="c.id">{{ label(c) }}{{ c.status === 'INACTIVE' ? ' (inactivo)' : '' }}</option>
        }
      </select>
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
        <div class="card mt-4 border-2 border-primary/30" role="status">
          <p class="text-sm text-on-surface">Código generado. Cópialo ahora: por seguridad no se volverá a mostrar.</p>
          <div class="mt-2 flex flex-wrap items-center gap-3">
            <span class="rounded-md bg-surface-container-high px-4 py-2 font-mono text-2xl tracking-widest">{{ generatedCode() }}</span>
            <button type="button" class="btn btn-secondary btn-sm" (click)="copy()">Copiar</button>
            <button type="button" class="btn btn-secondary btn-sm" (click)="generatedCode.set(null)">Ocultar</button>
          </div>
        </div>
      }

      <div class="mt-4 grid gap-4 lg:grid-cols-3">
        <!-- Generar código -->
        <section class="card" aria-labelledby="gen-title">
          <h2 id="gen-title" class="font-medium text-on-surface">Generar código de inscripción</h2>
          <form [formGroup]="codeForm" (ngSubmit)="generate()" novalidate class="mt-3 space-y-3">
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
            <button type="submit" class="btn btn-primary w-full" [disabled]="busy() || codeForm.invalid">Generar código</button>
          </form>

          <h3 class="mt-6 text-sm font-medium text-on-surface">Códigos del curso</h3>
          <ul class="mt-2 divide-y divide-outline-variant/50 text-sm">
            @for (code of codes(); track code.id) {
              <li class="py-2">
                <div class="flex items-center justify-between gap-2">
                  <span [class]="codeBadge(code)">{{ codeStatus(code) }}</span>
                  @if (code.status === 'ACTIVE') {
                    <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="disable(code)">Desactivar</button>
                  }
                </div>
                <p class="mt-1 text-xs text-on-surface-variant">
                  Usos {{ code.uses }}/{{ code.maxUses }} · vence {{ code.expiresAt | tsDate | date: 'dd/MM/yyyy HH:mm' }}
                </p>
              </li>
            } @empty {
              <li class="py-2 text-on-surface-variant">Sin códigos.</li>
            }
          </ul>
        </section>

        <!-- Estudiantes inscritos -->
        <section class="card lg:col-span-2" aria-labelledby="enrolled-title">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 id="enrolled-title" class="font-medium text-on-surface">
              Estudiantes inscritos ({{ activeCount() }})
            </h2>
            <button type="button" class="btn btn-secondary btn-sm" (click)="exportCsv()">Exportar lista</button>
          </div>

          <div class="mt-3 flex flex-wrap items-end gap-2">
            <div class="w-full flex-1 sm:w-auto sm:min-w-64">
              <label for="student" class="label">Inscribir estudiante manualmente</label>
              <select id="student" class="input" #st>
                <option value="">Selecciona un estudiante activo</option>
                @for (s of enrollable(); track s.uid) {
                  <option [value]="s.uid">{{ name(s) }} — {{ s.institutionalCode || s.email }}</option>
                }
              </select>
            </div>
            <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="enroll(st.value); st.value = ''">Inscribir</button>
          </div>

          <div class="mt-4 overflow-x-auto">
            <table class="table">
              <thead>
                <tr>
                  <th scope="col">Código</th>
                  <th scope="col">Nombre</th>
                  <th scope="col">Correo</th>
                  <th scope="col">Inscrito</th>
                  <th scope="col">Estado</th>
                  <th scope="col"><span class="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.enrollment.id) {
                  <tr>
                    <td>{{ row.code || '—' }}</td>
                    <td class="font-medium text-on-surface">{{ row.name }}</td>
                    <td>{{ row.email }}</td>
                    <td class="whitespace-nowrap">{{ row.enrollment.enrolledAt | tsDate | date: 'dd/MM/yyyy' }}</td>
                    <td>{{ enrollmentLabels[row.enrollment.status] }}</td>
                    <td class="text-right">
                      @if (row.enrollment.status === 'ACTIVE') {
                        <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="drop(row.enrollment, row.name)">Retirar</button>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="6" class="text-center text-on-surface-variant">Sin estudiantes inscritos.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>
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

  protected readonly courses = toSignal(this.scope.courses$, { initialValue: [] });
  private readonly students = toSignal(this.scope.students$, { initialValue: [] });

  protected readonly courseId = signal('');
  protected readonly busy = signal(false);
  private readonly toast = inject(ToastService);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly generatedCode = signal<string | null>(null);

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
    return this.students().filter((s) => s.status === 'ACTIVE' && !enrolled.has(s.uid));
  });

  protected selectCourse(id: string): void {
    this.courseId.set(id);
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

  async enroll(studentId: string): Promise<void> {
    if (!studentId) return;
    await this.run(async () => {
      await this.enrollmentService.enroll(this.courseId(), studentId);
      return 'Estudiante inscrito.';
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
