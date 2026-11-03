import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ChartColumn, LucideIconData } from 'lucide-angular';

import { Icon } from './icon';

@Component({
  selector: 'app-stat-card',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="card flex h-full items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-sm font-medium text-on-surface-variant">{{ label() }}</p>
        <p class="mt-1 truncate text-3xl font-bold text-on-surface">{{ value() }}</p>
        @if (hint()) {
          <p class="mt-1 text-xs text-on-surface-variant">{{ hint() }}</p>
        }
      </div>
      <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-fixed text-primary">
        <app-icon [name]="icon()" [size]="22" />
      </span>
    </div>
  `,
})
export class StatCard {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly hint = input<string>();
  readonly icon = input<LucideIconData>(ChartColumn);
}
