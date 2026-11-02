import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  WriteBatch,
  collection,
  collectionData,
  doc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { AuditEntityType, AuditLog } from '../models/audit.model';
import { combineLists, tsMillis } from './firestore.utils';

export interface AuditEntry {
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  reason?: string | null;
  details?: Record<string, unknown> | null;
}

@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);
  private readonly auth = inject(AuthService);

  private run<T>(fn: () => T): T {
    return runInInjectionContext(this.injector, fn);
  }

  /**
   * Agrega el log al mismo batch que la operación: si falla uno, no se guarda ninguno.
   * Las reglas solo permiten crear logs con actorId = usuario autenticado; no se pueden editar ni borrar.
   */
  addToBatch(batch: WriteBatch, entry: AuditEntry): void {
    const actor = this.auth.currentUser();
    if (!actor) throw { code: 'functions/unauthenticated' };
    const ref = this.run(() => doc(collection(this.firestore, 'auditLogs')));
    batch.set(ref, {
      actorId: actor.uid,
      actorName: actor.displayName,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      reason: entry.reason ?? null,
      details: entry.details ?? null,
      createdAt: serverTimestamp(),
    });
  }

  getRecent(max = 300): Observable<AuditLog[]> {
    return this.run(() =>
      collectionData(
        query(collection(this.firestore, 'auditLogs'), orderBy('createdAt', 'desc'), limit(max)),
        { idField: 'id' },
      ),
    ) as Observable<AuditLog[]>;
  }

  /** Actividad relacionada con una entidad o realizada por un actor (sin índices compuestos). */
  getActivity(id: string): Observable<AuditLog[]> {
    const byField = (field: 'entityId' | 'actorId') =>
      this.run(() =>
        collectionData(query(collection(this.firestore, 'auditLogs'), where(field, '==', id)), {
          idField: 'id',
        }),
      ) as Observable<AuditLog[]>;

    return combineLists([byField('entityId'), byField('actorId')]).pipe(
      map((logs) => {
        const unique = new Map(logs.map((log) => [log.id, log]));
        return [...unique.values()].sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
      }),
    );
  }
}
