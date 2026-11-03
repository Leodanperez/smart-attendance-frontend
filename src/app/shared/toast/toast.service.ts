import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  /** Título en negrita (por defecto según el tipo). */
  title?: string;
  /** Milisegundos visibles. 0 = no se cierra sola. */
  duration?: number;
}

export interface Toast {
  id: number;
  type: ToastType;
  title: string;
  message: string;
  duration: number;
}

const DEFAULT_TITLES: Record<ToastType, string> = {
  success: 'Listo',
  error: 'Ocurrió un error',
  warning: 'Atención',
  info: 'Información',
};

/** Los errores se leen con más calma. */
const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 4000,
  info: 5000,
  warning: 6000,
  error: 7000,
};

const MAX_VISIBLE = 4;

/**
 * Notificaciones flotantes (toasts) para el resultado de operaciones (crear, editar, eliminar…).
 *   inject(ToastService).success('Curso creado.');
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  success(message: string, options?: ToastOptions): number {
    return this.show('success', message, options);
  }

  error(message: string, options?: ToastOptions): number {
    return this.show('error', message, options);
  }

  warning(message: string, options?: ToastOptions): number {
    return this.show('warning', message, options);
  }

  info(message: string, options?: ToastOptions): number {
    return this.show('info', message, options);
  }

  show(type: ToastType, message: string, options: ToastOptions = {}): number {
    const toast: Toast = {
      id: this.nextId++,
      type,
      title: options.title ?? DEFAULT_TITLES[type],
      message,
      duration: options.duration ?? DEFAULT_DURATION[type],
    };
    // Los más recientes arriba; se descartan los más antiguos.
    this._toasts.update((list) => [toast, ...list].slice(0, MAX_VISIBLE));
    return toast.id;
  }

  dismiss(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }

  clear(): void {
    this._toasts.set([]);
  }
}
