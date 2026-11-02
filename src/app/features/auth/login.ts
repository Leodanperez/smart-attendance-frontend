import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { HOME_ROUTE } from '../../core/models/user.model';
import { errorMessage } from '../../core/services/error-message';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  template: `
    <main class="flex min-h-dvh items-center justify-center bg-gray-50 p-4">
      <form
        [formGroup]="form"
        (ngSubmit)="submit()"
        class="card w-full max-w-sm space-y-4 p-6"
        novalidate
      >
        <div>
          <h1 class="page-title">Smart Attendance</h1>
          <p class="page-subtitle">Panel de administración</p>
        </div>

        <div>
          <label for="email" class="label">Correo</label>
          <input
            id="email"
            type="email"
            formControlName="email"
            autocomplete="email"
            class="input"
            [attr.aria-invalid]="form.controls.email.invalid && form.controls.email.touched"
          />
        </div>

        <div>
          <label for="password" class="label">Contraseña</label>
          <input
            id="password"
            type="password"
            formControlName="password"
            autocomplete="current-password"
            class="input"
            [attr.aria-invalid]="form.controls.password.invalid && form.controls.password.touched"
          />
        </div>

        @if (error()) {
          <p role="alert" class="alert-error">{{ error() }}</p>
        }
        @if (info()) {
          <p role="status" class="alert-success">{{ info() }}</p>
        }

        <button type="submit" [disabled]="loading()" class="btn btn-primary w-full">
          {{ loading() ? 'Ingresando…' : 'Iniciar sesión' }}
        </button>

        <button type="button" (click)="forgotPassword()" class="w-full text-sm text-blue-600 hover:underline">
          ¿Olvidaste tu contraseña?
        </button>
      </form>
    </main>
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

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
