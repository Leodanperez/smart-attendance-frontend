import { Dialog } from '@angular/cdk/dialog';
import { ComponentType } from '@angular/cdk/portal';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ConfirmDialog, ConfirmDialogData } from './confirm-dialog';
import { ReasonDialog, ReasonDialogData } from './reason-dialog';

const BASE_CONFIG = {
  backdropClass: 'dialog-backdrop',
  panelClass: 'dialog-panel',
  autoFocus: 'first-tabbable',
  restoreFocus: true,
} as const;

/** API de diálogos de la app sobre CDK Dialog (accesible: foco atrapado, Esc, aria). */
@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly dialog = inject(Dialog);

  /** true si el usuario confirma. */
  async confirm(data: ConfirmDialogData): Promise<boolean> {
    const ref = this.dialog.open<boolean, ConfirmDialogData>(ConfirmDialog, {
      ...BASE_CONFIG,
      data,
      role: 'alertdialog',
      ariaLabelledBy: 'confirm-title',
      ariaDescribedBy: 'confirm-message',
    });
    return (await firstValueFrom(ref.closed)) === true;
  }

  /** Abre un componente propio como diálogo con el estilo de la app. Devuelve el valor de cierre. */
  async open<R, D>(component: ComponentType<unknown>, data: D, ariaLabelledBy?: string): Promise<R | undefined> {
    const ref = this.dialog.open<R, D>(component, { ...BASE_CONFIG, data, ariaLabelledBy });
    return firstValueFrom(ref.closed);
  }

  /**
   * Pide un motivo. Devuelve el texto (puede ser '' si es opcional) o null si se cancela.
   */
  async reason(data: Omit<ReasonDialogData, 'required'> & { required?: boolean }): Promise<string | null> {
    const ref = this.dialog.open<string, ReasonDialogData>(ReasonDialog, {
      ...BASE_CONFIG,
      data: { required: true, ...data },
      ariaLabelledBy: 'reason-title',
    });
    const result = await firstValueFrom(ref.closed);
    return typeof result === 'string' ? result : null;
  }
}
