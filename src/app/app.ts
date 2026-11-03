import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { PreferencesService } from './core/services/preferences.service';
import { ThemeService } from './core/services/theme.service';
import { ToastContainer } from './shared/toast/toast-container';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainer],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  // Aplica las preferencias visuales (tema y tamaño de texto) desde el arranque.
  private readonly preferences = inject(PreferencesService);
  private readonly theme = inject(ThemeService);
}
