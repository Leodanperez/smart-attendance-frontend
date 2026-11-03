import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { BookOpen, CircleCheck, GraduationCap, Pencil, Plus, Power, Search } from 'lucide-angular';
import { catchError, of } from 'rxjs';

import {
  CAREER_STATUS_BADGE,
  CAREER_STATUS_LABELS,
  Career,
} from '../../core/models/career.model';
import { AcademicScopeService } from '../../core/services/academic-scope.service';
import { CareerService } from '../../core/services/career.service';
import { errorMessage } from '../../core/services/error-message';
import { Icon } from '../../shared/components/icon';
import { DialogService } from '../../shared/dialogs/dialog.service';
import { ToastService } from '../../shared/toast/toast.service';
import { CareerFormDialog, CareerFormDialogData } from './career-form-dialog';

/** Gestión de carreras del instituto (ADMIN). */
@Component({
  selector: 'app-careers',
  imports: [Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 class="page-title">Carreras</h1>
          <p class="page-subtitle">{{ careers().length }} carreras profesionales · los cursos se organizan por carrera, ciclo y periodo</p>
        </div>
        <button type="button" class="btn btn-primary" (click)="openForm()">
          <app-icon [name]="icons.add" /> Nueva carrera
        </button>
      </div>

      <div class="card">
        <label for="career-search" class="label">Buscar</label>
        <div class="relative max-w-md">
          <app-icon [name]="icons.search" class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-outline" />
          <input id="career-search" type="search" class="input pl-11" placeholder="Nombre o código"
            #q (input)="search.set(q.value)" />
        </div>
      </div>

      @if (error()) {
        <p role="alert" class="alert-error">{{ error() }}</p>
      }

      <ul class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        @for (c of filtered(); track c.id) {
          <li class="card flex flex-col">
            <div class="flex items-start gap-3">
              <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-fixed font-mono text-sm font-bold text-primary">
                {{ c.code }}
              </span>
              <div class="min-w-0 flex-1">
                <p class="font-semibold text-on-surface">{{ c.name }}</p>
                <p class="mt-0.5 text-xs text-on-surface-variant">{{ c.durationSemesters }} ciclos</p>
              </div>
              <span [class]="statusBadge[c.status]">{{ statusLabels[c.status] }}</span>
            </div>
            @if (c.description) {
              <p class="mt-3 line-clamp-2 text-sm text-on-surface-variant">{{ c.description }}</p>
            }
            <div class="mt-auto flex items-center justify-between gap-2 border-t border-outline-variant/50 pt-3">
              <a routerLink="/courses" [queryParams]="{ careerId: c.id }"
                class="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                <app-icon [name]="icons.courses" [size]="16" /> {{ courseCount().get(c.id) ?? 0 }} cursos
              </a>
              <div class="flex gap-1">
                <button type="button" class="btn-icon hover:!text-primary" (click)="openForm(c)"
                  [attr.aria-label]="'Editar ' + c.name" title="Editar">
                  <app-icon [name]="icons.edit" />
                </button>
                <button type="button" class="btn-icon" [disabled]="busy()" (click)="toggleStatus(c)"
                  [class]="c.status === 'ACTIVE' ? 'hover:!text-status-danger' : 'hover:!text-status-active'"
                  [attr.aria-label]="(c.status === 'ACTIVE' ? 'Desactivar ' : 'Activar ') + c.name"
                  [title]="c.status === 'ACTIVE' ? 'Desactivar' : 'Activar'">
                  <app-icon [name]="c.status === 'ACTIVE' ? icons.power : icons.activate" />
                </button>
              </div>
            </div>
          </li>
        } @empty {
          <li class="card col-span-full py-12 text-center">
            <app-icon [name]="icons.career" [size]="40" class="mb-2 text-outline" />
            <p class="text-sm text-on-surface-variant">Aún no hay carreras. Crea la primera para organizar los cursos.</p>
          </li>
        }
      </ul>
    </div>
  `,
})
export class Careers {
  private readonly careerService = inject(CareerService);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly scope = inject(AcademicScopeService);

  protected readonly icons = {
    add: Plus,
    search: Search,
    edit: Pencil,
    power: Power,
    activate: CircleCheck,
    courses: BookOpen,
    career: GraduationCap,
  };
  protected readonly statusLabels = CAREER_STATUS_LABELS;
  protected readonly statusBadge = CAREER_STATUS_BADGE;

  protected readonly search = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly careers = toSignal(
    this.careerService.getAll().pipe(
      catchError((e) => {
        this.error.set(errorMessage(e));
        return of([] as Career[]);
      }),
    ),
    { initialValue: [] as Career[] },
  );
  private readonly courses = toSignal(this.scope.courses$, { initialValue: [] });

  protected readonly courseCount = computed(() => {
    const counts = new Map<string, number>();
    for (const c of this.courses()) if (c.careerId) counts.set(c.careerId, (counts.get(c.careerId) ?? 0) + 1);
    return counts;
  });

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.careers().filter((c) => !term || `${c.name} ${c.code}`.toLowerCase().includes(term));
  });

  protected async openForm(career?: Career): Promise<void> {
    await this.dialogs.open<boolean, CareerFormDialogData>(CareerFormDialog, { career }, 'career-title');
  }

  protected async toggleStatus(career: Career): Promise<void> {
    const activate = career.status !== 'ACTIVE';
    const reason = await this.dialogs.reason({
      title: `${activate ? 'Activar' : 'Desactivar'} carrera`,
      message: activate
        ? `${career.name} volverá a estar disponible para nuevos cursos.`
        : `${career.name} no se podrá elegir en nuevos cursos. Sus cursos actuales no cambian.`,
      confirmText: activate ? 'Activar' : 'Desactivar',
      tone: activate ? 'primary' : 'danger',
      required: false,
    });
    if (reason === null) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.careerService.setStatus(career, activate ? 'ACTIVE' : 'INACTIVE', reason || null);
      if (activate) this.toast.success(`${career.name} está disponible para nuevos cursos.`, { title: 'Carrera activada' });
      else this.toast.warning(`${career.name} ya no se podrá elegir en cursos nuevos.`, { title: 'Carrera desactivada' });
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
