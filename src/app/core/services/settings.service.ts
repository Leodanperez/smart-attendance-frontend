import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Firestore, doc, docData, serverTimestamp, writeBatch } from '@angular/fire/firestore';
import { Observable, catchError, map, of, shareReplay, switchMap } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { AppSettings, DEFAULT_SETTINGS } from '../models/settings.model';
import { AuditService } from './audit.service';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);
  private readonly auth = inject(AuthService);
  private readonly audit = inject(AuditService);

  private run<T>(fn: () => T): T {
    return runInInjectionContext(this.injector, fn);
  }

  /** settings/general en vivo, con valores por defecto si no existe. */
  readonly settings$: Observable<AppSettings> = this.auth.scopeUser$.pipe(
    switchMap((user) =>
      user
        ? this.run(() => docData(doc(this.firestore, 'settings', 'general'))).pipe(
            map((data) => ({ ...DEFAULT_SETTINGS, ...(data as Partial<AppSettings> | undefined) })),
            catchError(() => of(DEFAULT_SETTINGS)),
          )
        : of(DEFAULT_SETTINGS),
    ),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  readonly settings = toSignal(this.settings$, { initialValue: DEFAULT_SETTINGS });

  async save(settings: AppSettings): Promise<void> {
    const batch = this.run(() => writeBatch(this.firestore));
    batch.set(
      this.run(() => doc(this.firestore, 'settings', 'general')),
      {
        ...settings,
        updatedAt: serverTimestamp(),
        updatedBy: this.auth.currentUser()?.uid ?? null,
      },
      { merge: true },
    );
    this.audit.addToBatch(batch, {
      action: 'SETTINGS_UPDATED',
      entityType: 'SETTINGS',
      entityId: 'general',
      details: { ...settings },
    });
    await batch.commit();
  }
}
