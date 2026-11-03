import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CircleAlert, Info, TriangleAlert, X } from 'lucide-angular';
import { Icon } from '../components/icon';

export type DialogTone = 'primary' | 'danger' | 'warning';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: DialogTone;
}

/** Diálogo de confirmación (CDK Dialog). Devuelve true al confirmar. */
@Component({
  selector: 'app-confirm-dialog',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-[28rem] max-w-full' },
  template: `
    <div class="animate-scale-in rounded-2xl border border-outline-variant/40 bg-surface-container p-6 shadow-2xl">
      <div class="flex items-start gap-4">
        <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" [class]="toneClass()">
          <app-icon [name]="icon()" [size]="22" />
        </span>
        <div class="min-w-0 flex-1">
          <h2 id="confirm-title" class="text-lg font-semibold text-on-surface">{{ data.title }}</h2>
          <p id="confirm-message" class="mt-1 text-sm text-on-surface-variant">{{ data.message }}</p>
        </div>
        <button type="button" class="btn-icon -mt-1 -mr-2" aria-label="Cerrar" (click)="ref.close(false)">
          <app-icon [name]="closeIcon" [size]="18" />
        </button>
      </div>

      <div class="mt-6 flex justify-end gap-3">
        <button type="button" class="btn btn-secondary" (click)="ref.close(false)">
          {{ data.cancelText ?? 'Cancelar' }}
        </button>
        <button type="button" class="btn" [class]="data.tone === 'danger' ? 'btn-danger' : 'btn-primary'"
          cdkFocusInitial (click)="ref.close(true)">
          {{ data.confirmText ?? 'Confirmar' }}
        </button>
      </div>
    </div>
  `,
})
export class ConfirmDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<ConfirmDialogData>(DIALOG_DATA);
  protected readonly closeIcon = X;

  protected readonly icon = computed(() =>
    this.data.tone === 'danger' ? CircleAlert : this.data.tone === 'warning' ? TriangleAlert : Info,
  );
  protected readonly toneClass = computed(() =>
    this.data.tone === 'danger'
      ? 'bg-status-danger/10 text-status-danger'
      : this.data.tone === 'warning'
        ? 'bg-status-warning/10 text-status-warning'
        : 'bg-primary-fixed text-primary',
  );
}
