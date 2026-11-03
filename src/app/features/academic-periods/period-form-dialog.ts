import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormField, form, max, min, required, schema, submit, validate } from '@angular/forms/signals';
import { CalendarDays, LoaderCircle, Save, X } from 'lucide-angular';

import {
  AcademicPeriod,
  PERIOD_TERMS,
  PeriodTerm,
  defaultPeriodDates,
  periodName,
} from '../../core/models/academic-period.model';
import { AcademicPeriodService } from '../../core/services/academic-period.service';
import { errorMessage } from '../../core/services/error-message';
import { FieldError, showInvalid } from '../../shared/components/field-error';
import { Icon } from '../../shared/components/icon';
import { ToastService } from '../../shared/toast/toast.service';

export interface PeriodFormDialogData {
  /** Editar fechas de un periodo existente. */
  period?: AcademicPeriod;
  /** Sugerencia para uno nuevo. */
  suggested?: { year: number; term: PeriodTerm };
}

interface PeriodFormModel {
  year: number;
  term: PeriodTerm;
  startsOn: string;
  endsOn: string;
}

const periodSchema = schema<PeriodFormModel>((p) => {
  required(p.year, { message: 'Ingresa el año.' });
  min(p.year, 2020, { message: 'Año no válido.' });
  max(p.year, 2100, { message: 'Año no válido.' });
  required(p.startsOn, { message: 'Ingresa la fecha de inicio.' });
  required(p.endsOn, { message: 'Ingresa la fecha de fin.' });
  // Validación cruzada: fin posterior al inicio.
  validate(p.endsOn, ({ value, valueOf }) =>
    value() && valueOf(p.startsOn) && value() <= valueOf(p.startsOn)
      ? { kind: 'range', message: 'Debe ser posterior a la fecha de inicio.' }
      : null,
  );
});

@Component({
  selector: 'app-period-form-dialog',
  imports: [FormField, FieldError, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-[32rem] max-w-full' },
  template: `
    <form class="animate-scale-in rounded-2xl border border-outline-variant/40 bg-surface-container shadow-2xl"
      (submit)="save($event)" novalidate>
      <div class="flex items-center gap-3 border-b border-outline-variant/50 px-6 py-4">
        <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-fixed text-primary">
          <app-icon [name]="icons.period" [size]="20" />
        </span>
        <h2 id="period-title" class="flex-1 text-lg font-semibold text-on-surface">
          {{ data.period ? 'Editar periodo ' + data.period.name : 'Nuevo periodo académico' }}
        </h2>
        <button type="button" class="btn-icon" aria-label="Cerrar" (click)="ref.close()">
          <app-icon [name]="icons.close" />
        </button>
      </div>

      <div class="grid gap-5 p-6 sm:grid-cols-2">
        <div>
          <label for="period-year" class="label">Año *</label>
          @if (data.period) {
            <output id="period-year" class="input block bg-surface-container-high">{{ data.period.year }}</output>
          } @else {
            <input id="period-year" type="number" [formField]="periodForm.year" class="input"
              (change)="suggestDates()" [attr.aria-invalid]="invalid(periodForm.year)" aria-describedby="period-year-msg" />
            <app-field-error [field]="periodForm.year" id="period-year-msg" />
          }
        </div>
        <div>
          <label for="period-term" class="label">Periodo *</label>
          <select id="period-term" class="input" [disabled]="!!data.period"
            [value]="model().term" (change)="setTerm($any($event.target).value)">
            @for (t of terms; track t) {
              <option [value]="t">{{ t === 1 ? 'I (marzo – julio)' : 'II (agosto – diciembre)' }}</option>
            }
          </select>
        </div>

        <div class="sm:col-span-2 rounded-xl bg-primary-fixed/50 px-4 py-3 text-center">
          <p class="text-xs text-on-surface-variant">Nombre del periodo</p>
          <p class="font-mono text-xl font-bold text-primary" aria-live="polite">{{ name() }}</p>
        </div>

        <div>
          <label for="period-start" class="label">Inicio de clases *</label>
          <input id="period-start" type="date" [formField]="periodForm.startsOn" class="input"
            [attr.aria-invalid]="invalid(periodForm.startsOn)" aria-describedby="period-start-msg" />
          <app-field-error [field]="periodForm.startsOn" id="period-start-msg" />
        </div>
        <div>
          <label for="period-end" class="label">Fin de clases *</label>
          <input id="period-end" type="date" [formField]="periodForm.endsOn" class="input"
            [attr.aria-invalid]="invalid(periodForm.endsOn)" aria-describedby="period-end-msg" />
          <app-field-error [field]="periodForm.endsOn" id="period-end-msg" />
        </div>

        @if (error()) {
          <p role="alert" class="alert-error sm:col-span-2">{{ error() }}</p>
        }
      </div>

      <div class="flex justify-end gap-3 border-t border-outline-variant/50 px-6 py-4">
        <button type="button" class="btn btn-secondary" (click)="ref.close()">Cancelar</button>
        <button type="submit" class="btn btn-primary" [disabled]="periodForm().submitting()">
          @if (periodForm().submitting()) {
            <app-icon [name]="icons.loader" class="animate-spin" /> Guardando…
          } @else {
            <app-icon [name]="icons.save" /> Guardar
          }
        </button>
      </div>
    </form>
  `,
})
export class PeriodFormDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<PeriodFormDialogData>(DIALOG_DATA);
  private readonly periodService = inject(AcademicPeriodService);
  private readonly toast = inject(ToastService);

  protected readonly icons = { period: CalendarDays, close: X, save: Save, loader: LoaderCircle };
  protected readonly terms = PERIOD_TERMS;
  protected readonly invalid = showInvalid;
  protected readonly error = signal<string | null>(null);

  protected readonly model = signal<PeriodFormModel>(this.initial());
  protected readonly periodForm = form(this.model, periodSchema);
  protected readonly name = computed(() => periodName(this.model().year, this.model().term));

  private initial(): PeriodFormModel {
    const p = this.data.period;
    if (p) return { year: p.year, term: p.term, startsOn: p.startsOn, endsOn: p.endsOn };
    const s = this.data.suggested ?? { year: new Date().getFullYear(), term: 1 as PeriodTerm };
    return { ...s, ...defaultPeriodDates(s.year, s.term) };
  }

  protected setTerm(value: string): void {
    this.model.update((m) => ({ ...m, term: Number(value) === 2 ? 2 : 1 }));
    this.suggestDates();
  }

  /** Al cambiar año o periodo (solo al crear) se proponen las fechas habituales. */
  protected suggestDates(): void {
    if (this.data.period) return;
    this.model.update((m) => ({ ...m, ...defaultPeriodDates(m.year, m.term) }));
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    this.error.set(null);
    await submit(this.periodForm, async (fields) => {
      try {
        const v = fields().value();
        if (this.data.period) {
          await this.periodService.updateDates(this.data.period, v.startsOn, v.endsOn);
          this.toast.success(`Se actualizaron las fechas de ${this.data.period.name}.`, { title: 'Periodo actualizado' });
        } else {
          const name = await this.periodService.create({ ...v, year: Math.round(v.year) });
          this.toast.success(`${name} quedó planificado. Inícialo cuando empiecen las clases.`, { title: 'Periodo creado' });
        }
        this.ref.close(true);
      } catch (e) {
        this.error.set(errorMessage(e));
      }
      return null;
    });
  }
}
