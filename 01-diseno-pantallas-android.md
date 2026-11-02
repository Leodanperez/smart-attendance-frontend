# SmartAttendance --- Diseño de pantallas Android

## 1. Objetivo

Definir las pantallas y los estados visuales de la aplicación móvil
SmartAttendance, desarrollada en **Kotlin nativo con Jetpack Compose**.
La app será utilizada principalmente por estudiantes y docentes para
gestionar cursos y registrar asistencia mediante códigos QR.

Este documento define experiencia de usuario, navegación, componentes y
comportamiento visible. La lógica técnica y la estructura de Firebase se
especifican en `02-arquitectura-app-y-firebase.md`.

## 2. Usuarios y permisos visibles

-   **Estudiante (`STUDENT`)**: consulta sus cursos, escanea el QR de
    una sesión y revisa su historial.
-   **Docente (`TEACHER`)**: administra sus cursos, crea sesiones,
    muestra el QR y consulta la asistencia.
-   **Administrador (`ADMIN`)**: administra usuarios, cursos y
    asignaciones. El administrador tendrá una interfaz completa en
    Angular; en Android puede tener acceso limitado o no habilitarse
    inicialmente.

El rol no se selecciona libremente durante el registro. Lo asigna un
administrador o un proceso autorizado.

## 3. Identidad visual

-   Estilo: moderno, limpio, académico y accesible.
-   Framework visual: Jetpack Compose + Material 3.
-   Diseño adaptable a teléfonos Android.
-   Colores sugeridos:
    -   Primario: azul institucional.
    -   Secundario: celeste.
    -   Fondo: `#F7F8FA`.
    -   Superficies: blanco.
    -   Éxito: verde.
    -   Advertencia: ámbar.
    -   Error: rojo.
-   Tipografía: tipografía predeterminada de Material 3.
-   Componentes reutilizables: `AppButton`, `AppTextField`,
    `LoadingView`, `ErrorView`, `EmptyState`, `CourseCard`,
    `AttendanceStatusChip`.

No depender únicamente del color para comunicar estados: mostrar también
texto e iconos.

## 4. Navegación general

### Flujo de acceso

1.  Splash.
2.  Bienvenida / inicio de sesión.
3.  Registro o recuperación de contraseña.
4.  Completar perfil, si faltan datos.
5.  Redirección según el rol.

### Navegación del estudiante

Barra inferior: - Inicio. - Mis cursos. - Escanear QR. - Historial. -
Perfil.

### Navegación del docente

Barra inferior: - Inicio. - Mis cursos. - Sesiones. - Reportes. -
Perfil.

La opción Escanear QR puede estar como acción destacada en Inicio y en
la barra inferior.

## 5. Inventario de pantallas

### A01 --- Splash

**Propósito:** mostrar la identidad de SmartAttendance mientras se
comprueba la sesión.

Elementos: - Logotipo. - Nombre SmartAttendance. - Indicador de carga
discreto.

Estados: - Cargando sesión. - Sesión válida: consultar perfil y rol. -
Sesión inexistente: ir a Bienvenida. - Perfil incompleto: ir a Completar
perfil. - Error de conexión: permitir reintentar.

### A02 --- Bienvenida / Login

Elementos: - Logotipo y breve descripción. - Campo correo electrónico. -
Campo contraseña con opción mostrar/ocultar. - Botón Iniciar sesión. -
Botón Continuar con Google. - Enlace Crear cuenta. - Enlace Olvidé mi
contraseña.

Validaciones: - Correo con formato válido. - Contraseña no vacía. -
Mensajes de error claros, sin revelar si una cuenta existe cuando no
corresponda.

### A03 --- Registro con correo

Campos: - Nombres. - Apellidos. - Correo electrónico. - Contraseña. -
Confirmar contraseña. - Aceptación de términos y política de privacidad.

Comportamiento: - Crear cuenta con Firebase Authentication. - Enviar
verificación de correo, según la configuración del proyecto. - Crear
perfil básico en Firestore. - No permitir que el usuario se asigne
`ADMIN` o `TEACHER`. - Mostrar confirmación y continuar al flujo de
perfil.

### A04 --- Registro / acceso con Google

Elementos: - Botón Continuar con Google. - Indicador de progreso. -
Mensajes de cancelación o error.

Comportamiento: - Autenticar con Google mediante Firebase
Authentication. - Obtener UID, correo y datos básicos disponibles. -
Crear perfil si es el primer acceso. - Si ya existe el usuario, iniciar
sesión con el mismo UID. - Solicitar los datos institucionales que
falten.

### A05 --- Completar perfil

Campos: - Nombres. - Apellidos. - Código institucional (si
corresponde). - Fotografía opcional. - Confirmación de datos.

El correo y UID provienen de la sesión autenticada. El rol lo asigna el
sistema. El perfil puede quedar `PENDING` hasta que un administrador
valide la vinculación institucional.

### A06 --- Recuperar contraseña

Elementos: - Campo correo. - Botón Enviar enlace. - Mensaje de
confirmación genérico.

Acción: solicitar a Firebase Authentication el envío del correo de
recuperación.

### A07 --- Inicio del estudiante

Tarjetas: - Saludo y nombre. - Cursos inscritos. - Próxima sesión o
sesiones activas. - Resumen de asistencias y porcentaje. - Acción
principal Escanear QR. - Últimos registros.

Estados: - Sin cursos: mostrar indicación para ingresar un código de
inscripción. - Sin historial: mostrar estado vacío. - Sin conexión:
indicar que la información podría estar desactualizada.

### A08 --- Unirse a un curso

Elementos: - Campo Código de inscripción. - Botón Unirme. - Lista de
cursos actuales.

Comportamiento: - Validar el código en backend/Cloud Function. -
Verificar vigencia, cupo y estado del curso. - Evitar inscripciones
duplicadas. - Mostrar el resultado.

### A09 --- Mis cursos del estudiante

Cada tarjeta muestra: - Nombre del curso. - Docente. - Sección o grupo,
si existe. - Porcentaje de asistencia. - Estado del curso.

Al abrir un curso: - Resumen. - Próximas sesiones, si están
disponibles. - Historial de asistencia de ese curso.

### A10 --- Escáner QR

Elementos: - Vista de cámara. - Marco de escaneo. - Instrucción para
centrar el código. - Botón de linterna, si el dispositivo lo permite. -
Acción para volver.

Comportamiento: - Solicitar permiso de cámara en contexto. - Leer el
QR. - Enviar el token a la validación segura. - Mostrar resultado:
asistencia registrada, QR vencido, sesión cerrada, curso no inscrito,
registro duplicado o error de conexión. - No registrar asistencia
únicamente por leer un texto QR desde el cliente.

### A11 --- Resultado de asistencia

Éxito: - Icono de confirmación. - Mensaje "Asistencia registrada". -
Curso. - Fecha y hora del servidor. - Estado registrado.

Error: - Mensaje específico y acción posible: reintentar, volver o
contactar al docente.

### A12 --- Historial del estudiante

Filtros: - Curso. - Rango de fechas. - Estado.

Cada registro muestra: - Curso. - Fecha. - Hora. - Estado: presente,
tardanza, falta o justificado. - Detalle de sesión.

### A13 --- Inicio del docente

Tarjetas: - Cursos asignados. - Sesiones activas. - Asistencias del
día. - Accesos rápidos: Crear sesión y Ver reportes. - Actividad
reciente.

### A14 --- Mis cursos del docente

Lista de cursos asignados. Al abrir un curso: - Información del curso. -
Estudiantes inscritos. - Sesiones. - Resumen de asistencia. - Acción
Crear sesión.

### A15 --- Crear sesión

Campos: - Curso. - Título o tema. - Fecha y hora de inicio. - Duración /
hora de expiración. - Política de tardanza, si se habilita.

Acción: - Crear sesión mediante operación autorizada. - Generar token
aleatorio y temporal en servidor. - Mostrar pantalla del QR.

### A16 --- QR de sesión del docente

Elementos: - Código QR grande. - Nombre del curso y sesión. -
Temporizador / hora de expiración. - Contador de asistencias. - Botón
Cerrar sesión. - Botón Renovar QR, si la política lo permite.

El QR contiene un token opaco y temporal, no datos personales ni un UID
de estudiante.

### A17 --- Asistencia en vivo

Tabla o lista: - Estudiante. - Código institucional. - Hora de
registro. - Estado. - Búsqueda y filtros.

Mostrar contador de registrados y total de inscritos. La actualización
se realiza mediante listener de Firestore, con reglas de acceso
adecuadas.

### A18 --- Detalle de sesión / reporte

-   Resumen de presentes, tardanzas, faltas y justificados.
-   Lista de estudiantes.
-   Filtros.
-   Opción de corregir asistencia manualmente solo para docentes
    autorizados, registrando auditoría.
-   Exportación avanzada puede dejarse para una fase posterior o
    realizarse desde Angular.

### A19 --- Perfil y configuración

-   Nombre y correo.
-   Código institucional.
-   Rol (solo lectura).
-   Fotografía.
-   Cerrar sesión.
-   Versión de la aplicación.
-   Política de privacidad.

## 6. Componentes y estados comunes

Toda pantalla que consuma datos debe contemplar: - Cargando. -
Contenido. - Vacío. - Error con reintento. - Sin conexión. - Acceso
denegado.

Formularios: - Validación junto al campo. - Botón deshabilitado mientras
se procesa. - Evitar dobles envíos. - Mensajes accesibles.

## 7. Criterios de aceptación visual

-   Navegación coherente según el rol.
-   No mostrar acciones que el rol no puede ejecutar.
-   Diseño usable en pantallas pequeñas.
-   Permisos de cámara explicados antes de solicitarlos.
-   QR legible y con tiempo de expiración visible.
-   Estados de carga, error y vacío diseñados.
-   No mostrar información personal de otros estudiantes a usuarios no
    autorizados.

## 8. Entregables de diseño

1.  Wireframes de A01--A19.
2.  Prototipo navegable.
3.  Guía de colores, tipografía y componentes.
4.  Flujos separados de estudiante y docente.
5.  Validación del diseño en un teléfono Android real.
