import { Component, OnDestroy, effect, inject, input, signal } from '@angular/core';
import { toDataURL } from 'qrcode';

import { errorMessage } from '../../core/services/error-message';
import { QR_TOKEN_FUNCTION, SessionService } from '../../core/services/session.service';
import { SettingsService } from '../../core/services/settings.service';

/**
 * QR dinámico de la sesión. El token lo entrega la Cloud Function (nunca se genera en Angular)
 * y se renueva antes de expirar. El QR solo contiene el token, sin datos personales.
 */
@Component({
  selector: 'app-session-qr',
  template: `
    <section class="card" aria-labelledby="qr-title">
      <div class="flex items-center justify-between gap-2">
        <h2 id="qr-title" class="font-medium text-gray-900">QR de asistencia</h2>
        @if (running()) {
          <button type="button" class="btn btn-secondary btn-sm" (click)="stop()">Ocultar QR</button>
        }
      </div>

      @if (!running()) {
        <p class="mt-2 text-sm text-gray-600">Muestra el QR para que los estudiantes registren su asistencia desde la app.</p>
        <button type="button" class="btn btn-primary mt-3" (click)="start()">Mostrar QR</button>
      } @else {
        @if (image()) {
          <img [src]="image()" alt="Código QR de asistencia de la sesión" class="mx-auto mt-3 w-full max-w-xs" />
          <p class="text-center text-sm text-gray-600" aria-live="polite">Se renueva en {{ secondsLeft() }} s</p>
        } @else if (!error()) {
          <p class="mt-3 text-sm text-gray-500">Generando QR…</p>
        }
      }

      @if (error()) {
        <p role="alert" class="alert-error mt-3">{{ error() }}</p>
        @if (missingFunction()) {
          <p class="mt-2 text-xs text-gray-500">
            Despliega la callable <code>{{ functionName }}</code> que recibe <code>{{ '{ sessionId }' }}</code>
            y responde <code>{{ '{ token, expiresAt }' }}</code>.
          </p>
        }
      }
    </section>
  `,
})
export class SessionQr implements OnDestroy {
  readonly sessionId = input.required<string>();
  readonly active = input.required<boolean>();

  private readonly sessionService = inject(SessionService);
  private readonly settings = inject(SettingsService).settings;

  protected readonly functionName = QR_TOKEN_FUNCTION;
  protected readonly running = signal(false);
  protected readonly image = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly missingFunction = signal(false);
  protected readonly secondsLeft = signal(0);

  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private expiresAt = 0;

  constructor() {
    // Si la sesión se cierra o cambia, se detiene el QR.
    effect(() => {
      this.sessionId();
      if (!this.active()) this.stop();
    });
  }

  start(): void {
    this.running.set(true);
    void this.refresh();
  }

  stop(): void {
    this.running.set(false);
    this.image.set(null);
    this.clearTimers();
  }

  ngOnDestroy(): void {
    this.clearTimers();
  }

  private async refresh(): Promise<void> {
    this.clearTimers();
    if (!this.running()) return;
    this.error.set(null);
    this.missingFunction.set(false);
    try {
      const { token, expiresAt } = await this.sessionService.requestQrToken(this.sessionId());
      if (!this.running()) return;
      this.image.set(await toDataURL(token, { width: 320, margin: 1, errorCorrectionLevel: 'M' }));

      const fallback = Date.now() + this.settings().qrRefreshSeconds * 1000;
      this.expiresAt = Number.isFinite(expiresAt) && expiresAt > Date.now() ? expiresAt : fallback;
      this.tick();
      this.countdownTimer = setInterval(() => this.tick(), 1000);
      // Se renueva 3 s antes de que expire.
      this.refreshTimer = setTimeout(() => void this.refresh(), Math.max(5000, this.expiresAt - Date.now() - 3000));
    } catch (e) {
      this.image.set(null);
      this.missingFunction.set((e as { code?: string })?.code === 'functions/not-found');
      this.error.set(errorMessage(e));
    }
  }

  private tick(): void {
    this.secondsLeft.set(Math.max(0, Math.round((this.expiresAt - Date.now()) / 1000)));
  }

  private clearTimers(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.refreshTimer = null;
    this.countdownTimer = null;
  }
}
