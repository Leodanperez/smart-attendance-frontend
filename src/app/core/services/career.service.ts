import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import {
  Career,
  CareerInput,
  CareerStatus,
  careerInitials,
  normalizeCareer,
} from '../models/career.model';
import { AuditService } from './audit.service';

const byName = (a: Career, b: Career) => a.name.localeCompare(b.name, 'es');

@Injectable({ providedIn: 'root' })
export class CareerService {
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);
  private readonly auth = inject(AuthService);
  private readonly audit = inject(AuditService);

  private run<T>(fn: () => T): T {
    return runInInjectionContext(this.injector, fn);
  }

  private get careersRef() {
    return this.run(() => collection(this.firestore, 'careers'));
  }

  /** Todas las carreras (lectura para usuarios activos). */
  getAll(): Observable<Career[]> {
    return this.run(() => collectionData(this.careersRef, { idField: 'id' })).pipe(
      map((list) => list.map((d) => normalizeCareer(d, d['id'] as string)).sort(byName)),
    );
  }

  /** Crea la carrera con código generado de sus iniciales (DSI, DSI2… si ya existe). */
  async create(input: CareerInput): Promise<string> {
    const name = input.name.trim();
    await this.ensureNameFree(name);
    const code = await this.generateUniqueCode(name);

    const ref = this.run(() => doc(this.careersRef));
    const batch = this.run(() => writeBatch(this.firestore));
    batch.set(ref, {
      ...this.clean(input),
      code,
      createdBy: this.auth.currentUser()?.uid ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    this.audit.addToBatch(batch, {
      action: 'CAREER_CREATED',
      entityType: 'CAREER',
      entityId: ref.id,
      details: { code, name, durationSemesters: input.durationSemesters },
    });
    await batch.commit();
    return ref.id;
  }

  /**
   * Actualiza la carrera. El código no cambia.
   * Si cambia el nombre, actualiza `careerName` en sus cursos en el mismo batch.
   */
  async update(career: Career, input: CareerInput): Promise<void> {
    const data = this.clean(input);
    if (data.name.toLowerCase() !== career.name.toLowerCase()) await this.ensureNameFree(data.name, career.id);

    const batch = this.run(() => writeBatch(this.firestore));
    batch.update(this.run(() => doc(this.firestore, 'careers', career.id)), {
      ...data,
      updatedAt: serverTimestamp(),
    });

    if (data.name !== career.name) {
      const courses = await this.run(() =>
        getDocs(query(collection(this.firestore, 'courses'), where('careerId', '==', career.id))),
      );
      courses.docs.forEach((c) => batch.update(c.ref, { careerName: data.name, updatedAt: serverTimestamp() }));
    }

    this.audit.addToBatch(batch, {
      action: 'CAREER_UPDATED',
      entityType: 'CAREER',
      entityId: career.id,
      details: { code: career.code, name: data.name, durationSemesters: data.durationSemesters },
    });
    await batch.commit();
  }

  async setStatus(career: Career, status: CareerStatus, reason: string | null): Promise<void> {
    const batch = this.run(() => writeBatch(this.firestore));
    batch.update(this.run(() => doc(this.firestore, 'careers', career.id)), {
      status,
      updatedAt: serverTimestamp(),
    });
    this.audit.addToBatch(batch, {
      action: 'CAREER_STATUS_CHANGED',
      entityType: 'CAREER',
      entityId: career.id,
      reason,
      details: { from: career.status, to: status },
    });
    await batch.commit();
  }

  private clean(input: CareerInput) {
    return {
      name: input.name.trim(),
      description: input.description.trim(),
      durationSemesters: Math.round(input.durationSemesters),
      status: input.status,
    };
  }

  private async ensureNameFree(name: string, exceptId?: string): Promise<void> {
    const snapshot = await this.run(() =>
      getDocs(query(this.careersRef, where('name', '==', name), limit(2))),
    );
    if (snapshot.docs.some((d) => d.id !== exceptId)) throw { code: 'app/career-name-in-use' };
  }

  private async generateUniqueCode(name: string): Promise<string> {
    const base = careerInitials(name);
    for (let n = 1; n <= 20; n++) {
      const code = n === 1 ? base : `${base}${n}`;
      const snapshot = await this.run(() =>
        getDocs(query(this.careersRef, where('code', '==', code), limit(1))),
      );
      if (snapshot.empty) return code;
    }
    throw { code: 'app/career-code-in-use' };
  }
}
