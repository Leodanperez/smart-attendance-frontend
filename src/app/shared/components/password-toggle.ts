import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { Eye, EyeOff } from 'lucide-angular';
import { Icon } from './icon';

/**
 * Botón para mostrar/ocultar una contraseña. Se coloca dentro de un contenedor `relative`
 * junto al input (que debe tener `pr-11`):
 *   <div class="relative"><input #pwd type="password" class="input pr-11" /><app-password-toggle [target]="pwd" /></div>
 */
@Component({
  selector: 'app-password-toggle',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'absolute inset-y-0 right-1 flex items-center' },
  template: `
    <button type="button" class="btn-icon h-8 w-8" (click)="toggle()"
      [attr.aria-label]="visible() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
      [attr.aria-pressed]="visible()" [attr.aria-controls]="target().id || null">
      <app-icon [name]="visible() ? hide : show" [size]="18" />
    </button>
  `,
})
export class PasswordToggle {
  readonly target = input.required<HTMLInputElement>();

  protected readonly visible = signal(false);
  protected readonly show = Eye;
  protected readonly hide = EyeOff;

  protected toggle(): void {
    const next = !this.visible();
    this.visible.set(next);
    this.target().type = next ? 'text' : 'password';
  }
}
