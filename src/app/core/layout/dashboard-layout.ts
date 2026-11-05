import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { Footer } from './footer';
import { Header } from './header';
import { LayoutService } from './layout.service';
import { Sidebar } from './sidebar';

@Component({
  selector: 'app-dashboard-layout',
  imports: [RouterOutlet, Sidebar, Header, Footer, A11yModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a href="#main"
      class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface-container focus:px-4 focus:py-2 focus:shadow-lg">
      Saltar al contenido
    </a>

    <div class="flex min-h-dvh bg-surface">
      <!-- Sidebar escritorio -->
      <aside class="sticky top-0 z-30 hidden h-dvh shrink-0 shadow-card transition-[width] duration-300 lg:block"
        [class]="layout.collapsed() ? 'w-20' : 'w-68'">
        <app-sidebar variant="desktop" />
      </aside>

      <!-- Sidebar móvil (drawer) -->
      @if (layout.mobileOpen()) {
        <div class="animate-fade-in fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          (click)="layout.mobileOpen.set(false)" aria-hidden="true"></div>
        <aside id="mobile-sidebar" class="fixed inset-y-0 left-0 z-50 w-72 shadow-2xl lg:hidden"
          role="dialog" aria-modal="true" aria-label="Menú" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
          <app-sidebar variant="mobile" />
        </aside>
      }

      <div class="flex min-w-0 flex-1 flex-col">
        <app-header />
        <main id="main" tabindex="-1" class="animate-fade-in mx-auto w-full max-w-350 flex-1 p-4 outline-none md:p-6 lg:p-8">
          <router-outlet />
        </main>
        <app-footer />
      </div>
    </div>
  `,
})
export class DashboardLayout {
  protected readonly layout = inject(LayoutService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  constructor() {
    // Sesión expirada, usuario deshabilitado o rol retirado => fuera del panel.
    this.auth.currentUser$.pipe(takeUntilDestroyed()).subscribe((user) => {
      if (!user) void this.router.navigateByUrl('/login');
    });
    // Cierra el drawer móvil al navegar.
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(() => this.layout.mobileOpen.set(false));
  }

  @HostListener('document:keydown.escape')
  protected closeDrawer(): void {
    this.layout.mobileOpen.set(false);
  }
}
