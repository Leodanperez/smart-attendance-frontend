import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toDataURL } from 'qrcode';
import {
  CircleCheck,
  Download as DownloadIcon,
  GraduationCap,
  LogIn,
  Moon,
  ScanLine,
  Smartphone,
  Sun,
  TriangleAlert,
} from 'lucide-angular';

import { environment } from '../../../environments/environment';
import { ThemeService } from '../../core/services/theme.service';
import { Icon } from '../../shared/components/icon';

/** Página pública: los estudiantes descargan e instalan el APK. No requiere iniciar sesión. */
@Component({
  selector: 'app-download',
  imports: [Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="relative min-h-dvh overflow-hidden bg-surface px-4 py-10">
      <div class="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/15 blur-3xl" aria-hidden="true"></div>

      <button type="button" class="btn-icon absolute top-4 right-4" (click)="theme.toggle()"
        [attr.aria-label]="theme.isDark() ? 'Activar modo claro' : 'Activar modo oscuro'"
        [class.!text-status-warning]="theme.isDark()">
        <app-icon [name]="theme.isDark() ? icons.sun : icons.moon" [size]="20" />
      </button>

      <div class="relative mx-auto max-w-2xl">
        <header class="text-center">
          <span class="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <app-icon [name]="icons.brand" [size]="36" class="text-primary" />
          </span>
          <h1 class="text-2xl font-bold text-primary">Smart Attendance</h1>
          <p class="mt-1 text-on-surface-variant">App de asistencia para estudiantes · Android</p>
        </header>

        <!-- Descarga -->
        <section class="card mt-8 text-center" aria-labelledby="dl-title">
          <span class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-fixed text-primary">
            <app-icon [name]="icons.phone" [size]="26" />
          </span>
          <h2 id="dl-title" class="section-title">Descargar la aplicación</h2>
          <p class="mt-1 text-sm text-on-surface-variant">Versión {{ version }} · solo Android</p>
          <a [href]="apkUrl" download class="btn btn-primary mx-auto mt-4 w-full max-w-xs">
            <app-icon [name]="icons.download" /> Descargar APK
          </a>

          <div class="mt-6 border-t border-outline-variant/50 pt-6">
            <p class="text-sm text-on-surface-variant">O escanea este código desde tu celular para abrir esta página:</p>
            @if (pageQr()) {
              <img [src]="pageQr()" alt="Código QR de esta página" class="mx-auto mt-3 w-40" />
            }
          </div>
        </section>

        <!-- Instrucciones -->
        <section class="card mt-6" aria-labelledby="steps-title">
          <h2 id="steps-title" class="section-title">Cómo instalarla</h2>
          <ol class="mt-3 space-y-3">
            @for (step of steps; track $index) {
              <li class="flex gap-3 text-sm">
                <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">
                  {{ $index + 1 }}
                </span>
                <span class="text-on-surface">{{ step }}</span>
              </li>
            }
          </ol>
          <p class="mt-4 flex items-start gap-2 rounded-xl bg-status-warning/10 px-4 py-3 text-xs text-status-warning">
            <app-icon [name]="icons.warning" [size]="16" class="mt-px shrink-0" />
            Al ser una app de demostración, Android pedirá permitir la instalación de "orígenes desconocidos". Es seguro para esta demo.
          </p>
        </section>

        <!-- Pasos de uso -->
        <section class="card mt-6" aria-labelledby="use-title">
          <h2 id="use-title" class="section-title">Cómo registrar tu asistencia</h2>
          <ul class="mt-3 space-y-2 text-sm text-on-surface">
            <li class="flex gap-2"><app-icon [name]="icons.check" [size]="16" class="mt-0.5 text-status-active" /> Inicia sesión con el correo y contraseña que te dio tu institución.</li>
            <li class="flex gap-2"><app-icon [name]="icons.scan" [size]="16" class="mt-0.5 text-primary" /> Cuando el docente proyecte el QR, ábrelo con "Escanear QR" en la app.</li>
            <li class="flex gap-2"><app-icon [name]="icons.check" [size]="16" class="mt-0.5 text-status-active" /> Tu nombre aparecerá en la pantalla del docente al instante.</li>
          </ul>
        </section>

        <div class="mt-6 text-center">
          <a routerLink="/login" class="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
            <app-icon [name]="icons.login" [size]="16" /> Ir al panel web (docentes y administradores)
          </a>
        </div>
      </div>
    </main>
  `,
})
export class Download {
  protected readonly theme = inject(ThemeService);

  protected readonly icons = {
    brand: GraduationCap,
    phone: Smartphone,
    download: DownloadIcon,
    warning: TriangleAlert,
    check: CircleCheck,
    scan: ScanLine,
    login: LogIn,
    moon: Moon,
    sun: Sun,
  };
  protected readonly apkUrl = environment.apkUrl;
  protected readonly version = environment.apkVersion;
  protected readonly steps = [
    'Toca "Descargar APK" y espera a que termine la descarga.',
    'Abre el archivo descargado (notificación o carpeta Descargas).',
    'Si Android lo pide, permite instalar apps de esta fuente.',
    'Toca "Instalar" y luego "Abrir".',
  ];

  protected readonly pageQr = signal<string | null>(null);

  constructor() {
    void toDataURL(window.location.href, { width: 240, margin: 1 }).then((url) => this.pageQr.set(url));
  }
}
