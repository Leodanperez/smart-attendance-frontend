import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { CircleCheck, Download, Eye, Power, Search, Upload, UserPlus, Users } from 'lucide-angular';
import { catchError, of } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import {
  ROLE_LABELS,
  USER_ROLES,
  USER_STATUSES,
  USER_STATUS_BADGE,
  USER_STATUS_LABELS,
  UserProfile,
  UserRole,
  UserStatus,
  fullName,
} from '../../core/models/user.model';
import { errorMessage } from '../../core/services/error-message';
import { tsToDate } from '../../core/services/firestore.utils';
import { UserService } from '../../core/services/user.service';
import { Icon } from '../../shared/components/icon';
import { DialogService } from '../../shared/dialogs/dialog.service';
import { TsDatePipe } from '../../shared/pipes/ts-date.pipe';
import { ToastService } from '../../shared/toast/toast.service';
import { downloadCsv, fileDate } from '../../shared/utils/csv';
import { UsersImportDialog, UsersImportDialogData } from './import/users-import-dialog';

/** W03 — Gestión de usuarios. */
@Component({
  selector: 'app-users-list',
  imports: [RouterLink, DatePipe, TsDatePipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 class="page-title">Usuarios</h1>
          <p class="page-subtitle">{{ filtered().length }} de {{ users().length }} usuarios registrados</p>
        </div>
        <div class="flex flex-wrap gap-3">
          <button type="button" class="btn btn-secondary" (click)="exportCsv()">
            <app-icon [name]="icons.download" /> Exportar CSV
          </button>
          <button type="button" class="btn btn-secondary" (click)="openImport()">
            <app-icon [name]="icons.upload" /> Importar Excel
          </button>
          <a routerLink="/users/new" class="btn btn-primary">
            <app-icon [name]="icons.add" /> Registrar usuario
          </a>
        </div>
      </div>

      <!-- Filtros -->
      <div class="card grid gap-4 md:grid-cols-12">
        <div class="md:col-span-6">
          <label for="search" class="label">Buscar</label>
          <div class="relative">
            <app-icon [name]="icons.search" class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-outline" />
            <input id="search" type="search" class="input pl-11" placeholder="Nombre, correo, código o documento"
              #q (input)="search.set(q.value)" />
          </div>
        </div>
        <div class="md:col-span-3">
          <label for="role" class="label">Rol</label>
          <select id="role" class="input" #r (change)="role.set($any(r.value))">
            <option value="">Todos</option>
            @for (item of roles; track item) {
              <option [value]="item">{{ roleLabels[item] }}</option>
            }
          </select>
        </div>
        <div class="md:col-span-3">
          <label for="status" class="label">Estado</label>
          <select id="status" class="input" #s (change)="status.set($any(s.value))">
            <option value="">Todos</option>
            @for (item of statuses; track item) {
              <option [value]="item">{{ statusLabels[item] }}</option>
            }
          </select>
        </div>
      </div>

      @if (error()) {
        <p role="alert" class="alert-error">{{ error() }}</p>
      }
      @if (message()) {
        <p role="status" class="alert-success">{{ message() }}</p>
      }

      <!-- Tabla (escritorio) -->
      <div class="table-wrap hidden md:block">
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Usuario</th>
              <th scope="col">Código</th>
              <th scope="col">Rol</th>
              <th scope="col">Estado</th>
              <th scope="col">Registro</th>
              <th scope="col" class="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            @for (u of filtered(); track u.uid) {
              <tr class="group">
                <td>
                  <div class="flex items-center gap-3">
                    @if (u.photoUrl) {
                      <img [src]="u.photoUrl" alt="" class="h-9 w-9 rounded-full object-cover" />
                    } @else {
                      <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-xs font-bold text-primary" aria-hidden="true">
                        {{ initials(u) }}
                      </span>
                    }
                    <div class="min-w-0">
                      <p class="truncate text-sm font-semibold text-on-surface">{{ name(u) }}</p>
                      <p class="truncate text-xs text-on-surface-variant">{{ u.email }}</p>
                    </div>
                  </div>
                </td>
                <td class="font-mono text-xs">{{ u.institutionalCode || '—' }}</td>
                <td><span class="badge badge-blue">{{ roleLabels[u.role] }}</span></td>
                <td><span [class]="statusBadge[u.status]">{{ statusLabels[u.status] }}</span></td>
                <td class="whitespace-nowrap text-on-surface-variant">{{ u.createdAt | tsDate | date: 'dd/MM/yyyy' }}</td>
                <td>
                  <div class="flex justify-end gap-1">
                    <a [routerLink]="['/users', u.uid]" class="btn-icon hover:text-primary!" [attr.aria-label]="'Ver detalle de ' + name(u)" title="Ver detalle">
                      <app-icon [name]="icons.view" />
                    </a>
                    @if (u.uid !== me()?.uid) {
                      @if (u.status === 'ACTIVE') {
                        <button type="button" class="btn-icon hover:text-status-danger!" [disabled]="busy()"
                          (click)="changeStatus(u, 'DISABLED')" [attr.aria-label]="'Desactivar a ' + name(u)" title="Desactivar">
                          <app-icon [name]="icons.power" />
                        </button>
                      } @else {
                        <button type="button" class="btn-icon hover:text-status-active!" [disabled]="busy()"
                          (click)="changeStatus(u, 'ACTIVE')"
                          [attr.aria-label]="(u.status === 'PENDING' ? 'Validar a ' : 'Activar a ') + name(u)"
                          [title]="u.status === 'PENDING' ? 'Validar' : 'Activar'">
                          <app-icon [name]="icons.activate" />
                        </button>
                      }
                    }
                  </div>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6" class="py-12 text-center">
                  <app-icon [name]="icons.empty" [size]="36" class="mb-2 text-outline" />
                  <p class="text-sm text-on-surface-variant">No hay usuarios con estos filtros.</p>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <!-- Tarjetas (móvil) -->
      <ul class="space-y-3 md:hidden">
        @for (u of filtered(); track u.uid) {
          <li class="card p-4">
            <div class="flex items-start gap-3">
              <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-sm font-bold text-primary" aria-hidden="true">
                {{ initials(u) }}
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <p class="truncate text-sm font-bold text-on-surface">{{ name(u) }}</p>
                  <span [class]="statusBadge[u.status]">{{ statusLabels[u.status] }}</span>
                </div>
                <p class="mt-0.5 truncate text-xs text-on-surface-variant">{{ u.email }}</p>
                <div class="mt-2 flex items-center gap-2">
                  <span class="badge badge-blue">{{ roleLabels[u.role] }}</span>
                  <span class="font-mono text-xs text-on-surface-variant">{{ u.institutionalCode || '' }}</span>
                </div>
              </div>
            </div>
            <div class="mt-3 flex justify-end gap-2 border-t border-outline-variant/50 pt-3">
              <a [routerLink]="['/users', u.uid]" class="btn btn-secondary btn-sm"><app-icon [name]="icons.view" [size]="14" /> Ver</a>
              @if (u.uid !== me()?.uid) {
                @if (u.status === 'ACTIVE') {
                  <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="changeStatus(u, 'DISABLED')">
                    <app-icon [name]="icons.power" [size]="14" /> Desactivar
                  </button>
                } @else {
                  <button type="button" class="btn btn-primary btn-sm" [disabled]="busy()" (click)="changeStatus(u, 'ACTIVE')">
                    <app-icon [name]="icons.activate" [size]="14" /> {{ u.status === 'PENDING' ? 'Validar' : 'Activar' }}
                  </button>
                }
              }
            </div>
          </li>
        } @empty {
          <li class="card text-center text-sm text-on-surface-variant">No hay usuarios con estos filtros.</li>
        }
      </ul>
    </div>
  `,
})
export class UsersList {
  private readonly userService = inject(UserService);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);
  protected readonly me = inject(AuthService).currentUser;

  protected readonly icons = {
    add: UserPlus,
    download: Download,
    upload: Upload,
    search: Search,
    view: Eye,
    power: Power,
    activate: CircleCheck,
    empty: Users,
  };
  protected readonly roles = USER_ROLES;
  protected readonly statuses = USER_STATUSES;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly statusLabels = USER_STATUS_LABELS;
  protected readonly statusBadge = USER_STATUS_BADGE;
  protected readonly name = fullName;

  protected readonly search = signal('');
  protected readonly role = signal<UserRole | ''>('');
  protected readonly status = signal<UserStatus | ''>('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);

  protected readonly users = toSignal(
    this.userService.getAll().pipe(
      catchError((e) => {
        this.error.set(errorMessage(e));
        return of([] as UserProfile[]);
      }),
    ),
    { initialValue: [] as UserProfile[] },
  );

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.users().filter((u) => {
      if (this.role() && u.role !== this.role()) return false;
      if (this.status() && u.status !== this.status()) return false;
      if (!term) return true;
      return [fullName(u), u.email, u.institutionalCode, u.documentNumber]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  });

  protected initials(u: UserProfile): string {
    return ((u.firstName?.[0] ?? '') + (u.lastName?.[0] ?? '')).toUpperCase() || '?';
  }

  async changeStatus(user: UserProfile, status: UserStatus): Promise<void> {
    const label = this.statusLabels[status];
    const reason = await this.dialogs.reason({
      title: `Cambiar estado a "${label}"`,
      message: `${fullName(user)} (${user.email})`,
      confirmText: status === 'DISABLED' ? 'Desactivar' : 'Activar',
      tone: status === 'DISABLED' ? 'danger' : 'primary',
    });
    if (!reason) return;
    this.busy.set(true);
    this.error.set(null);
    this.message.set(null);
    try {
      await this.userService.setStatus(user, status, reason);
      this.toast.success(`${fullName(user)} ahora está ${label.toLowerCase()}.`, { title: 'Estado actualizado' });
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  /** Importar usuarios desde Excel/CSV. La lista se actualiza sola (suscripción en tiempo real). */
  async openImport(): Promise<void> {
    await this.dialogs.open<boolean, UsersImportDialogData>(
      UsersImportDialog,
      {
        // Duplicados contra los usuarios ya registrados, para avisar antes de intentar crearlos.
        isTaken: (field, value) => {
          const target = value.trim().toLowerCase();
          return this.users().some((u) =>
            field === 'documentNumber' ? (u.documentNumber ?? '').toLowerCase() === target : (u.email ?? '').toLowerCase() === target,
          );
        },
      },
      'import-title',
    );
  }

  exportCsv(): void {
    downloadCsv(
      `usuarios-${fileDate()}`,
      ['Código institucional', 'Apellidos', 'Nombres', 'Documento', 'Correo', 'Rol', 'Estado', 'Fecha de registro'],
      this.filtered().map((u) => [
        u.institutionalCode,
        u.lastName,
        u.firstName,
        u.documentNumber ? `${u.documentType ?? ''} ${u.documentNumber}` : '',
        u.email,
        this.roleLabels[u.role],
        this.statusLabels[u.status],
        tsToDate(u.createdAt)?.toLocaleDateString('es-PE') ?? '',
      ]),
    );
  }
}
