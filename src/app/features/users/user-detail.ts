import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, map, of, shareReplay, switchMap } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { AUDIT_ACTION_LABELS, AuditLog } from '../../core/models/audit.model';
import { COURSE_STATUS_BADGE, COURSE_STATUS_LABELS, Course, courseLabel } from '../../core/models/course.model';
import { ENROLLMENT_STATUS_LABELS, Enrollment } from '../../core/models/enrollment.model';
import {
  AUTH_PROVIDER_LABELS,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  DocumentType,
  GENDERS,
  GENDER_LABELS,
  Gender,
  ROLE_LABELS,
  USER_ROLES,
  USER_STATUS_BADGE,
  USER_STATUS_LABELS,
  UserProfile,
  UserRole,
  UserStatus,
  buildInstitutionalCode,
  fullName,
} from '../../core/models/user.model';
import { AuditService } from '../../core/services/audit.service';
import { CourseService } from '../../core/services/course.service';
import { EnrollmentService } from '../../core/services/enrollment.service';
import { errorMessage } from '../../core/services/error-message';
import { uniq } from '../../core/services/firestore.utils';
import { UserService } from '../../core/services/user.service';
import { TsDatePipe } from '../../shared/pipes/ts-date.pipe';
import { DialogService } from '../../shared/dialogs/dialog.service';
import {
  DOCUMENT_PATTERNS,
  PHONE_PATTERN,
  birthDateValidator,
  documentValidators,
  nameValidators,
  todayIso,
} from '../../shared/validators/user-validators';
import { ToastService } from '../../shared/toast/toast.service';

interface Related {
  courses: Course[];
  enrollments: Enrollment[];
}

/** W04 — Detalle de usuario. */
@Component({
  selector: 'app-user-detail',
  imports: [RouterLink, DatePipe, TsDatePipe, ReactiveFormsModule],
  template: `
    <a routerLink="/users" class="text-sm text-primary hover:underline">← Volver a usuarios</a>

    @if (user() === undefined) {
      <p class="mt-4 text-sm text-on-surface-variant">Cargando…</p>
    } @else if (user() === null) {
      <p class="alert-error mt-4">El usuario no existe.</p>
    } @else {
      @let u = user()!;
      <div class="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          @if (u.photoUrl) {
            <img [src]="u.photoUrl" alt="" class="h-14 w-14 rounded-full object-cover" />
          }
          <div>
            <h1 class="page-title">{{ name(u) }}</h1>
            <p class="mt-1 flex flex-wrap items-center gap-2 text-sm text-on-surface-variant">
              <span class="badge badge-blue">{{ roleLabels[u.role] }}</span>
              <span [class]="statusBadge[u.status]">{{ statusLabels[u.status] }}</span>
              <span>{{ u.email }}</span>
            </p>
          </div>
        </div>
        @if (!isSelf()) {
          <div class="flex flex-wrap gap-2">
            @if (u.status !== 'ACTIVE') {
              <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="changeStatus('ACTIVE')">
                {{ u.status === 'PENDING' ? 'Validar y activar' : 'Activar' }}
              </button>
            }
            @if (u.status !== 'DISABLED') {
              <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="changeStatus('DISABLED')">
                Desactivar
              </button>
            }
          </div>
        }
      </div>

      @if (error()) {
        <p role="alert" class="alert-error mt-4">{{ error() }}</p>
      }
      @if (message()) {
        <p role="status" class="alert-success mt-4">{{ message() }}</p>
      }

      <div class="mt-6 grid gap-4 lg:grid-cols-3">
        <!-- Perfil -->
        <section class="card lg:col-span-2" aria-labelledby="profile-title">
          <div class="flex items-center justify-between">
            <h2 id="profile-title" class="font-medium text-on-surface">Datos de perfil</h2>
            @if (!editing()) {
              <button type="button" class="btn btn-secondary btn-sm" (click)="startEdit(u)">Editar datos institucionales</button>
            }
          </div>

          @if (!editing()) {
            <dl class="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div><dt class="text-on-surface-variant">Código institucional</dt><dd class="font-medium">{{ u.institutionalCode || '—' }}</dd></div>
              <div><dt class="text-on-surface-variant">Documento</dt><dd class="font-medium">{{ u.documentType ? docLabels[u.documentType] : '' }} {{ u.documentNumber || '—' }}</dd></div>
              <div><dt class="text-on-surface-variant">Fecha de nacimiento</dt><dd class="font-medium">{{ u.birthDate || '—' }}</dd></div>
              <div><dt class="text-on-surface-variant">Sexo</dt><dd class="font-medium">{{ u.gender ? genderLabels[u.gender] : '—' }}</dd></div>
              <div><dt class="text-on-surface-variant">Celular</dt><dd class="font-medium">{{ u.phone || '—' }}</dd></div>
              <div><dt class="text-on-surface-variant">Dirección</dt><dd class="font-medium">{{ u.address || '—' }}</dd></div>
              <div><dt class="text-on-surface-variant">Fecha de registro</dt><dd class="font-medium">{{ u.createdAt | tsDate | date: 'dd/MM/yyyy HH:mm' }}</dd></div>
              <div><dt class="text-on-surface-variant">Última actualización</dt><dd class="font-medium">{{ u.updatedAt | tsDate | date: 'dd/MM/yyyy HH:mm' }}</dd></div>
            </dl>
          } @else {
            <form [formGroup]="form" (ngSubmit)="save(u)" novalidate class="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label for="d-firstName" class="label">Nombres *</label>
                <input id="d-firstName" formControlName="firstName" class="input" [attr.aria-invalid]="invalid('firstName')" />
              </div>
              <div>
                <label for="d-lastName" class="label">Apellidos *</label>
                <input id="d-lastName" formControlName="lastName" class="input" [attr.aria-invalid]="invalid('lastName')" />
              </div>
              <div>
                <label for="d-code" class="label">Código institucional</label>
                <output id="d-code" aria-live="polite" class="input block bg-primary-fixed/50 font-mono font-semibold text-primary">
                  {{ codePreview(u) }}
                </output>
                <p class="hint">Se regenera con el número de documento.</p>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label for="d-docType" class="label">Tipo doc. *</label>
                  <select id="d-docType" formControlName="documentType" class="input">
                    @for (t of docTypes; track t) {
                      <option [value]="t">{{ t }}</option>
                    }
                  </select>
                </div>
                <div>
                  <label for="d-doc" class="label">Número *</label>
                  <input id="d-doc" formControlName="documentNumber" class="input" [attr.aria-invalid]="invalid('documentNumber')" />
                </div>
              </div>
              <div>
                <label for="d-birth" class="label">Fecha de nacimiento *</label>
                <input id="d-birth" type="date" [max]="today" formControlName="birthDate" class="input" [attr.aria-invalid]="invalid('birthDate')" />
              </div>
              <div>
                <label for="d-gender" class="label">Sexo *</label>
                <select id="d-gender" formControlName="gender" class="input" [attr.aria-invalid]="invalid('gender')">
                  <option value="" disabled>Selecciona</option>
                  @for (g of genders; track g) {
                    <option [value]="g">{{ genderLabels[g] }}</option>
                  }
                </select>
              </div>
              <div>
                <label for="d-phone" class="label">Celular</label>
                <input id="d-phone" type="tel" formControlName="phone" class="input" [attr.aria-invalid]="invalid('phone')" />
              </div>
              <div>
                <label for="d-address" class="label">Dirección</label>
                <input id="d-address" formControlName="address" class="input" />
              </div>
              <div class="flex justify-end gap-2 sm:col-span-2">
                <button type="button" class="btn btn-secondary" (click)="editing.set(false)">Cancelar</button>
                <button type="submit" class="btn btn-primary" [disabled]="busy()">Guardar cambios</button>
              </div>
            </form>
          }
        </section>

        <!-- Rol y soporte -->
        <section class="card space-y-4" aria-labelledby="role-title">
          <h2 id="role-title" class="font-medium text-on-surface">Rol y estado</h2>
          @if (isSelf()) {
            <p class="alert-info">No puedes modificar tu propio rol ni estado.</p>
          } @else {
            <div>
              <label for="d-role" class="label">Rol</label>
              <div class="flex gap-2">
                <select id="d-role" class="input" #roleSel [value]="u.role">
                  @for (r of roles; track r) {
                    <option [value]="r">{{ roleLabels[r] }}</option>
                  }
                </select>
                <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="changeRole($any(roleSel.value))">
                  Asignar
                </button>
              </div>
            </div>
          }
          <details class="text-sm">
            <summary class="cursor-pointer text-on-surface">Datos de soporte</summary>
            <dl class="mt-2 space-y-2">
              <div><dt class="text-on-surface-variant">UID</dt><dd class="font-mono text-xs break-all">{{ u.uid }}</dd></div>
              <div><dt class="text-on-surface-variant">Proveedor de autenticación</dt><dd>{{ providerLabels[u.authProvider] || u.authProvider }}</dd></div>
            </dl>
          </details>
        </section>
      </div>

      <!-- Cursos e inscripciones -->
      <section class="card mt-4" aria-labelledby="courses-title">
        <h2 id="courses-title" class="font-medium text-on-surface">
          {{ u.role === 'STUDENT' ? 'Inscripciones' : 'Cursos asignados' }}
        </h2>
        <ul class="mt-3 divide-y divide-outline-variant/50">
          @if (u.role === 'STUDENT') {
            @for (e of related().enrollments; track e.id) {
              <li class="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <a [routerLink]="['/courses', e.courseId]" class="text-primary hover:underline">{{ courseName(e.courseId) }}</a>
                <span class="text-on-surface-variant">
                  {{ enrollmentLabels[e.status] }} · {{ e.enrolledAt | tsDate | date: 'dd/MM/yyyy' }}
                </span>
              </li>
            } @empty {
              <li class="py-2 text-sm text-on-surface-variant">Sin inscripciones.</li>
            }
          } @else {
            @for (c of related().courses; track c.id) {
              <li class="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <a [routerLink]="['/courses', c.id]" class="text-primary hover:underline">{{ label(c) }}</a>
                <span [class]="courseBadge[c.status]">{{ courseStatus[c.status] }}</span>
              </li>
            } @empty {
              <li class="py-2 text-sm text-on-surface-variant">Sin cursos asociados.</li>
            }
          }
        </ul>
      </section>

      <!-- Actividad -->
      <section class="card mt-4" aria-labelledby="activity-title">
        <h2 id="activity-title" class="font-medium text-on-surface">Historial de actividad</h2>
        <ul class="mt-3 divide-y divide-outline-variant/50">
          @for (log of activity(); track log.id) {
            <li class="py-2 text-sm">
              <div class="flex flex-wrap justify-between gap-2">
                <span class="font-medium text-on-surface">{{ actionLabels[log.action] || log.action }}</span>
                <span class="text-on-surface-variant">{{ log.createdAt | tsDate | date: 'dd/MM/yyyy HH:mm' }}</span>
              </div>
              <p class="text-xs text-on-surface-variant">
                Por {{ log.actorName || log.actorId }}@if (log.reason) { · Motivo: {{ log.reason }} }
              </p>
            </li>
          } @empty {
            <li class="py-2 text-sm text-on-surface-variant">Sin actividad registrada.</li>
          }
        </ul>
      </section>
    }
  `,
})
export class UserDetail {
  /** Parámetro de ruta :uid */
  readonly uid = input.required<string>();

  private readonly userService = inject(UserService);
  private readonly courseService = inject(CourseService);
  private readonly enrollmentService = inject(EnrollmentService);
  private readonly audit = inject(AuditService);
  private readonly dialogs = inject(DialogService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly me = inject(AuthService).currentUser;

  protected readonly roles = USER_ROLES;
  protected readonly genders = GENDERS;
  protected readonly docTypes = DOCUMENT_TYPES;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly statusLabels = USER_STATUS_LABELS;
  protected readonly statusBadge = USER_STATUS_BADGE;
  protected readonly genderLabels = GENDER_LABELS;
  protected readonly docLabels = DOCUMENT_TYPE_LABELS;
  protected readonly providerLabels = AUTH_PROVIDER_LABELS;
  protected readonly actionLabels = AUDIT_ACTION_LABELS;
  protected readonly enrollmentLabels = ENROLLMENT_STATUS_LABELS;
  protected readonly courseStatus = COURSE_STATUS_LABELS;
  protected readonly courseBadge = COURSE_STATUS_BADGE;
  protected readonly name = fullName;
  protected readonly label = courseLabel;
  protected readonly today = todayIso();

  protected readonly busy = signal(false);
  protected readonly editing = signal(false);
  private readonly toast = inject(ToastService);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);

  private readonly user$ = toObservable(this.uid).pipe(
    switchMap((id) => this.userService.getById(id).pipe(catchError(() => of(null)))),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  protected readonly user = toSignal(this.user$, { initialValue: undefined });

  protected readonly isSelf = computed(() => this.uid() === this.me()?.uid);

  protected readonly related = toSignal(
    this.user$.pipe(
      distinctUntilChanged((a, b) => a?.uid === b?.uid && a?.role === b?.role),
      switchMap((u) => {
        if (!u) return of<Related>({ courses: [], enrollments: [] });
        if (u.role === 'STUDENT') {
          return this.enrollmentService.getByStudent(u.uid).pipe(
            switchMap((enrollments) =>
              this.courseService
                .getByIds(uniq(enrollments.map((e) => e.courseId)))
                .pipe(map((courses): Related => ({ courses, enrollments }))),
            ),
          );
        }
        return this.courseService
          .getForTeacher(u.uid)
          .pipe(map((courses): Related => ({ courses, enrollments: [] })));
      }),
      catchError(() => of<Related>({ courses: [], enrollments: [] })),
    ),
    { initialValue: { courses: [], enrollments: [] } as Related },
  );

  protected readonly activity = toSignal(
    toObservable(this.uid).pipe(
      switchMap((id) => this.audit.getActivity(id)),
      map((logs) => logs.slice(0, 25)),
      catchError(() => of([] as AuditLog[])),
    ),
    { initialValue: [] as AuditLog[] },
  );

  protected readonly form = this.fb.group({
    firstName: ['', nameValidators],
    lastName: ['', nameValidators],
    documentType: this.fb.control<DocumentType>('DNI'),
    documentNumber: ['', documentValidators('DNI')],
    birthDate: ['', [Validators.required, birthDateValidator]],
    gender: this.fb.control<Gender | ''>('', Validators.required),
    phone: ['', [Validators.pattern(PHONE_PATTERN)]],
    address: ['', [Validators.maxLength(150)]],
  });

  constructor() {
    this.form.controls.documentType.valueChanges.pipe(takeUntilDestroyed()).subscribe((type) => {
      this.form.controls.documentNumber.setValidators(documentValidators(type));
      this.form.controls.documentNumber.updateValueAndValidity();
    });
  }

  protected courseName(courseId: string): string {
    return courseLabel(this.related().courses.find((c) => c.id === courseId));
  }

  /** Código que quedará al guardar: prefijo del rol + documento ingresado. */
  protected codePreview(u: UserProfile): string {
    return buildInstitutionalCode(u.role, this.form.controls.documentNumber.value) ?? u.institutionalCode ?? '—';
  }

  protected invalid(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  protected startEdit(u: UserProfile): void {
    this.form.reset({
      firstName: u.firstName,
      lastName: u.lastName,
      documentType: u.documentType ?? 'DNI',
      documentNumber: u.documentNumber ?? '',
      birthDate: u.birthDate ?? '',
      gender: u.gender ?? '',
      phone: u.phone ?? '',
      address: u.address ?? '',
    });
    this.editing.set(true);
  }

  async save(u: UserProfile): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      const docType = this.form.controls.documentType.value;
      this.error.set(`Revisa los campos marcados (documento: ${DOCUMENT_PATTERNS[docType].hint}).`);
      return;
    }
    const reason = await this.dialogs.reason({
      title: 'Guardar corrección de datos',
      message: `Se actualizarán los datos institucionales de ${fullName(u)}.`,
      confirmText: 'Guardar cambios',
      required: false,
    });
    if (reason === null) return;
    await this.run(async () => {
      const value = this.form.getRawValue();
      await this.userService.updateInstitutionalData(
        u,
        { ...value, gender: value.gender as Gender },
        reason || null,
      );
      this.editing.set(false);
      return 'Datos actualizados.';
    });
  }

  async changeStatus(status: UserStatus): Promise<void> {
    const u = this.user();
    if (!u) return;
    const reason = await this.dialogs.reason({
      title: `Cambiar estado a "${this.statusLabels[status]}"`,
      message: fullName(u),
      confirmText: status === 'DISABLED' ? 'Desactivar' : 'Activar',
      tone: status === 'DISABLED' ? 'danger' : 'primary',
    });
    if (!reason) return;
    await this.run(async () => {
      await this.userService.setStatus(u, status, reason);
      return `Estado cambiado a ${this.statusLabels[status]}.`;
    });
  }

  async changeRole(role: UserRole): Promise<void> {
    const u = this.user();
    if (!u || role === u.role) return;
    const reason = await this.dialogs.reason({
      title: `Asignar rol "${this.roleLabels[role]}"`,
      message: `${fullName(u)} pasará de ${this.roleLabels[u.role]} a ${this.roleLabels[role]}.`,
      confirmText: 'Asignar rol',
      tone: 'warning',
    });
    if (!reason) return;
    await this.run(async () => {
      await this.userService.setRole(u, role, reason);
      return `Rol cambiado a ${this.roleLabels[role]}.`;
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
