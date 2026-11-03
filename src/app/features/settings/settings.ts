import { Component, effect, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { errorMessage } from '../../core/services/error-message';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../shared/toast/toast.service';

/** Configuración institucional (ADMIN). */
@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule],
  template: `
    <div class="mx-auto max-w-2xl">
      <h1 class="page-title">Configuración</h1>
      <p class="page-subtitle">Valores generales usados por el panel. Los cambios quedan auditados.</p>

      <form [formGroup]="form" (ngSubmit)="save()" novalidate class="card mt-6 grid gap-4 sm:grid-cols-2">
        <div class="sm:col-span-2">
          <label for="institutionName" class="label">Nombre de la institución</label>
          <input id="institutionName" formControlName="institutionName" class="input"
            [attr.aria-invalid]="form.controls.institutionName.invalid" />
        </div>
        <div>
          <label for="defaultSessionMinutes" class="label">Duración por defecto de sesión (min)</label>
          <input id="defaultSessionMinutes" type="number" min="5" max="600" formControlName="defaultSessionMinutes" class="input"
            [attr.aria-invalid]="form.controls.defaultSessionMinutes.invalid" />
        </div>
        <div>
          <label for="defaultLateAfterMinutes" class="label">Tardanza por defecto (min)</label>
          <input id="defaultLateAfterMinutes" type="number" min="0" max="600" formControlName="defaultLateAfterMinutes" class="input"
            [attr.aria-invalid]="form.controls.defaultLateAfterMinutes.invalid" />
        </div>
        <div>
          <label for="lowAttendanceThreshold" class="label">Umbral de bajo porcentaje (%)</label>
          <input id="lowAttendanceThreshold" type="number" min="1" max="100" formControlName="lowAttendanceThreshold" class="input"
            [attr.aria-invalid]="form.controls.lowAttendanceThreshold.invalid" />
        </div>
        <div>
          <label for="qrRefreshSeconds" class="label">Renovación del QR (s)</label>
          <input id="qrRefreshSeconds" type="number" min="15" max="600" formControlName="qrRefreshSeconds" class="input"
            aria-describedby="qr-help" [attr.aria-invalid]="form.controls.qrRefreshSeconds.invalid" />
          <p id="qr-help" class="mt-1 text-xs text-on-surface-variant">Se usa si la Cloud Function no informa la expiración.</p>
        </div>

        @if (error()) {
          <p role="alert" class="alert-error sm:col-span-2">{{ error() }}</p>
        }
        @if (message()) {
          <p role="status" class="alert-success sm:col-span-2">{{ message() }}</p>
        }

        <div class="flex justify-end sm:col-span-2">
          <button type="submit" class="btn btn-primary" [disabled]="saving()">
            {{ saving() ? 'Guardando…' : 'Guardar configuración' }}
          </button>
        </div>
      </form>
    </div>
  `,
})
export class Settings {
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    institutionName: ['', [Validators.required, Validators.maxLength(100)]],
    defaultSessionMinutes: [90, [Validators.required, Validators.min(5), Validators.max(600)]],
    defaultLateAfterMinutes: [15, [Validators.required, Validators.min(0), Validators.max(600)]],
    lowAttendanceThreshold: [70, [Validators.required, Validators.min(1), Validators.max(100)]],
    qrRefreshSeconds: [60, [Validators.required, Validators.min(15), Validators.max(600)]],
  });

  constructor() {
    effect(() => {
      const settings = this.settingsService.settings();
      if (this.form.pristine) this.form.reset(settings);
    });
  }

  async save(): Promise<void> {
    this.error.set(null);
    this.message.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revisa los valores ingresados.');
      return;
    }
    this.saving.set(true);
    try {
      const value = this.form.getRawValue();
      await this.settingsService.save({ ...value, institutionName: value.institutionName.trim() });
      this.form.markAsPristine();
      this.toast.success('Los cambios ya se aplican en todo el panel.', { title: 'Configuración guardada' });
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }
}
