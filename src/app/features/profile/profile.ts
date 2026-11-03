import { Component, WritableSignal, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { ROLE_LABELS, UserProfile } from '../../core/models/user.model';
import { errorMessage } from '../../core/services/error-message';
import { FONT_SCALE_LABELS, FontScale, PreferencesService } from '../../core/services/preferences.service';
import { THEME_LABELS, ThemeMode, ThemeService } from '../../core/services/theme.service';
import { UserService } from '../../core/services/user.service';
import { PHONE_PATTERN, nameValidators } from '../../shared/validators/user-validators';
import { ToastService } from '../../shared/toast/toast.service';

/** W14 — Perfil y configuración personal. */
@Component({
  selector: 'app-profile',
  imports: [ReactiveFormsModule],
  template: `
    <div class="mx-auto max-w-3xl space-y-4">
      <h1 class="page-title">Mi perfil</h1>

      @if (error()) {
        <p role="alert" class="alert-error">{{ error() }}</p>
      }
      @if (message()) {
        <p role="status" class="alert-success">{{ message() }}</p>
      }

      <section class="card flex flex-wrap items-center gap-4" aria-labelledby="photo-title">
        <h2 id="photo-title" class="sr-only">Fotografía</h2>
        @if (profile()?.photoUrl) {
          <img [src]="profile()?.photoUrl" alt="Tu fotografía de perfil" class="h-20 w-20 rounded-full object-cover" />
        } @else {
          <span class="flex h-20 w-20 items-center justify-center rounded-full bg-primary-fixed text-2xl font-semibold text-primary" aria-hidden="true">
            {{ initials() }}
          </span>
        }
        <div class="flex-1">
          <p class="font-medium text-on-surface">{{ me()?.displayName }}</p>
          <p class="text-sm text-on-surface-variant">{{ me()?.email }} · {{ me() ? roleLabels[me()!.role] : '' }}</p>
          <label for="photo" class="btn btn-secondary btn-sm mt-2 cursor-pointer">
            {{ uploading() ? 'Subiendo…' : 'Cambiar fotografía' }}
          </label>
          <input id="photo" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only"
            [disabled]="uploading()" (change)="upload($event)" />
          <p class="mt-1 text-xs text-on-surface-variant">JPG, PNG o WEBP, máximo 2 MB.</p>
        </div>
      </section>

      <form [formGroup]="form" (ngSubmit)="save()" novalidate class="card grid gap-4 sm:grid-cols-2" aria-labelledby="data-title">
        <h2 id="data-title" class="font-medium text-on-surface sm:col-span-2">Datos personales</h2>
        <div>
          <label for="firstName" class="label">Nombres</label>
          <input id="firstName" formControlName="firstName" autocomplete="given-name" class="input"
            [attr.aria-invalid]="form.controls.firstName.invalid && form.controls.firstName.touched" />
        </div>
        <div>
          <label for="lastName" class="label">Apellidos</label>
          <input id="lastName" formControlName="lastName" autocomplete="family-name" class="input"
            [attr.aria-invalid]="form.controls.lastName.invalid && form.controls.lastName.touched" />
        </div>
        <div>
          <label for="email" class="label">Correo</label>
          <input id="email" [value]="me()?.email ?? ''" class="input bg-surface-container-low" readonly />
        </div>
        <div>
          <label for="role" class="label">Rol</label>
          <input id="role" [value]="me() ? roleLabels[me()!.role] : ''" class="input bg-surface-container-low" readonly />
        </div>
        <div>
          <label for="phone" class="label">Celular</label>
          <input id="phone" type="tel" formControlName="phone" autocomplete="tel" class="input"
            [attr.aria-invalid]="form.controls.phone.invalid && form.controls.phone.touched" />
        </div>
        <div>
          <label for="address" class="label">Dirección</label>
          <input id="address" formControlName="address" autocomplete="street-address" class="input" />
        </div>
        <div class="flex flex-wrap justify-end gap-2 sm:col-span-2">
          <button type="button" class="btn btn-secondary" (click)="changePassword()">Cambiar contraseña</button>
          <button type="submit" class="btn btn-primary" [disabled]="saving()">Guardar</button>
        </div>
      </form>

      <section class="card" aria-labelledby="prefs-title">
        <h2 id="prefs-title" class="font-medium text-on-surface">Preferencias visuales</h2>
        <fieldset class="mt-3">
          <legend class="label">Tema</legend>
          <div class="flex flex-wrap gap-4">
            @for (mode of themeModes; track mode[0]) {
              <label class="flex items-center gap-2 text-sm">
                <input type="radio" name="themeMode" [value]="mode[0]" [checked]="theme.mode() === mode[0]"
                  (change)="theme.mode.set(mode[0])" />
                {{ mode[1] }}
              </label>
            }
          </div>
        </fieldset>
        <fieldset class="mt-4">
          <legend class="label">Tamaño de texto</legend>
          <div class="flex flex-wrap gap-4">
            @for (scale of scales; track scale[0]) {
              <label class="flex items-center gap-2 text-sm">
                <input type="radio" name="fontScale" [value]="scale[0]" [checked]="preferences.fontScale() === scale[0]"
                  (change)="preferences.fontScale.set($any(scale[0]))" />
                {{ scale[1] }}
              </label>
            }
          </div>
        </fieldset>
      </section>

      <div class="flex justify-end">
        <button type="button" class="btn btn-danger" (click)="logout()">Cerrar sesión</button>
      </div>
    </div>
  `,
})
export class Profile {
  private readonly auth = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);
  protected readonly preferences = inject(PreferencesService);
  protected readonly theme = inject(ThemeService);
  protected readonly themeModes = Object.entries(THEME_LABELS) as [ThemeMode, string][];

  protected readonly me = this.auth.currentUser;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly scales = Object.entries(FONT_SCALE_LABELS) as [FontScale, string][];

  protected readonly saving = signal(false);
  protected readonly uploading = signal(false);
  private readonly toast = inject(ToastService);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);

  protected readonly profile = toSignal(
    this.auth.scopeUser$.pipe(
      switchMap((u) => (u ? this.userService.getById(u.uid) : of(null))),
      catchError(() => of(null)),
    ),
    { initialValue: null as UserProfile | null },
  );

  protected readonly form = inject(NonNullableFormBuilder).group({
    firstName: ['', nameValidators],
    lastName: ['', nameValidators],
    phone: ['', [Validators.pattern(PHONE_PATTERN)]],
    address: ['', [Validators.maxLength(150)]],
  });

  constructor() {
    effect(() => {
      const p = this.profile();
      if (p && this.form.pristine) {
        this.form.reset({ firstName: p.firstName, lastName: p.lastName, phone: p.phone ?? '', address: p.address ?? '' });
      }
    });
  }

  protected initials(): string {
    const u = this.me();
    return ((u?.firstName?.[0] ?? '') + (u?.lastName?.[0] ?? '')).toUpperCase() || '?';
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revisa los campos marcados (celular: 9 dígitos que empiezan con 9).');
      return;
    }
    await this.run(this.saving, async () => {
      await this.userService.updateOwnProfile(this.form.getRawValue());
      this.form.markAsPristine();
      return 'Perfil actualizado.';
    });
  }

  async upload(event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) return;
    await this.run(this.uploading, async () => {
      await this.userService.uploadOwnPhoto(file);
      return 'Fotografía actualizada.';
    });
  }

  async changePassword(): Promise<void> {
    const email = this.me()?.email;
    if (!email) return;
    await this.run(this.saving, async () => {
      await this.auth.resetPassword(email);
      return `Te enviamos un enlace a ${email} para cambiar tu contraseña.`;
    });
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }

  private async run(flag: WritableSignal<boolean>, action: () => Promise<string>): Promise<void> {
    flag.set(true);
    this.error.set(null);
    this.message.set(null);
    try {
      const msg = await action();
      if (msg) this.toast.success(msg);
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      flag.set(false);
    }
  }
}
