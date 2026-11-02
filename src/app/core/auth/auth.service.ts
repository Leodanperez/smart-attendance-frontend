import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Auth,
  authState,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  User,
} from '@angular/fire/auth';
import { Firestore, doc, docData, getDoc } from '@angular/fire/firestore';
import { Observable, catchError, distinctUntilChanged, map, of, shareReplay, switchMap } from 'rxjs';

import { AppUser, isUserRole, normalizeStatus } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);

  /** Usuario de Firebase Auth (null si no hay sesión o expiró). */
  readonly firebaseUser$: Observable<User | null> = authState(this.auth);

  /**
   * Perfil en sesión leído en vivo de users/{uid}.
   * null si no hay sesión, no tiene rol válido o su estado no es ACTIVE.
   * El rol siempre viene de Firestore, nunca de estado guardado en el navegador.
   */
  readonly currentUser$: Observable<AppUser | null> = this.firebaseUser$.pipe(
    switchMap((user) => {
      if (!user) return of(null);
      return runInInjectionContext(this.injector, () =>
        docData(doc(this.firestore, 'users', user.uid)),
      ).pipe(
        map((data) => this.toAppUser(user, data)),
        catchError(() => of(null)),
      );
    }),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  readonly currentUser = toSignal(this.currentUser$, { initialValue: null });

  /** Emite solo cuando cambia el usuario o su rol (evita recargar listas por cambios menores). */
  readonly scopeUser$: Observable<AppUser | null> = this.currentUser$.pipe(
    distinctUntilChanged((a, b) => a?.uid === b?.uid && a?.role === b?.role),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  /** Inicia sesión y valida rol y estado. Bloquea PENDING y DISABLED. */
  async login(email: string, password: string): Promise<AppUser> {
    const credential = await runInInjectionContext(this.injector, () =>
      signInWithEmailAndPassword(this.auth, email.trim(), password),
    );
    const snapshot = await runInInjectionContext(this.injector, () =>
      getDoc(doc(this.firestore, 'users', credential.user.uid)),
    );
    const data = snapshot.data();

    let errorCode: string | null = null;
    if (!data || !isUserRole(data['role'])) errorCode = 'app/no-role';
    else if (normalizeStatus(data['status']) === 'PENDING') errorCode = 'app/pending';
    else if (normalizeStatus(data['status']) === 'DISABLED') errorCode = 'app/disabled';

    const appUser = this.toAppUser(credential.user, data);
    if (errorCode || !appUser) {
      await this.logout();
      throw { code: errorCode ?? 'app/no-role' };
    }
    return appUser;
  }

  logout(): Promise<void> {
    return runInInjectionContext(this.injector, () => signOut(this.auth));
  }

  resetPassword(email: string): Promise<void> {
    return runInInjectionContext(this.injector, () =>
      sendPasswordResetEmail(this.auth, email.trim()),
    );
  }

  private toAppUser(user: User, data: Record<string, unknown> | undefined): AppUser | null {
    if (!data || !isUserRole(data['role'])) return null;
    const status = normalizeStatus(data['status']);
    if (status !== 'ACTIVE') return null;

    const firstName = (data['firstName'] as string | undefined) ?? '';
    const lastName = (data['lastName'] as string | undefined) ?? '';
    const fullName = `${firstName} ${lastName}`.trim();
    return {
      uid: user.uid,
      email: user.email ?? '',
      firstName,
      lastName,
      displayName:
        fullName || (data['displayName'] as string | undefined) || user.displayName || user.email || '',
      photoUrl: (data['photoUrl'] as string | null | undefined) ?? null,
      role: data['role'],
      status,
    };
  }
}
