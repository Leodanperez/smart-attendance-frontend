// Configuración de producción. Reemplaza a environment.ts en el build de producción
// (ver fileReplacements en angular.json). La config de Firebase no es secreta;
// la seguridad real está en las reglas de Firestore/Storage.
export const environment = {
  production: true,
  firebase: {
    apiKey: 'AIzaSyCorbuI4Whp3bNjvUpSd8TJ-guERnTSmBY',
    authDomain: 'smart-attendance-mobile.firebaseapp.com',
    projectId: 'smart-attendance-mobile',
    storageBucket: 'smart-attendance-mobile.firebasestorage.app',
    messagingSenderId: '290040105206',
    appId: '1:290040105206:web:938a145c23188a3c8d04d7',
    measurementId: 'G-VMTDKE9445',
  },
  /** Site key de reCAPTCHA Enterprise para App Check. Vacío = App Check desactivado. */
  recaptchaEnterpriseSiteKey: '',
  /** URL del APK de la app Android (Release de GitHub o /app-release.apk en public/). */
  apkUrl: 'app-release.apk',
  /** Versión del APK mostrada en la página de descarga. */
  apkVersion: '1.0.0',
};
