import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { Storage, getDownloadURL, ref, uploadBytes } from '@angular/fire/storage';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  inMemoryPersistence,
  initializeAuth,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { Observable, catchError, combineLatest, map, of } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import {
  CreateUserInput,
  InstitutionalDataInput,
  OwnProfileInput,
  UserProfile,
  UserRole,
  UserStatus,
  normalizeProfile,
  sortByName,
} from '../models/user.model';
import { AuditService } from './audit.service';

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly firestore = inject(Firestore);
  private readonly storage = inject(Storage);
  private readonly injector = inject(EnvironmentInjector);
  private readonly auth = inject(AuthService);
  private readonly audit = inject(AuditService);

  private run<T>(fn: () => T): T {
    return runInInjectionContext(this.injector, fn);
  }

  private get usersRef() {
    return this.run(() => collection(this.firestore, 'users'));
  }

  /** Todos los usuarios (solo ADMIN según reglas). */
  getAll(): Observable<UserProfile[]> {
    return this.run(() => collectionData(this.usersRef, { idField: 'uid' })).pipe(
      map((list) => list.map((d) => normalizeProfile(d, d['uid'] as string)).sort(sortByName)),
    );
  }

  /** Usuarios por rol (solo ADMIN según reglas). */
  getByRole(role: UserRole): Observable<UserProfile[]> {
    return this.run(() =>
      collectionData(query(this.usersRef, where('role', '==', role)), { idField: 'uid' }),
    ).pipe(map((list) => list.map((d) => normalizeProfile(d, d['uid'] as string)).sort(sortByName)));
  }

  getById(uid: string): Observable<UserProfile | null> {
    return this.run(() => docData(doc(this.firestore, 'users', uid))).pipe(
      map((data) => (data ? normalizeProfile(data, uid) : null)),
    );
  }

  /**
   * Perfiles por id con lecturas individuales (compatibles con reglas de docente).
   * Los que no se puedan leer se omiten.
   */
  getByIds(ids: readonly string[]): Observable<UserProfile[]> {
    if (!ids.length) return of([]);
    return combineLatest(
      ids.map((id) => this.getById(id).pipe(catchError(() => of(null)))),
    ).pipe(map((list) => list.filter((u): u is UserProfile => !!u).sort(sortByName)));
  }

  /** true si ya existe un usuario con ese valor (validación asíncrona del formulario). */
  async isTaken(field: 'documentNumber' | 'institutionalCode' | 'email', value: string): Promise<boolean> {
    if (!value) return false;
    const snapshot = await this.run(() =>
      getDocs(query(this.usersRef, where(field, '==', value), limit(1))),
    );
    return !snapshot.empty;
  }

  /**
   * Crea la cuenta (Auth) y el perfil (Firestore) sin cerrar la sesión del ADMIN,
   * usando una instancia secundaria de Firebase con persistencia en memoria.
   */
  async createUser(input: CreateUserInput): Promise<string> {
    const email = input.email.trim().toLowerCase();
    const documentNumber = input.documentNumber.trim().toUpperCase();
    const institutionalCode = input.institutionalCode.trim().toUpperCase() || null;

    await this.ensureUnique('documentNumber', documentNumber, 'app/document-in-use');
    if (institutionalCode) {
      await this.ensureUnique('institutionalCode', institutionalCode, 'app/institutional-code-in-use');
    }

    const secondaryApp = initializeApp(environment.firebase, `user-creation-${Date.now()}`);
    try {
      const secondaryAuth = initializeAuth(secondaryApp, { persistence: inMemoryPersistence });
      const { user } = await createUserWithEmailAndPassword(secondaryAuth, email, input.password);

      const firstName = input.firstName.trim();
      const lastName = input.lastName.trim();
      const displayName = `${firstName} ${lastName}`;

      try {
        await updateProfile(user, { displayName });

        const batch = this.run(() => writeBatch(this.firestore));
        batch.set(this.run(() => doc(this.firestore, 'users', user.uid)), {
          uid: user.uid,
          firstName,
          lastName,
          displayName,
          email,
          photoUrl: null,
          institutionalCode,
          role: input.role,
          status: input.status,
          authProvider: 'password',
          profileCompleted: true,
          documentType: input.documentType,
          documentNumber,
          birthDate: input.birthDate,
          gender: input.gender,
          phone: input.phone.trim() || null,
          address: input.address.trim() || null,
          createdBy: this.auth.currentUser()?.uid ?? null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        this.audit.addToBatch(batch, {
          action: 'USER_CREATED',
          entityType: 'USER',
          entityId: user.uid,
          details: { role: input.role, status: input.status },
        });
        await batch.commit();
      } catch (error) {
        // Si falla Firestore se elimina la cuenta para no dejarla huérfana.
        await deleteUser(user).catch(() => undefined);
        throw error;
      }

      await signOut(secondaryAuth);
      return user.uid;
    } finally {
      await deleteApp(secondaryApp);
    }
  }

  /** Completa o corrige datos institucionales (ADMIN). */
  async updateInstitutionalData(
    user: UserProfile,
    input: InstitutionalDataInput,
    reason: string | null,
  ): Promise<void> {
    const documentNumber = input.documentNumber.trim().toUpperCase();
    const institutionalCode = input.institutionalCode?.trim().toUpperCase() || null;

    if (documentNumber && documentNumber !== user.documentNumber) {
      await this.ensureUnique('documentNumber', documentNumber, 'app/document-in-use', user.uid);
    }
    if (institutionalCode && institutionalCode !== user.institutionalCode) {
      await this.ensureUnique('institutionalCode', institutionalCode, 'app/institutional-code-in-use', user.uid);
    }

    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const patch = {
      firstName,
      lastName,
      displayName: `${firstName} ${lastName}`,
      institutionalCode,
      documentType: input.documentType,
      documentNumber,
      birthDate: input.birthDate,
      gender: input.gender,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
    };
    const changed = Object.keys(patch).filter(
      (key) => (patch as Record<string, unknown>)[key] !== (user as unknown as Record<string, unknown>)[key],
    );

    const batch = this.run(() => writeBatch(this.firestore));
    batch.update(this.run(() => doc(this.firestore, 'users', user.uid)), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
    this.audit.addToBatch(batch, {
      action: 'USER_UPDATED',
      entityType: 'USER',
      entityId: user.uid,
      reason,
      details: { fields: changed },
    });
    await batch.commit();
  }

  async setStatus(user: UserProfile, status: UserStatus, reason: string): Promise<void> {
    this.preventSelfChange(user.uid);
    const batch = this.run(() => writeBatch(this.firestore));
    batch.update(this.run(() => doc(this.firestore, 'users', user.uid)), {
      status,
      updatedAt: serverTimestamp(),
    });
    this.audit.addToBatch(batch, {
      action: 'USER_STATUS_CHANGED',
      entityType: 'USER',
      entityId: user.uid,
      reason,
      details: { from: user.status, to: status },
    });
    await batch.commit();
  }

  async setRole(user: UserProfile, role: UserRole, reason: string): Promise<void> {
    this.preventSelfChange(user.uid);
    const batch = this.run(() => writeBatch(this.firestore));
    batch.update(this.run(() => doc(this.firestore, 'users', user.uid)), {
      role,
      updatedAt: serverTimestamp(),
    });
    this.audit.addToBatch(batch, {
      action: 'USER_ROLE_CHANGED',
      entityType: 'USER',
      entityId: user.uid,
      reason,
      details: { from: user.role, to: role },
    });
    await batch.commit();
  }

  /** El propio usuario edita sus datos básicos (las reglas no le permiten tocar rol ni estado). */
  async updateOwnProfile(input: OwnProfileInput): Promise<void> {
    const uid = this.requireUid();
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    await this.run(() =>
      updateDoc(doc(this.firestore, 'users', uid), {
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`,
        phone: input.phone?.trim() || null,
        address: input.address?.trim() || null,
        updatedAt: serverTimestamp(),
      }),
    );
  }

  async uploadOwnPhoto(file: File): Promise<string> {
    if (!PHOTO_TYPES.includes(file.type) || file.size > MAX_PHOTO_BYTES) {
      throw { code: 'app/invalid-file' };
    }
    const uid = this.requireUid();
    const photoRef = this.run(() => ref(this.storage, `profilePhotos/${uid}/avatar`));
    await this.run(() => uploadBytes(photoRef, file, { contentType: file.type }));
    const url = await this.run(() => getDownloadURL(photoRef));
    await this.run(() =>
      updateDoc(doc(this.firestore, 'users', uid), { photoUrl: url, updatedAt: serverTimestamp() }),
    );
    return url;
  }

  private requireUid(): string {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) throw { code: 'functions/unauthenticated' };
    return uid;
  }

  private preventSelfChange(uid: string): void {
    if (uid === this.auth.currentUser()?.uid) throw { code: 'app/self-change' };
  }

  private async ensureUnique(
    field: 'documentNumber' | 'institutionalCode',
    value: string,
    errorCode: string,
    exceptUid?: string,
  ): Promise<void> {
    const snapshot = await this.run(() =>
      getDocs(query(this.usersRef, where(field, '==', value), limit(2))),
    );
    if (snapshot.docs.some((d) => d.id !== exceptUid)) throw { code: errorCode };
  }
}
