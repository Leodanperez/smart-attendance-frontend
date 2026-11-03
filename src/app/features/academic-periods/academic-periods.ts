import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { BookOpen, CalendarDays, CirclePlay, CircleStop, Pencil, Plus } from 'lucide-angular';

import {
  AcademicPeriod,
  PERIOD_STATUS_BADGE,
  PERIOD_STATUS_LABELS,
  nextPeriod,
  periodRangeLabel,
} from '../../core/models/academic-period.model';
import { AcademicPeriodService } from '../../core/services/academic-period.service';
import { AcademicScopeService } from '../../core/services/academic-scope.service';
import { errorMessage } from '../../core/services/error-message';
import { Icon } from '../../shared/components/icon';
import { DialogService } from '../../shared/dialogs/dialog.service';
import { PeriodFormDialog, PeriodFormDialogData } from './period-form-dialog';
import { ToastService } from '../../shared/toast/toast.service';

/** Periodos académicos (2026-I, 2026-II…). Solo ADMIN. */
@Component({
  selector: 'app-academic-periods',
  imports: [Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 class="page-title">Periodos académicos</h1>
          <p class="page-subtitle">
            Dos periodos por año: <strong>I</strong> (marzo – julio) y <strong>II</strong> (agosto – diciembre).
            Cada curso se dicta en un periodo.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="create()">
          <app-icon [name]="icons.add" /> Nuevo periodo
        </button>
      </div>

      @if (error()) {
        <p role="alert" class="alert-error">{{ error() }}</p>
      }
      @if (message()) {
        <p role="status" class="alert-success">{{ message() }}</p>
      }

      @if (active(); as a) {
        <div class="card flex flex-wrap items-center gap-4 border-l-4 border-status-active">
          <span class="flex h-12 w-12 items-center justify-center rounded-xl bg-status-active/10 text-status-active">
            <app-icon [name]="icons.period" [size]="24" />
          </span>
          <div class="flex-1">
            <p class="text-xs font-semibold tracking-wider text-on-surface-variant uppercase">Periodo en curso</p>
            <p class="text-2xl font-bold text-on-surface">{{ a.name }}</p>
            <p class="text-sm text-on-surface-variant">{{ range(a) }} · {{ courseCount().get(a.id) ?? 0 }} cursos</p>
          </div>
        </div>
      } @else if (periods().length) {
        <p class="alert-info">No hay un periodo en curso. Inicia uno para crear sus cursos y sesiones.</p>
      }

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Periodo</th>
              <th scope="col">Fechas</th>
              <th scope="col">Cursos</th>
              <th scope="col">Estado</th>
              <th scope="col" class="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            @for (p of periods(); track p.id) {
              <tr>
                <td class="font-mono text-base font-bold text-on-surface">{{ p.name }}</td>
                <td class="whitespace-nowrap text-on-surface-variant">{{ range(p) }}</td>
                <td>
                  <a routerLink="/courses" [queryParams]="{ periodId: p.id }"
                    class="inline-flex items-center gap-1.5 text-primary hover:underline">
                    <app-icon [name]="icons.courses" [size]="16" /> {{ courseCount().get(p.id) ?? 0 }}
                  </a>
                </td>
                <td><span [class]="statusBadge[p.status]">{{ statusLabels[p.status] }}</span></td>
                <td>
                  <div class="flex justify-end gap-2">
                    @if (p.status !== 'CLOSED') {
                      <button type="button" class="btn-icon hover:!text-primary" (click)="edit(p)"
                        [attr.aria-label]="'Editar fechas de ' + p.name" title="Editar fechas">
                        <app-icon [name]="icons.edit" />
                      </button>
                    }
                    @if (p.status !== 'ACTIVE') {
                      <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="activate(p)">
                        <app-icon [name]="icons.start" [size]="14" /> {{ p.status === 'CLOSED' ? 'Reabrir' : 'Iniciar' }}
                      </button>
                    } @else {
                      <button type="button" class="btn btn-danger btn-sm" [disabled]="busy()" (click)="close(p)">
                        <app-icon [name]="icons.stop" [size]="14" /> Cerrar
                      </button>
                    }
                  </div>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5" class="py-12 text-center">
                  <app-icon [name]="icons.period" [size]="40" class="mb-2 text-outline" />
                  <p class="text-sm text-on-surface-variant">Aún no hay periodos. Crea el {{ suggestedName() }}.</p>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class AcademicPeriods {
  private readonly periodService = inject(AcademicPeriodService);
  private readonly dialogs = inject(DialogService);
  private readonly scope = inject(AcademicScopeService);

  protected readonly icons = {
    add: Plus,
    edit: Pencil,
    start: CirclePlay,
    stop: CircleStop,
    period: CalendarDays,
    courses: BookOpen,
  };
  protected readonly statusLabels = PERIOD_STATUS_LABELS;
  protected readonly statusBadge = PERIOD_STATUS_BADGE;
  protected readonly range = periodRangeLabel;

  protected readonly busy = signal(false);
  private readonly toast = inject(ToastService);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);

  protected readonly periods = this.periodService.periods;
  protected readonly active = computed(() => this.periods().find((p) => p.status === 'ACTIVE') ?? null);
  protected readonly suggestedName = computed(() => {
    const n = nextPeriod(this.periods());
    return `${n.year}-${n.term === 1 ? 'I' : 'II'}`;
  });

  private readonly courses = toSignal(this.scope.courses$, { initialValue: [] });
  protected readonly courseCount = computed(() => {
    const counts = new Map<string, number>();
    for (const c of this.courses()) {
      if (c.academicPeriodId) counts.set(c.academicPeriodId, (counts.get(c.academicPeriodId) ?? 0) + 1);
    }
    return counts;
  });

  protected async create(): Promise<void> {
    await this.dialogs.open<boolean, PeriodFormDialogData>(
      PeriodFormDialog,
      { suggested: nextPeriod(this.periods()) },
      'period-title',
    );
  }

  protected async edit(period: AcademicPeriod): Promise<void> {
    await this.dialogs.open<boolean, PeriodFormDialogData>(PeriodFormDialog, { period }, 'period-title');
  }

  protected async activate(period: AcademicPeriod): Promise<void> {
    const current = this.active();
    const ok = await this.dialogs.confirm({
      title: `${period.status === 'CLOSED' ? 'Reabrir' : 'Iniciar'} periodo ${period.name}`,
      message: current
        ? `${period.name} pasará a estar en curso. ${current.name} se cerrará y sus cursos quedarán inactivos (las asistencias se conservan).`
        : `${period.name} pasará a estar en curso.`,
      confirmText: period.status === 'CLOSED' ? 'Reabrir' : 'Iniciar periodo',
      tone: current ? 'warning' : 'primary',
    });
    if (!ok) return;
    await this.run(async () => {
      await this.periodService.activate(period, this.periods());
      return `${period.name} está en curso.`;
    });
  }

  protected async close(period: AcademicPeriod): Promise<void> {
    const reason = await this.dialogs.reason({
      title: `Cerrar periodo ${period.name}`,
      message: 'Sus cursos quedarán inactivos y no se podrán crear sesiones. Las asistencias y reportes se conservan.',
      confirmText: 'Cerrar periodo',
      tone: 'danger',
      required: false,
    });
    if (reason === null) return;
    await this.run(async () => {
      const count = await this.periodService.close(period, reason || null);
      return `${period.name} cerrado. ${count} curso(s) pasaron a inactivos.`;
    });
  }

  private async run(action: () => Promise<string>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.message.set(null);
    try {
      const msg = await action();
      if (msg) this.toast.success(msg);
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
