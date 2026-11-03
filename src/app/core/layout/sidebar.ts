import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  GraduationCap,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-angular';
import { Icon } from '../../shared/components/icon';

import { AuthService } from '../auth/auth.service';
import { ROLE_LABELS } from '../models/user.model';
import { SettingsService } from '../services/settings.service';
import { LayoutService } from './layout.service';
import { navigationFor } from './navigation';

/**
 * Sidebar del panel. Variante "desktop" (colapsable, sticky) y "mobile" (drawer).
 */
@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full flex-col bg-surface-container' },
  template: `
    <!-- Marca -->
    <div class="flex items-center gap-3 px-4 pt-5 pb-6" [class.justify-center]="collapsed()">
      <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary shadow-md shadow-primary/30">
        <app-icon [name]="icons.brand" [size]="22" />
      </span>
      @if (!collapsed()) {
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm leading-tight font-bold text-primary">Smart Attendance</p>
          <p class="truncate text-[10px] font-semibold tracking-wider text-outline uppercase">{{ institution() }}</p>
        </div>
      }
      @if (variant() === 'mobile') {
        <button type="button" class="btn-icon" aria-label="Cerrar menú" (click)="layout.mobileOpen.set(false)">
          <app-icon [name]="icons.close" [size]="18" />
        </button>
      }
    </div>

    <!-- Navegación -->
    <nav class="flex-1 space-y-5 overflow-y-auto px-3" aria-label="Menú principal">
      @for (group of nav(); track $index) {
        <div>
          @if (group.title) {
            @if (collapsed()) {
              <hr class="mx-2 mb-2 border-outline-variant/60" />
            } @else {
              <p class="px-3 pb-1.5 text-[10px] font-bold tracking-wider text-outline uppercase">{{ group.title }}</p>
            }
          }
          <ul class="space-y-0.5">
            @for (item of group.items; track item.label) {
              <li>
                <a [routerLink]="item.path"
                  routerLinkActive="!bg-primary !text-on-primary font-semibold shadow-md shadow-primary/30"
                  [routerLinkActiveOptions]="{ exact: !!item.exact }"
                  [attr.title]="collapsed() ? item.label : null"
                  [attr.aria-label]="collapsed() ? item.label : null"
                  (click)="layout.mobileOpen.set(false)"
                  class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-on-surface-variant transition-all hover:bg-surface-container-high hover:text-on-surface"
                  [class.justify-center]="collapsed()">
                  <app-icon [name]="item.icon" [size]="20" class="shrink-0" />
                  @if (!collapsed()) {
                    <span class="truncate">{{ item.label }}</span>
                  }
                </a>
              </li>
            }
          </ul>
        </div>
      }
    </nav>

    <!-- Pie del sidebar -->
    <div class="mt-auto space-y-1 border-t border-outline-variant/50 px-3 pt-3 pb-4">
      @if (user(); as u) {
        @if (!collapsed()) {
          <a routerLink="/profile" (click)="layout.mobileOpen.set(false)"
            class="mb-1 flex items-center gap-3 rounded-xl bg-surface-container-low p-2.5 transition-colors hover:bg-surface-container-high">
            @if (u.photoUrl) {
              <img [src]="u.photoUrl" alt="" class="h-9 w-9 shrink-0 rounded-full object-cover" />
            } @else {
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-xs font-bold text-primary" aria-hidden="true">
                {{ initials() }}
              </span>
            }
            <span class="min-w-0">
              <span class="block truncate text-xs font-bold text-on-surface">{{ u.displayName }}</span>
              <span class="block truncate text-[10px] text-on-surface-variant">{{ roleLabels[u.role] }}</span>
            </span>
          </a>
        }
      }
      <button type="button" (click)="logout()"
        class="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-status-danger transition-colors hover:bg-status-danger/10"
        [class.justify-center]="collapsed()" [attr.title]="collapsed() ? 'Cerrar sesión' : null"
        [attr.aria-label]="collapsed() ? 'Cerrar sesión' : null">
        <app-icon [name]="icons.logout" [size]="20" class="shrink-0" />
        @if (!collapsed()) { <span>Cerrar sesión</span> }
      </button>
      @if (variant() === 'desktop') {
        <button type="button" (click)="layout.toggleCollapsed()"
          class="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-xs text-outline transition-colors hover:bg-surface-container-high hover:text-primary"
          [class.justify-center]="collapsed()"
          [attr.aria-label]="collapsed() ? 'Expandir menú' : 'Contraer menú'" [attr.aria-expanded]="!collapsed()">
          <app-icon [name]="collapsed() ? icons.expand : icons.collapse" [size]="18" class="shrink-0" />
          @if (!collapsed()) { <span>Contraer menú</span> }
        </button>
      }
    </div>
  `,
})
export class Sidebar {
  readonly variant = input<'desktop' | 'mobile'>('desktop');

  protected readonly layout = inject(LayoutService);
  private readonly auth = inject(AuthService);
  private readonly settings = inject(SettingsService).settings;

  protected readonly icons = {
    brand: GraduationCap,
    logout: LogOut,
    collapse: PanelLeftClose,
    expand: PanelLeftOpen,
    close: X,
  };
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly user = this.auth.currentUser;
  protected readonly institution = computed(() => this.settings().institutionName);
  protected readonly nav = computed(() => navigationFor(this.user()?.role));
  /** En móvil nunca se colapsa. */
  protected readonly collapsed = computed(() => this.variant() === 'desktop' && this.layout.collapsed());

  protected readonly initials = computed(() => {
    const u = this.user();
    return ((u?.firstName?.[0] ?? '') + (u?.lastName?.[0] ?? '')).toUpperCase() || '?';
  });

  protected logout(): void {
    this.layout.mobileOpen.set(false);
    void this.auth.logout();
  }
}
