import { Component, computed, input } from '@angular/core';
import { FieldState } from '@angular/forms/signals';

/** Lo mínimo que se necesita leer de un campo de Signal Form (acepta cualquier FieldTree). */
export type FieldLike = () => Pick<FieldState<unknown>, 'touched' | 'invalid' | 'errors' | 'pending'>;

/**
 * Muestra el primer error de un campo de Signal Form cuando ya fue tocado,
 * o "Verificando…" mientras corre una validación asíncrona.
 * Usar su `id` en `aria-describedby` del control.
 */
@Component({
  selector: 'app-field-error',
  template: `
    @if (message(); as text) {
      <p [id]="id()" class="error">{{ text }}</p>
    } @else if (pending()) {
      <p [id]="id()" class="mt-1 text-xs text-on-surface-variant" aria-live="polite">Verificando…</p>
    } @else if (hint()) {
      <p [id]="id()" class="mt-1 text-xs text-on-surface-variant">{{ hint() }}</p>
    }
  `,
})
export class FieldError {
  readonly field = input.required<FieldLike>();
  readonly id = input.required<string>();
  /** Texto de ayuda cuando no hay error. */
  readonly hint = input<string>();

  private readonly state = computed(() => this.field()());

  protected readonly message = computed(() => {
    const state = this.state();
    if (!state.touched() || !state.invalid()) return null;
    return state.errors()[0]?.message ?? 'Valor inválido.';
  });

  protected readonly pending = computed(() => this.state().pending());
}

/** true si el campo debe marcarse como inválido (para aria-invalid). */
export function showInvalid(field: FieldLike): boolean {
  const state = field();
  return state.touched() && state.invalid();
}
