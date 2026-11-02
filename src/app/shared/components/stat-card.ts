import { Component, input } from '@angular/core';

@Component({
  selector: 'app-stat-card',
  template: `
    <div class="card h-full">
      <p class="text-sm text-gray-500">{{ label() }}</p>
      <p class="mt-1 text-3xl font-semibold text-gray-900">{{ value() }}</p>
      @if (hint()) {
        <p class="mt-1 text-xs text-gray-500">{{ hint() }}</p>
      }
    </div>
  `,
})
export class StatCard {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly hint = input<string>();
}
