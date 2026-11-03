import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormField, form, max, maxLength, min, required, schema, submit } from '@angular/forms/signals';
import { GraduationCap, Hash, LoaderCircle, Save, X } from 'lucide-angular';

import {
  CAREER_STATUSES,
  CAREER_STATUS_LABELS,
  Career,
  CareerStatus,
  DEFAULT_CAREER_SEMESTERS,
  MAX_CAREER_SEMESTERS,
  careerInitials,
} from '../../core/models/career.model';
import { CareerService } from '../../core/services/career.service';
import { errorMessage } from '../../core/services/error-message';
import { FieldError, showInvalid } from '../../shared/components/field-error';
import { Icon } from '../../shared/components/icon';
import { ToastService } from '../../shared/toast/toast.service';

export interface CareerFormDialogData {
  career?: Career;
}

interface CareerFormModel {
  name: string;
  description: string;
  durationSemesters: number;
  status: CareerStatus;
}

const careerSchema = schema<CareerFormModel>((p) => {
  required(p.name, { message: 'Ingresa el nombre de la carrera.' });
  maxLength(p.name, 100, { message: 'Máximo 100 caracteres.' });
  maxLength(p.description, 500, { message: 'Máximo 500 caracteres.' });
  required(p.durationSemesters, { message: 'Ingresa la duración.' });
  min(p.durationSemesters, 1, { message: 'Mínimo 1 ciclo.' });
  max(p.durationSemesters, MAX_CAREER_SEMESTERS, { message: `Máximo ${MAX_CAREER_SEMESTERS} ciclos.` });
});

/** Crear / editar carrera. Guarda desde el propio diálogo y cierra con `true`. */
@Component({
  selector: 'app-career-form-dialog',
  imports: [FormField, FieldError, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-[34rem] max-w-full' },
  template: `
    <form class="animate-scale-in rounded-2xl border border-outline-variant/40 bg-surface-container shadow-2xl"
      (submit)="save($event)" novalidate>
      <div class="flex items-center gap-3 border-b border-outline-variant/50 px-6 py-4">
        <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-fixed text-primary">
          <app-icon [name]="icons.career" [size]="20" />
        </span>
        <h2 id="career-title" class="flex-1 text-lg font-semibold text-on-surface">
          {{ data.career ? 'Editar carrera' : 'Nueva carrera' }}
        </h2>
        <button type="button" class="btn-icon" aria-label="Cerrar" (click)="ref.close()">
          <app-icon [name]="icons.close" />
        </button>
      </div>

      <div class="grid gap-5 p-6 sm:grid-cols-2">
        <div class="sm:col-span-2">
          <label for="career-name" class="label">Nombre *</label>
          <input id="career-name" [formField]="careerForm.name" class="input" cdkFocusInitial
            placeholder="Desarrollo de Sistemas de Información"
            [attr.aria-invalid]="invalid(careerForm.name)" aria-describedby="career-name-msg" />
          <app-field-error [field]="careerForm.name" id="career-name-msg" />
        </div>

        <div>
          <label for="career-code" class="label">Código</label>
          <div class="relative">
            <app-icon [name]="icons.code" class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-primary" />
            <output id="career-code" aria-live="polite"
              class="input block bg-primary-fixed/50 pl-11 font-mono font-semibold text-primary">{{ codePreview() }}</output>
          </div>
          <p class="hint">{{ data.career ? 'El código no cambia.' : 'Iniciales del nombre (se genera al guardar).' }}</p>
        </div>

        <div>
          <label for="career-semesters" class="label">Duración (ciclos) *</label>
          <input id="career-semesters" type="number" [formField]="careerForm.durationSemesters" class="input"
            [attr.aria-invalid]="invalid(careerForm.durationSemesters)" aria-describedby="career-semesters-msg" />
          <app-field-error [field]="careerForm.durationSemesters" id="career-semesters-msg"
            hint="Técnica: 6 ciclos (3 años)." />
        </div>

        <div class="sm:col-span-2">
          <label for="career-description" class="label">Descripción</label>
          <textarea id="career-description" rows="3" [formField]="careerForm.description" class="input"
            placeholder="Perfil del egresado, mención, etc."
            [attr.aria-invalid]="invalid(careerForm.description)" aria-describedby="career-description-msg"></textarea>
          <app-field-error [field]="careerForm.description" id="career-description-msg" />
        </div>

        <div>
          <label for="career-status" class="label">Estado *</label>
          <select id="career-status" [formField]="careerForm.status" class="input">
            @for (s of statuses; track s) {
              <option [value]="s">{{ statusLabels[s] }}</option>
            }
          </select>
        </div>

        @if (error()) {
          <p role="alert" class="alert-error sm:col-span-2">{{ error() }}</p>
        }
      </div>

      <div class="flex justify-end gap-3 border-t border-outline-variant/50 px-6 py-4">
        <button type="button" class="btn btn-secondary" (click)="ref.close()">Cancelar</button>
        <button type="submit" class="btn btn-primary" [disabled]="careerForm().submitting()">
          @if (careerForm().submitting()) {
            <app-icon [name]="icons.loader" class="animate-spin" /> Guardando…
          } @else {
            <app-icon [name]="icons.save" /> Guardar
          }
        </button>
      </div>
    </form>
  `,
})
export class CareerFormDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<CareerFormDialogData>(DIALOG_DATA);
  private readonly careerService = inject(CareerService);
  private readonly toast = inject(ToastService);

  protected readonly icons = { career: GraduationCap, code: Hash, close: X, save: Save, loader: LoaderCircle };
  protected readonly statuses = CAREER_STATUSES;
  protected readonly statusLabels = CAREER_STATUS_LABELS;
  protected readonly invalid = showInvalid;
  protected readonly error = signal<string | null>(null);

  protected readonly model = signal<CareerFormModel>({
    name: this.data.career?.name ?? '',
    description: this.data.career?.description ?? '',
    durationSemesters: this.data.career?.durationSemesters ?? DEFAULT_CAREER_SEMESTERS,
    status: this.data.career?.status ?? 'ACTIVE',
  });
  protected readonly careerForm = form(this.model, careerSchema);

  protected readonly codePreview = computed(() => {
    if (this.data.career) return this.data.career.code;
    const name = this.careerForm.name().value().trim();
    return name ? careerInitials(name) : '—';
  });

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    this.error.set(null);
    await submit(this.careerForm, async (fields) => {
      try {
        const value = fields().value();
        if (this.data.career) {
          await this.careerService.update(this.data.career, value);
          this.toast.success(`Se guardaron los cambios de ${value.name.trim()}.`, { title: 'Carrera actualizada' });
        } else {
          await this.careerService.create(value);
          this.toast.success(`${value.name.trim()} · ${value.durationSemesters} ciclos.`, { title: 'Carrera creada' });
        }
        this.ref.close(true);
      } catch (e) {
        const message = errorMessage(e);
        if ((e as { code?: string })?.code === 'app/career-name-in-use') {
          return { kind: 'server', message, fieldTree: fields.name };
        }
        this.error.set(message);
      }
      return null;
    });
  }
}
