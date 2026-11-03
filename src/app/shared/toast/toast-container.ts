import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { CircleAlert, CircleCheck, Info, LucideIconData, TriangleAlert, X } from 'lucide-angular';

import { Icon } from '../components/icon';
import { Toast, ToastService, ToastType } from './toast.service';

interface ToastStyle {
  icon: LucideIconData;
  /** Borde lateral, ícono y barra de progreso. */
  accent: string;
  iconBox: string;
  bar: string;
}

/** Colores con tokens del tema: funcionan en claro y oscuro. */
const STYLES: Record<ToastType, ToastStyle> = {
  success: {
    icon: CircleCheck,
    accent: 'border-status-active',
    iconBox: 'bg-status-active/15 text-status-active',
    bar: 'bg-status-active',
  },
  error: {
    icon: CircleAlert,
    accent: 'border-status-danger',
    iconBox: 'bg-status-danger/15 text-status-danger',
    bar: 'bg-status-danger',
  },
  warning: {
    icon: TriangleAlert,
    accent: 'border-status-warning',
    iconBox: 'bg-status-warning/15 text-status-warning',
    bar: 'bg-status-warning',
  },
  info: {
    icon: Info,
    accent: 'border-primary',
    iconBox: 'bg-primary/15 text-primary',
    bar: 'bg-primary',
  },
};

/** Una notificación: se cierra sola, se pausa con hover/foco y se puede cerrar con la X o Esc. */
@Component({
  selector: 'app-toast-item',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
    '(mouseenter)': 'pause()',
    '(mouseleave)': 'resume()',
    '(focusin)': 'pause()',
    '(focusout)': 'resume()',
    '(keydown.escape)': 'close()',
  },
  template: `
    <div class="toast-in pointer-events-auto relative w-full overflow-hidden rounded-xl border border-l-4 border-outline-variant/40 bg-surface-container shadow-xl ring-1 ring-black/5 dark:ring-white/5"
      [class]="style().accent"
      [attr.role]="assertive() ? 'alert' : 'status'"
      [attr.aria-live]="assertive() ? 'assertive' : 'polite'"
      aria-atomic="true">
      <div class="flex items-start gap-3 p-4 pr-10">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" [class]="style().iconBox">
          <app-icon [name]="style().icon" [size]="20" />
        </span>
        <div class="min-w-0 flex-1 pt-0.5">
          <p class="text-sm font-semibold text-on-surface">{{ toast().title }}</p>
          <p class="mt-0.5 text-sm break-words text-on-surface-variant">{{ toast().message }}</p>
        </div>
      </div>

      <button type="button" class="btn-icon absolute top-2 right-2 h-8 w-8" aria-label="Cerrar notificación" (click)="close()">
        <app-icon [name]="closeIcon" [size]="16" />
      </button>

      @if (toast().duration > 0) {
        <div class="absolute inset-x-0 bottom-0 h-1 bg-surface-container-high" aria-hidden="true">
          <div class="toast-progress h-full origin-left" [class]="style().bar"
            [style.animation-duration.ms]="toast().duration"
            [style.animation-play-state]="paused() ? 'paused' : 'running'"></div>
        </div>
      }
    </div>
  `,
})
export class ToastItem implements OnInit {
  readonly toast = input.required<Toast>();

  private readonly toasts = inject(ToastService);
  protected readonly closeIcon = X;
  protected readonly paused = signal(false);
  protected readonly style = computed(() => STYLES[this.toast().type]);
  /** Errores y advertencias se anuncian de inmediato al lector de pantalla. */
  protected readonly assertive = computed(() => this.toast().type === 'error' || this.toast().type === 'warning');

  private timer: ReturnType<typeof setTimeout> | null = null;
  private remaining = 0;
  private startedAt = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearTimer());
  }

  ngOnInit(): void {
    this.remaining = this.toast().duration;
    this.resume();
  }

  protected pause(): void {
    if (!this.timer) return;
    this.clearTimer();
    this.remaining -= Date.now() - this.startedAt;
    this.paused.set(true);
  }

  protected resume(): void {
    if (this.toast().duration <= 0 || this.timer) return;
    this.paused.set(false);
    this.startedAt = Date.now();
    this.timer = setTimeout(() => this.close(), Math.max(0, this.remaining));
  }

  protected close(): void {
    this.clearTimer();
    this.toasts.dismiss(this.toast().id);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

/** Contenedor fijo: arriba a la derecha en escritorio, abajo a lo ancho en móvil. */
@Component({
  selector: 'app-toast-container',
  imports: [ToastItem],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-label="Notificaciones"
      class="pointer-events-none fixed inset-x-0 bottom-0 z-[1100] flex flex-col-reverse gap-3 p-4 sm:inset-x-auto sm:top-20 sm:right-0 sm:bottom-auto sm:w-96 sm:flex-col">
      @for (toast of toasts(); track toast.id) {
        <app-toast-item [toast]="toast" />
      }
    </section>
  `,
})
export class ToastContainer {
  protected readonly toasts = inject(ToastService).toasts;
}
