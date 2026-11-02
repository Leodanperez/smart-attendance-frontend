import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../auth/auth.service';
import { ROLE_LABELS, UserRole } from '../models/user.model';
import { SettingsService } from '../services/settings.service';

interface NavItem {
  label: string;
  path: string;
  roles: readonly UserRole[];
  exact?: boolean;
}

interface NavGroup {
  title: string | null;
  items: NavItem[];
}

const ALL: readonly UserRole[] = ['ADMIN', 'TEACHER', 'STUDENT'];

const NAV: NavGroup[] = [
  { title: null, items: [{ label: 'Dashboard', path: '/dashboard', roles: ALL }] },
  {
    title: 'Usuarios',
    items: [
      { label: 'Usuarios', path: '/users', roles: ['ADMIN'], exact: true },
      { label: 'Registrar usuario', path: '/users/new', roles: ['ADMIN'], exact: true },
    ],
  },
  {
    title: 'Académico',
    items: [
      { label: 'Cursos', path: '/courses', roles: ['ADMIN'] },
      { label: 'Mis cursos', path: '/courses', roles: ['TEACHER', 'STUDENT'] },
      { label: 'Asignación de docentes', path: '/teacher-assignments', roles: ['ADMIN'] },
      { label: 'Inscripciones', path: '/enrollments', roles: ['ADMIN'] },
      { label: 'Estudiantes', path: '/students', roles: ['TEACHER'] },
    ],
  },
  {
    title: 'Asistencia',
    items: [
      { label: 'Sesiones', path: '/sessions', roles: ['ADMIN', 'TEACHER'] },
      { label: 'Asistencia en vivo', path: '/live-attendance', roles: ['ADMIN', 'TEACHER'] },
      { label: 'Reportes', path: '/reports', roles: ['ADMIN', 'TEACHER'] },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { label: 'Auditoría', path: '/audit', roles: ['ADMIN'] },
      { label: 'Configuración', path: '/settings', roles: ['ADMIN'] },
      { label: 'Mi perfil', path: '/profile', roles: ALL },
    ],
  },
];

@Component({
  selector: 'app-dashboard-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-2">
      Saltar al contenido
    </a>
    <div class="flex min-h-dvh bg-gray-50">
      @if (menuOpen()) {
        <div class="fixed inset-0 z-10 bg-black/30 md:hidden" (click)="menuOpen.set(false)" aria-hidden="true"></div>
      }

      <aside
        id="sidebar"
        [class.hidden]="!menuOpen()"
        class="fixed inset-y-0 left-0 z-20 w-64 overflow-y-auto border-r border-gray-200 bg-white md:sticky md:top-0 md:block md:h-dvh"
      >
        <div class="border-b border-gray-200 px-4 py-4">
          <p class="text-lg font-semibold text-blue-700">Smart Attendance</p>
          <p class="truncate text-xs text-gray-500">{{ institution() }}</p>
        </div>
        <nav class="space-y-4 p-2" aria-label="Menú principal">
          @for (group of nav(); track $index) {
            <div>
              @if (group.title) {
                <p class="px-3 pb-1 text-xs font-semibold tracking-wide text-gray-400 uppercase">
                  {{ group.title }}
                </p>
              }
              <ul class="space-y-1">
                @for (item of group.items; track item.label) {
                  <li>
                    <a
                      [routerLink]="item.path"
                      routerLinkActive="bg-blue-50 font-medium text-blue-700"
                      [routerLinkActiveOptions]="{ exact: !!item.exact }"
                      (click)="menuOpen.set(false)"
                      class="block rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      {{ item.label }}
                    </a>
                  </li>
                }
              </ul>
            </div>
          }
        </nav>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <header class="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <button
            type="button"
            class="btn btn-secondary btn-sm md:hidden"
            (click)="menuOpen.update((open) => !open)"
            [attr.aria-expanded]="menuOpen()"
            aria-controls="sidebar"
          >
            <span aria-hidden="true">☰</span> Menú
          </button>

          <div class="ml-auto flex items-center gap-3">
            @if (user(); as u) {
              <a routerLink="/profile" class="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-gray-100">
                @if (u.photoUrl) {
                  <img [src]="u.photoUrl" alt="" class="h-8 w-8 rounded-full object-cover" />
                } @else {
                  <span class="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700" aria-hidden="true">
                    {{ initials() }}
                  </span>
                }
                <span class="hidden text-right sm:block">
                  <span class="block text-sm font-medium text-gray-900">{{ u.displayName }}</span>
                  <span class="block text-xs text-gray-500">{{ roleLabels[u.role] }}</span>
                </span>
              </a>
            }
            <button type="button" (click)="logout()" class="btn btn-secondary btn-sm">Cerrar sesión</button>
          </div>
        </header>

        <main id="main" class="flex-1 p-4 md:p-6" tabindex="-1">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class DashboardLayout {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly user = this.auth.currentUser;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly menuOpen = signal(false);
  private readonly settings = inject(SettingsService).settings;
  protected readonly institution = computed(() => this.settings().institutionName);

  protected readonly nav = computed(() => {
    const role = this.user()?.role;
    if (!role) return [];
    return NAV.map((group) => ({
      ...group,
      items: group.items.filter((item) => item.roles.includes(role)),
    })).filter((group) => group.items.length);
  });

  protected readonly initials = computed(() => {
    const u = this.user();
    return ((u?.firstName?.[0] ?? '') + (u?.lastName?.[0] ?? '')).toUpperCase() || '?';
  });

  constructor() {
    // Sesión expirada, usuario deshabilitado o rol retirado => fuera del panel.
    this.auth.currentUser$.pipe(takeUntilDestroyed()).subscribe((user) => {
      if (!user) void this.router.navigateByUrl('/login');
    });
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
