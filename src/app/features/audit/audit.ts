import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';

import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  AuditEntityType,
  AuditLog,
} from '../../core/models/audit.model';
import { AuditService } from '../../core/services/audit.service';
import { errorMessage } from '../../core/services/error-message';
import { tsToDate } from '../../core/services/firestore.utils';
import { TsDatePipe } from '../../shared/pipes/ts-date.pipe';
import { downloadCsv, fileDate } from '../../shared/utils/csv';

/** W13 — Auditoría (solo lectura; las reglas impiden editar o borrar logs). */
@Component({
  selector: 'app-audit',
  imports: [DatePipe, TsDatePipe],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="page-title">Auditoría</h1>
        <p class="page-subtitle">Últimos {{ logs().length }} eventos. Solo lectura.</p>
      </div>
      <button type="button" class="btn btn-secondary" (click)="exportCsv()">Exportar CSV</button>
    </div>

    <div class="card mt-4 grid gap-3 sm:grid-cols-3">
      <div>
        <label for="search" class="label">Buscar</label>
        <input id="search" type="search" class="input" placeholder="Usuario, entidad o motivo" #q (input)="search.set(q.value)" />
      </div>
      <div>
        <label for="action" class="label">Acción</label>
        <select id="action" class="input" #a (change)="action.set(a.value)">
          <option value="">Todas</option>
          @for (item of actions; track item[0]) {
            <option [value]="item[0]">{{ item[1] }}</option>
          }
        </select>
      </div>
      <div>
        <label for="entity" class="label">Entidad</label>
        <select id="entity" class="input" #e (change)="entity.set(e.value)">
          <option value="">Todas</option>
          @for (item of entities; track item[0]) {
            <option [value]="item[0]">{{ item[1] }}</option>
          }
        </select>
      </div>
    </div>

    @if (error()) {
      <p role="alert" class="alert-error mt-4">{{ error() }}</p>
    }

    <div class="table-wrap mt-4">
      <table class="table">
        <thead>
          <tr>
            <th scope="col">Fecha y hora</th>
            <th scope="col">Usuario</th>
            <th scope="col">Acción</th>
            <th scope="col">Entidad afectada</th>
            <th scope="col">Motivo</th>
            <th scope="col">Detalle</th>
          </tr>
        </thead>
        <tbody>
          @for (log of filtered(); track log.id) {
            <tr>
              <td class="whitespace-nowrap">{{ log.createdAt | tsDate | date: 'dd/MM/yyyy HH:mm:ss' }}</td>
              <td>{{ log.actorName || log.actorId }}</td>
              <td class="font-medium text-gray-900">{{ actionLabel(log.action) }}</td>
              <td>
                {{ entityLabel(log.entityType) }}
                <span class="block font-mono text-xs text-gray-500 break-all">{{ log.entityId }}</span>
              </td>
              <td>{{ log.reason || '—' }}</td>
              <td class="max-w-xs font-mono text-xs break-all text-gray-600">{{ details(log) }}</td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="text-center text-gray-500">Sin eventos.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class Audit {
  protected readonly actions = Object.entries(AUDIT_ACTION_LABELS);
  protected readonly entities = Object.entries(AUDIT_ENTITY_LABELS);

  protected readonly search = signal('');
  protected readonly action = signal('');
  protected readonly entity = signal('');
  protected readonly error = signal<string | null>(null);

  protected readonly logs = toSignal(
    inject(AuditService)
      .getRecent(500)
      .pipe(
        catchError((e) => {
          this.error.set(errorMessage(e));
          return of([] as AuditLog[]);
        }),
      ),
    { initialValue: [] as AuditLog[] },
  );

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.logs().filter(
      (log) =>
        (!this.action() || log.action === this.action()) &&
        (!this.entity() || log.entityType === this.entity()) &&
        (!term ||
          [log.actorName, log.actorId, log.entityId, log.reason]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(term))),
    );
  });

  protected actionLabel(action: string): string {
    return AUDIT_ACTION_LABELS[action] ?? action;
  }

  protected entityLabel(entity: AuditEntityType): string {
    return AUDIT_ENTITY_LABELS[entity] ?? entity;
  }

  protected details(log: AuditLog): string {
    if (!log.details) return '—';
    return Object.entries(log.details)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
      .join(' · ');
  }

  exportCsv(): void {
    downloadCsv(
      `auditoria-${fileDate()}`,
      ['Fecha', 'Usuario', 'Acción', 'Entidad', 'ID entidad', 'Motivo', 'Detalle'],
      this.filtered().map((log) => [
        tsToDate(log.createdAt)?.toLocaleString('es-PE') ?? '',
        log.actorName || log.actorId,
        this.actionLabel(log.action),
        this.entityLabel(log.entityType),
        log.entityId,
        log.reason,
        this.details(log),
      ]),
    );
  }
}
