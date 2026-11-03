import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideAngularModule, LucideIconData } from 'lucide-angular';

/**
 * Icono de lucide-angular con valores por defecto del sistema de diseño.
 * Las clases (color, posición, animación) se aplican solo al host, no se duplican en el SVG.
 * Decorativo por defecto (aria-hidden); el texto accesible va en el botón o enlace que lo contiene.
 *
 *   <app-icon [name]="icons.plus" [size]="18" class="text-primary" />
 */
@Component({
  selector: 'app-icon',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0 items-center justify-center', 'aria-hidden': 'true' },
  template: `<lucide-icon [img]="name()" [size]="size()" [strokeWidth]="strokeWidth()" />`,
  styles: `
    :host ::ng-deep lucide-icon {
      display: inline-flex;
    }
  `,
})
export class Icon {
  readonly name = input.required<LucideIconData>();
  readonly size = input(18);
  readonly strokeWidth = input(2);
}
