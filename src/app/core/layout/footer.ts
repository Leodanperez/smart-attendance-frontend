import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Heart, ShieldCheck } from 'lucide-angular';
import { Icon } from '../../shared/components/icon';

import { SettingsService } from '../services/settings.service';

@Component({
  selector: 'app-footer',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="flex flex-col items-center justify-between gap-2 border-t border-outline-variant/50 px-4 py-4 text-xs text-on-surface-variant sm:flex-row md:px-6">
      <p>
        © {{ year }} <span class="font-semibold text-primary">Smart Attendance</span> · {{ institution() }}
      </p>
      <div class="flex items-center gap-4">
        <span class="flex items-center gap-1.5">
          <app-icon [name]="icons.shield" [size]="14" class="text-status-active" />
          Conexión segura · Firebase
        </span>
        <span class="hidden items-center gap-1 md:flex">
          Hecho con <app-icon [name]="icons.heart" [size]="13" class="text-status-danger" /> en la Semana Técnica
        </span>
      </div>
    </footer>
  `,
})
export class Footer {
  private readonly settings = inject(SettingsService).settings;
  protected readonly institution = computed(() => this.settings().institutionName);
  protected readonly year = new Date().getFullYear();
  protected readonly icons = { shield: ShieldCheck, heart: Heart };
}
