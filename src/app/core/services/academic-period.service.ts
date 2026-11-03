import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Firestore,
  WriteBatch,
  collection,
  collectionData,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { Observable, catchError, map, of, shareReplay, switchMap } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import {
  AcademicPeriod,
  PeriodInput,
  comparePeriods,
  normalizePeriod,
  periodName,
} from '../models/academic-period.model';
import { AuditService } from './audit.service';

@Injectable({ providedIn: 'root' })
export class AcademicPeriodService {
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);
  private readonly auth = inject(AuthService);
  private readonly audit = inject(AuditService);

  private run<T>(fn: () => T): T {
    return runInInjectionContext(this.injector, fn);
  }

  private get periodsRef() {
    return this.run(() => collection(this.firestore, 'academicPeriods'));
  }

  /** Todos los periodos, más reciente primero (compartido; se reinicia al cambiar de usuario). */
  readonly periods$: Observable<AcademicPeriod[]> = this.auth.scopeUser$.pipe(
    switchMap((user) =>
      user
        ? this.run(() => collectionData(this.periodsRef, { idField: 'id' })).pipe(
            map((list) => list.map((d) => normalizePeriod(d, d['id'] as string)).sort(comparePeriods)),
            catchError(() => of([] as AcademicPeriod[])),
          )
        : of([] as AcademicPeriod[]),
    ),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  readonly periods = toSignal(this.periods$, { initialValue: [] as AcademicPeriod[] });

  /** Periodo en curso (o null). */
  readonly active$: Observable<AcademicPeriod | null> = this.periods$.pipe(
    map((list) => list.find((p) => p.status === 'ACTIVE') ?? null),
  );

  /** Crea el periodo como PLANNED. El ID es su nombre (2026-I), por eso no se duplica. */
  async create(input: PeriodInput): Promise<string> {
    const name = periodName(input.year, input.term);
    const ref = this.run(() => doc(this.firestore, 'academicPeriods', name));
    const existing = await this.run(() => getDoc(ref));
    if (existing.exists()) throw { code: 'app/period-exists' };

    const batch = this.run(() => writeBatch(this.firestore));
    batch.set(ref, {
      name,
      year: input.year,
      term: input.term,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      status: 'PLANNED',
      createdBy: this.auth.currentUser()?.uid ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    this.audit.addToBatch(batch, {
      action: 'PERIOD_CREATED',
      entityType: 'PERIOD',
      entityId: name,
      details: { startsOn: input.startsOn, endsOn: input.endsOn },
    });
    await batch.commit();
    return name;
  }

  /** Solo cambian las fechas (año y número definen el ID). */
  async updateDates(period: AcademicPeriod, startsOn: string, endsOn: string): Promise<void> {
    const batch = this.run(() => writeBatch(this.firestore));
    batch.update(this.run(() => doc(this.firestore, 'academicPeriods', period.id)), {
      startsOn,
      endsOn,
      updatedAt: serverTimestamp(),
    });
    this.audit.addToBatch(batch, {
      action: 'PERIOD_UPDATED',
      entityType: 'PERIOD',
      entityId: period.id,
      details: { startsOn, endsOn },
    });
    await batch.commit();
  }

  /**
   * Inicia el periodo. Si había otro en curso, se cierra (y sus cursos pasan a inactivos)
   * en el mismo batch, para que siempre haya un solo periodo en curso.
   */
  async activate(period: AcademicPeriod, all: readonly AcademicPeriod[]): Promise<void> {
    const batch = this.run(() => writeBatch(this.firestore));
    for (const other of all.filter((p) => p.status === 'ACTIVE' && p.id !== period.id)) {
      await this.addClose(batch, other, `Inicio del periodo ${period.name}`);
    }
    batch.update(this.run(() => doc(this.firestore, 'academicPeriods', period.id)), {
      status: 'ACTIVE',
      updatedAt: serverTimestamp(),
    });
    this.audit.addToBatch(batch, {
      action: 'PERIOD_ACTIVATED',
      entityType: 'PERIOD',
      entityId: period.id,
      details: { from: period.status },
    });
    await batch.commit();
  }

  /** Cierra el periodo: sus cursos activos pasan a inactivos. Las asistencias se conservan. */
  async close(period: AcademicPeriod, reason: string | null): Promise<number> {
    const batch = this.run(() => writeBatch(this.firestore));
    const count = await this.addClose(batch, period, reason);
    await batch.commit();
    return count;
  }

  private async addClose(batch: WriteBatch, period: AcademicPeriod, reason: string | null): Promise<number> {
    const courses = await this.run(() =>
      getDocs(query(collection(this.firestore, 'courses'), where('academicPeriodId', '==', period.id))),
    );
    const active = courses.docs.filter((c) => c.data()['status'] === 'ACTIVE');
    active.forEach((c) => batch.update(c.ref, { status: 'INACTIVE', updatedAt: serverTimestamp() }));

    batch.update(this.run(() => doc(this.firestore, 'academicPeriods', period.id)), {
      status: 'CLOSED',
      updatedAt: serverTimestamp(),
    });
    this.audit.addToBatch(batch, {
      action: 'PERIOD_CLOSED',
      entityType: 'PERIOD',
      entityId: period.id,
      reason,
      details: { coursesDeactivated: active.length },
    });
    return active.length;
  }
}
