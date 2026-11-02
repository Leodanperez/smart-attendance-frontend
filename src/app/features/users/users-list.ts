import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
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
import { TsDatePipe } from '../../shared/pipes/ts-date.pipe';
import { askReason } from '../../shared/utils/prompt';
import { downloadCsv, fileDate } from '../../shared/utils/csv';

/** W03 — Gestión de usuarios. */
@Component({
  selector: 'app-users-list',
  imports: [RouterLink, DatePipe, TsDatePipe],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="page-title">Usuarios</h1>
        <p class="page-subtitle">{{ filtered().length }} de {{ users().length }} usuarios</p>
      </div>
      <div class="flex gap-2">
        <button type="button" class="btn btn-secondary" (click)="exportCsv()">Exportar CSV</button>
        <a routerLink="/users/new" class="btn btn-primary">Registrar usuario</a>
      </div>
    </div>

    <div class="card mt-4 grid gap-3 sm:grid-cols-3">
      <div>
        <label for="search" class="label">Buscar</label>
        <input id="search" type="search" class="input" placeholder="Nombre, correo, código o documento"
          #q (input)="search.set(q.value)" />
      </div>
      <div>
        <label for="role" class="label">Rol</label>
        <select id="role" class="input" #r (change)="role.set($any(r.value))">
          <option value="">Todos</option>
          @for (item of roles; track item) {
            <option [value]="item">{{ roleLabels[item] }}</option>
          }
        </select>
      </div>
      <div>
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
      <p role="alert" class="alert-error mt-4">{{ error() }}</p>
    }
    @if (message()) {
      <p role="status" class="alert-success mt-4">{{ message() }}</p>
    }

    <div class="table-wrap mt-4">
      <table class="table">
        <thead>
          <tr>
            <th scope="col">Código institucional</th>
            <th scope="col">Nombre completo</th>
            <th scope="col">Correo</th>
            <th scope="col">Rol</th>
            <th scope="col">Estado</th>
            <th scope="col">Fecha de registro</th>
            <th scope="col"><span class="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          @for (u of filtered(); track u.uid) {
            <tr>
              <td>{{ u.institutionalCode || '—' }}</td>
              <td class="font-medium text-gray-900">{{ name(u) }}</td>
              <td>{{ u.email }}</td>
              <td>{{ roleLabels[u.role] }}</td>
              <td><span [class]="statusBadge[u.status]">{{ statusLabels[u.status] }}</span></td>
              <td class="whitespace-nowrap">{{ u.createdAt | tsDate | date: 'dd/MM/yyyy' }}</td>
              <td>
                <div class="flex justify-end gap-2">
                  <a [routerLink]="['/users', u.uid]" class="btn btn-secondary btn-sm">Ver detalle</a>
                  @if (u.uid !== me()?.uid) {
                    @if (u.status === 'ACTIVE') {
                      <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()"
                        (click)="changeStatus(u, 'DISABLED')">Desactivar</button>
                    } @else {
                      <button type="button" class="btn btn-primary btn-sm" [disabled]="busy()"
                        (click)="changeStatus(u, 'ACTIVE')">
                        {{ u.status === 'PENDING' ? 'Validar' : 'Activar' }}
                      </button>
                    }
                  }
                </div>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="7" class="text-center text-gray-500">No hay usuarios.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class UsersList {
  private readonly userService = inject(UserService);
  protected readonly me = inject(AuthService).currentUser;

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

  async changeStatus(user: UserProfile, status: UserStatus): Promise<void> {
    const reason = askReason(`Motivo para cambiar a "${this.statusLabels[status]}" a ${fullName(user)}:`);
    if (!reason) return;
    this.busy.set(true);
    this.error.set(null);
    this.message.set(null);
    try {
      await this.userService.setStatus(user, status, reason);
      this.message.set(`${fullName(user)} ahora está ${this.statusLabels[status].toLowerCase()}.`);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
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
