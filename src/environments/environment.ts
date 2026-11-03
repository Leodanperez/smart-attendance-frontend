// Configuración web de Firebase (no es secreta, la seguridad está en las reglas).
// Proyecto compartido con la app Android: smart-attendance-mobile.
export const environment = {
  production: false,
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
