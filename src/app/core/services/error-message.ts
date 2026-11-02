/** Traduce códigos de error de Firebase / app a mensajes para el usuario. */
export function errorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Correo o contraseña incorrectos.';
    case 'auth/invalid-email':
      return 'El correo no es válido.';
    case 'auth/user-disabled':
    case 'app/disabled':
      return 'Esta cuenta está deshabilitada.';
    case 'app/pending':
      return 'Tu cuenta está pendiente de validación institucional.';
    case 'app/no-role':
      return 'Tu cuenta no tiene un rol asignado. Contacta al administrador.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Inténtalo más tarde.';
    case 'auth/network-request-failed':
    case 'unavailable':
      return 'Error de red. Revisa tu conexión.';
    case 'auth/email-already-in-use':
      return 'Ya existe una cuenta con ese correo.';
    case 'auth/weak-password':
      return 'La contraseña es muy débil.';
    case 'app/document-in-use':
      return 'Ya existe un usuario con ese número de documento.';
    case 'app/institutional-code-in-use':
      return 'Ya existe un usuario con ese código institucional.';
    case 'app/course-code-in-use':
      return 'Ya existe un curso con ese código.';
    case 'app/self-change':
      return 'No puedes cambiar tu propio rol o estado.';
    case 'app/invalid-file':
      return 'La imagen debe ser JPG, PNG o WEBP y pesar menos de 2 MB.';
    case 'app/not-found':
      return 'El registro no existe.';
    case 'permission-denied':
    case 'storage/unauthorized':
      return 'No tienes permisos para esta acción.';
    case 'functions/not-found':
      return 'La Cloud Function requerida no está desplegada.';
    case 'functions/permission-denied':
      return 'El servidor rechazó la operación por permisos.';
    case 'functions/unauthenticated':
      return 'Tu sesión expiró. Vuelve a iniciar sesión.';
    case 'failed-precondition':
      return 'Falta un índice de Firestore para esta consulta (revisa la consola del navegador).';
    default:
      return 'Ocurrió un error. Inténtalo nuevamente.';
  }
}
