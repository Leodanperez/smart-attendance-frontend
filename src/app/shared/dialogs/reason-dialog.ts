import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MessageSquareText, X } from 'lucide-angular';
import { Icon } from '../components/icon';

import { DialogTone } from './confirm-dialog';

export interface ReasonDialogData {
  title: string;
  message?: string;
  label?: string;
  placeholder?: string;
  confirmText?: string;
  /** Si es obligatorio no se puede confirmar vacío. */
  required: boolean;
  tone?: DialogTone;
}

export const REASON_MAX_LENGTH = 500;

/** Diálogo para pedir un motivo (auditoría). Devuelve el texto o undefined si se cancela. */
@Component({
  selector: 'app-reason-dialog',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-[32rem] max-w-full' },
  template: `
    <form class="animate-scale-in rounded-2xl border border-outline-variant/40 bg-surface-container p-6 shadow-2xl"
      (submit)="confirm($event)" novalidate>
      <div class="flex items-start gap-4">
        <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-fixed text-primary">
          <app-icon [name]="icon" [size]="22" />
        </span>
        <div class="min-w-0 flex-1">
          <h2 id="reason-title" class="text-lg font-semibold text-on-surface">{{ data.title }}</h2>
          @if (data.message) {
            <p class="mt-1 text-sm text-on-surface-variant">{{ data.message }}</p>
          }
        </div>
        <button type="button" class="btn-icon -mt-1 -mr-2" aria-label="Cerrar" (click)="ref.close()">
          <app-icon [name]="closeIcon" [size]="18" />
        </button>
      </div>

      <div class="mt-5">
        <label for="reason" class="label">{{ data.label ?? 'Motivo' }}{{ data.required ? ' *' : ' (opcional)' }}</label>
        <textarea id="reason" rows="3" class="input" cdkFocusInitial
          [maxLength]="maxLength" [placeholder]="data.placeholder ?? 'Describe el motivo…'"
          [value]="value()" (input)="value.set($any($event.target).value)"
          [attr.aria-invalid]="showError()" aria-describedby="reason-msg"></textarea>
        <div class="flex justify-between gap-2">
          @if (showError()) {
            <p id="reason-msg" class="error">El motivo es obligatorio.</p>
          } @else {
            <p id="reason-msg" class="hint">Quedará registrado en la auditoría.</p>
          }
          <p class="hint shrink-0">{{ value().length }}/{{ maxLength }}</p>
        </div>
      </div>

      <div class="mt-6 flex justify-end gap-3">
        <button type="button" class="btn btn-secondary" (click)="ref.close()">Cancelar</button>
        <button type="submit" class="btn" [class]="data.tone === 'danger' ? 'btn-danger' : 'btn-primary'">
          {{ data.confirmText ?? 'Confirmar' }}
        </button>
      </div>
    </form>
  `,
})
export class ReasonDialog {
  protected readonly ref = inject<DialogRef<string>>(DialogRef);
  protected readonly data = inject<ReasonDialogData>(DIALOG_DATA);
  protected readonly icon = MessageSquareText;
  protected readonly closeIcon = X;
  protected readonly maxLength = REASON_MAX_LENGTH;

  protected readonly value = signal('');
  private readonly attempted = signal(false);
  protected readonly showError = computed(
    () => this.attempted() && this.data.required && !this.value().trim(),
  );

  protected confirm(event: Event): void {
    event.preventDefault();
    this.attempted.set(true);
    if (this.showError()) return;
    this.ref.close(this.value().trim());
  }
}
