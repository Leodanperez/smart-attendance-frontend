import { registerLocaleData } from '@angular/common';
import localeEsPe from '@angular/common/locales/es-PE';
import {
  ApplicationConfig,
  EnvironmentProviders,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { ReCaptchaEnterpriseProvider, initializeAppCheck, provideAppCheck } from '@angular/fire/app-check';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getFunctions, provideFunctions } from '@angular/fire/functions';
import { getStorage, provideStorage } from '@angular/fire/storage';

import { routes } from './app.routes';
import { environment } from '../environments/environment';

registerLocaleData(localeEsPe);

/** App Check se activa solo si hay site key de reCAPTCHA Enterprise configurada. */
const appCheckProviders: EnvironmentProviders[] = environment.recaptchaEnterpriseSiteKey
  ? [
    provideAppCheck(() =>
      initializeAppCheck(undefined, {
        provider: new ReCaptchaEnterpriseProvider(environment.recaptchaEnterpriseSiteKey),
        isTokenAutoRefreshEnabled: true,
      }),
    ),
  ]
  : [];

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    { provide: LOCALE_ID, useValue: 'es-PE' },
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    ...appCheckProviders,
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideFunctions(() => getFunctions()),
    provideStorage(() => getStorage()),
  ],
};
