import { Component, OnDestroy, effect, inject, input, signal } from '@angular/core';
import { toDataURL } from 'qrcode';

import { errorMessage } from '../../core/services/error-message';
import { SessionService } from '../../core/services/session.service';
import { SettingsService } from '../../core/services/settings.service';

/**
 * QR dinámico de la sesión. El panel del docente genera un token temporal, guarda solo su hash
 * en Firestore y lo renueva antes de expirar. El QR no contiene datos personales (solo sesión + token).
 * Modo demo sin Cloud Functions (plan gratuito).
 */
@Component({
  selector: 'app-session-qr',
  template: `
    <section class="card" aria-labelledby="qr-title">
      <div class="flex items-center justify-between gap-2">
        <h2 id="qr-title" class="font-medium text-on-surface">QR de asistencia</h2>
        @if (running()) {
          <button type="button" class="btn btn-secondary btn-sm" (click)="stop()">Ocultar QR</button>
        }
      </div>

      @if (!running()) {
        <p class="mt-2 text-sm text-on-surface-variant">
          Proyecta el QR para que los estudiantes registren su asistencia desde la app. Se renueva solo cada {{ secondsPerQr() }} s.
        </p>
        <button type="button" class="btn btn-primary mt-3" (click)="start()">Mostrar QR</button>
      } @else {
        @if (image()) {
          <img [src]="image()" alt="Código QR de asistencia de la sesión" class="mx-auto mt-3 w-full max-w-xs" />
          <p class="text-center text-sm text-on-surface-variant" aria-live="polite">Se renueva en {{ secondsLeft() }} s</p>
        } @else if (!error()) {
          <p class="mt-3 text-sm text-on-surface-variant">Generando QR…</p>
        }
      }

      @if (error()) {
        <p role="alert" class="alert-error mt-3">{{ error() }}</p>
      }
    </section>
  `,
})
export class SessionQr implements OnDestroy {
  readonly sessionId = input.required<string>();
  /** Curso de la sesión (se guarda con el token para las reglas de Firestore). */
  readonly courseId = input.required<string>();
  readonly active = input.required<boolean>();

  private readonly sessionService = inject(SessionService);
  private readonly settings = inject(SettingsService).settings;

  protected readonly running = signal(false);
  protected readonly image = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly secondsLeft = signal(0);
  protected readonly secondsPerQr = () => this.settings().qrRefreshSeconds;

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
    try {
      const seconds = this.settings().qrRefreshSeconds;
      const { token, expiresAt } = await this.sessionService.requestQrToken(this.sessionId(), this.courseId(), seconds);
      if (!this.running()) return;
      const payload = this.sessionService.buildQrPayload(this.sessionId(), this.courseId(), token);
      this.image.set(await toDataURL(payload, { width: 320, margin: 1, errorCorrectionLevel: 'M' }));

      this.expiresAt = expiresAt;
      this.tick();
      this.countdownTimer = setInterval(() => this.tick(), 1000);
      // Se renueva 3 s antes de que expire.
      this.refreshTimer = setTimeout(() => void this.refresh(), Math.max(5000, this.expiresAt - Date.now() - 3000));
    } catch (e) {
      this.image.set(null);
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
