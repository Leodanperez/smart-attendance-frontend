import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  CircleAlert,
  CircleCheck,
  Download,
  GraduationCap,
  LoaderCircle,
  Lock,
  LogIn,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
} from 'lucide-angular';
import { Icon } from '../../shared/components/icon';

import { AuthService } from '../../core/auth/auth.service';
import { HOME_ROUTE } from '../../core/models/user.model';
import { errorMessage } from '../../core/services/error-message';
import { ThemeService } from '../../core/services/theme.service';
import { PasswordToggle } from '../../shared/components/password-toggle';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, Icon, PasswordToggle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="relative flex min-h-dvh items-center justify-center overflow-hidden bg-surface px-4 py-8">
      <!-- Decoración -->
      <div class="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/15 blur-3xl" aria-hidden="true"></div>
      <div class="pointer-events-none absolute -right-32 -bottom-32 h-96 w-96 rounded-full bg-status-info/15 blur-3xl" aria-hidden="true"></div>

      <button type="button" class="btn-icon absolute top-4 right-4" (click)="theme.toggle()"
        [attr.aria-label]="theme.isDark() ? 'Activar modo claro' : 'Activar modo oscuro'"
        [class.!text-status-warning]="theme.isDark()">
        <app-icon [name]="theme.isDark() ? icons.sun : icons.moon" [size]="20" />
      </button>

      <div class="animate-scale-in relative w-full max-w-md rounded-2xl border border-outline-variant/40 bg-surface-container p-8 shadow-xl sm:p-10">
        <div class="mb-8 text-center">
          <span class="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <app-icon [name]="icons.brand" [size]="36" class="text-primary" />
          </span>
          <h1 class="mb-1 text-2xl font-bold text-primary">Smart Attendance</h1>
          <h2 class="mb-2 text-xl font-semibold text-on-surface">Bienvenido de nuevo</h2>
          <p class="text-sm text-on-surface-variant">Ingresa tus credenciales institucionales para acceder al panel</p>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="space-y-5">
          <div>
            <label for="email" class="label">Correo institucional</label>
            <div class="relative">
              <app-icon [name]="icons.mail" [size]="18" class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-outline" />
              <input id="email" type="email" formControlName="email" autocomplete="email" autofocus
                placeholder="usuario@institucion.edu.pe" class="input pl-11"
                [attr.aria-invalid]="form.controls.email.invalid && form.controls.email.touched" />
            </div>
          </div>

          <div>
            <label for="password" class="label">Contraseña</label>
            <div class="relative">
              <app-icon [name]="icons.lock" [size]="18" class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-outline" />
              <input #pwd id="password" type="password" formControlName="password" autocomplete="current-password"
                placeholder="••••••••" class="input pr-11 pl-11"
                [attr.aria-invalid]="form.controls.password.invalid && form.controls.password.touched" />
              <app-password-toggle [target]="pwd" />
            </div>
          </div>

          <div class="flex justify-end">
            <button type="button" (click)="forgotPassword()" class="cursor-pointer text-sm text-primary hover:underline">
              ¿Olvidaste tu contraseña?
            </button>
          </div>

          @if (error()) {
            <p role="alert" class="alert-error flex items-start gap-2">
              <app-icon [name]="icons.alert" [size]="18" class="mt-px shrink-0" /> {{ error() }}
            </p>
          }
          @if (info()) {
            <p role="status" class="alert-success flex items-start gap-2">
              <app-icon [name]="icons.check" [size]="18" class="mt-px shrink-0" /> {{ info() }}
            </p>
          }

          <button type="submit" [disabled]="loading()" class="btn btn-primary w-full py-3.5">
            @if (loading()) {
              <app-icon [name]="icons.loader" [size]="18" class="animate-spin" /> Ingresando…
            } @else {
              Ingresar al sistema <app-icon [name]="icons.login" [size]="18" />
            }
          </button>
        </form>

        <div class="mt-6 border-t border-outline-variant/40 pt-4 text-center">
          <a routerLink="/descargar" class="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
            <app-icon [name]="icons.download" [size]="16" /> ¿Eres estudiante? Descarga la app
          </a>
          <div class="mt-3 flex items-center justify-center gap-2 text-on-surface-variant">
            <app-icon [name]="icons.shield" [size]="16" />
            <span class="text-xs font-semibold">Conexión segura con Firebase Authentication</span>
          </div>
        </div>
      </div>
    </main>
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);

  protected readonly icons = {
    brand: GraduationCap,
    mail: Mail,
    lock: Lock,
    login: LogIn,
    loader: LoaderCircle,
    shield: ShieldCheck,
    alert: CircleAlert,
    check: CircleCheck,
    download: Download,
    moon: Moon,
    sun: Sun,
  };

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly info = signal<string | null>(null);

  async submit(): Promise<void> {
    this.info.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Ingresa un correo válido y tu contraseña.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.login(email, password);
      await this.router.navigateByUrl(HOME_ROUTE);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  async forgotPassword(): Promise<void> {
    const email = this.form.controls.email;
    if (email.invalid) {
      email.markAsTouched();
      this.error.set('Escribe tu correo para recuperar la contraseña.');
      return;
    }
    this.error.set(null);
    try {
      await this.auth.resetPassword(email.value);
    } catch {
      // No revelamos si el correo existe o no.
    }
    this.info.set('Si el correo está registrado, recibirás un enlace para restablecerla.');
  }
}
