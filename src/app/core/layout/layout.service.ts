import { Injectable, effect, signal } from '@angular/core';

const COLLAPSED_KEY = 'sa.sidebarCollapsed';

/** Estado del layout: sidebar colapsado (escritorio) y drawer abierto (móvil). */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly collapsed = signal(this.readCollapsed());
  readonly mobileOpen = signal(false);

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(COLLAPSED_KEY, String(this.collapsed()));
      } catch {
        // localStorage no disponible
      }
    });
  }

  toggleCollapsed(): void {
    this.collapsed.update((v) => !v);
  }

  private readCollapsed(): boolean {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  }
}
