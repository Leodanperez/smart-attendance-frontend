import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { PreferencesService } from './core/services/preferences.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  // Aplica las preferencias visuales (tamaño de texto) desde el arranque.
  private readonly preferences = inject(PreferencesService);
}
