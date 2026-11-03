import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink } from '@angular/router';
import {
  ChevronDown,
  CircleUser,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
} from 'lucide-angular';
import { Icon } from '../../shared/components/icon';
import { filter, map, startWith } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { ROLE_LABELS } from '../models/user.model';
import { ThemeService } from '../services/theme.service';
import { LayoutService } from './layout.service';

/** Título de la ruta activa (sin el sufijo " | Smart Attendance"). */
function deepestTitle(route: ActivatedRoute): string {
  let current = route.snapshot;
  let title = '';
  while (current) {
    if (typeof current.title === 'string') title = current.title;
    current = current.firstChild!;
  }
  return title.split(' | ')[0];
}

@Component({
  selector: 'app-header',
  imports: [RouterLink, Icon, CdkMenuTrigger, CdkMenu, CdkMenuItem],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="sticky top-0 z-20 flex h-16 items-center gap-3 bg-surface-container/90 px-4 shadow-card backdrop-blur md:px-6">
      <button type="button" class="btn-icon lg:hidden" aria-label="Abrir menú" aria-controls="mobile-sidebar"
        [attr.aria-expanded]="layout.mobileOpen()" (click)="layout.mobileOpen.set(true)">
        <app-icon [name]="icons.menu" [size]="20" />
      </button>

      <div class="min-w-0">
        <p class="text-[10px] font-semibold tracking-wider text-outline uppercase">Smart Attendance</p>
        <p class="truncate text-base leading-tight font-semibold text-on-surface">{{ pageTitle() }}</p>
      </div>

      <div class="ml-auto flex items-center gap-1">
        <button type="button" class="btn-icon" (click)="theme.toggle()"
          [attr.aria-label]="theme.isDark() ? 'Activar modo claro' : 'Activar modo oscuro'"
          [class.!text-status-warning]="theme.isDark()">
          <app-icon [name]="theme.isDark() ? icons.sun : icons.moon" [size]="20" />
        </button>

        @if (user(); as u) {
          <button type="button" [cdkMenuTriggerFor]="profileMenu"
            class="ml-1 flex cursor-pointer items-center gap-2 rounded-xl py-1 pr-2 pl-1 transition-colors hover:bg-surface-container-high"
            aria-label="Menú de usuario">
            @if (u.photoUrl) {
              <img [src]="u.photoUrl" alt="" class="h-9 w-9 rounded-xl border border-primary/20 object-cover" />
            } @else {
              <span class="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary-fixed text-xs font-bold text-primary" aria-hidden="true">
                {{ initials() }}
              </span>
            }
            <span class="hidden flex-col items-start leading-tight sm:flex">
              <span class="text-sm font-semibold text-on-surface">{{ u.displayName }}</span>
              <span class="text-xs text-on-surface-variant">{{ roleLabels[u.role] }}</span>
            </span>
            <app-icon [name]="icons.chevron" [size]="16" class="text-on-surface-variant" />
          </button>

          <ng-template #profileMenu>
            <div cdkMenu class="menu-panel mt-2">
              <div class="border-b border-outline-variant/40 px-4 py-3">
                <p class="text-sm font-semibold text-on-surface">{{ u.displayName }}</p>
                <p class="truncate text-xs text-on-surface-variant">{{ u.email }}</p>
              </div>
              <div class="py-1">
                <a cdkMenuItem routerLink="/profile" class="menu-item">
                  <app-icon [name]="icons.profile" [size]="16" class="text-on-surface-variant" /> Mi perfil
                </a>
                @if (u.role === 'ADMIN') {
                  <a cdkMenuItem routerLink="/settings" class="menu-item">
                    <app-icon [name]="icons.settings" [size]="16" class="text-on-surface-variant" /> Configuración
                  </a>
                }
              </div>
              <div class="border-t border-outline-variant/40 py-1">
                <button cdkMenuItem type="button" class="menu-item !text-status-danger" (cdkMenuItemTriggered)="logout()">
                  <app-icon [name]="icons.logout" [size]="16" /> Cerrar sesión
                </button>
              </div>
            </div>
          </ng-template>
        }
      </div>
    </header>
  `,
})
export class Header {
  protected readonly layout = inject(LayoutService);
  protected readonly theme = inject(ThemeService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly icons = {
    menu: Menu,
    moon: Moon,
    sun: Sun,
    chevron: ChevronDown,
    profile: CircleUser,
    settings: Settings,
    logout: LogOut,
  };
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly user = this.auth.currentUser;

  protected readonly pageTitle = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      startWith(null),
      map(() => deepestTitle(this.route)),
    ),
    { initialValue: '' },
  );

  protected readonly initials = computed(() => {
    const u = this.user();
    return ((u?.firstName?.[0] ?? '') + (u?.lastName?.[0] ?? '')).toUpperCase() || '?';
  });

  protected async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
