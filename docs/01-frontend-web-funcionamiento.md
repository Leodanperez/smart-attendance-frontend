# Smart Attendance — Panel Web (Frontend)

## Funcionamiento y flujo técnico

> Documento de estudio. Describe cómo está construido el panel web de Smart Attendance, qué tecnologías usa y cómo fluye la información desde que el usuario entra hasta que se generan los reportes de asistencia.

---

## 1. ¿Qué es el panel web?

El panel web es la aplicación de escritorio/navegador donde el **personal administrativo y los docentes** gestionan todo el sistema de asistencia de la institución: usuarios, carreras, periodos académicos, cursos, inscripciones, sesiones de clase y reportes. Los **estudiantes** también pueden entrar a consultar su asistencia y horario, aunque su experiencia principal es la app Android.

El panel y la app Android comparten la misma base de datos en la nube (Firebase), por lo que lo que ocurre en uno se refleja en el otro casi al instante.

---

## 2. Tecnologías utilizadas (stack)

| Área | Tecnología | Para qué se usa |
|------|-----------|-----------------|
| Framework principal | **Angular 21** (standalone components, signals) | Estructura de toda la aplicación web |
| Lenguaje | **TypeScript** | Código tipado y seguro |
| Estilos | **Tailwind CSS v4** | Diseño visual con clases utilitarias |
| Backend / Base de datos | **Firebase (Google)** | Autenticación, base de datos y almacenamiento en la nube |
| — Autenticación | **Firebase Authentication** | Inicio de sesión con correo y contraseña |
| — Base de datos | **Cloud Firestore** | Base de datos NoSQL en tiempo real |
| — Archivos | **Firebase Storage** | Fotos de perfil y archivos |
| — Seguridad | **Firebase App Check (reCAPTCHA Enterprise)** | Protege el backend de usos no autorizados |
| Conexión Angular–Firebase | **@angular/fire** | Librería oficial que conecta Angular con Firebase |
| Gráficos | **ApexCharts + ng-apexcharts** | Gráficos del dashboard (barras, líneas, dona, radial) |
| Iconos | **lucide-angular** | Iconografía de la interfaz |
| Componentes de UI | **Angular CDK** | Menús, diálogos y overlays accesibles |
| Códigos QR | **qrcode** | Generación de códigos QR en pantalla |
| Importación de datos | **read-excel-file** | Carga masiva de usuarios desde Excel |
| Programación reactiva | **RxJS** | Flujos de datos en tiempo real |
| Despliegue | **GitHub Pages / Vercel** | Publicación de la web |

### Conceptos clave de Angular que se aplican
- **Standalone components:** cada pantalla es un componente independiente, sin módulos.
- **Signals:** manejo de estado reactivo moderno (`signal`, `computed`, `effect`).
- **Lazy loading:** cada ruta carga su código solo cuando se necesita (mejor rendimiento).
- **Guards de rutas:** controlan quién puede entrar a cada pantalla según su rol.

---

## 3. Roles de usuario

El sistema define tres roles, y cada uno ve una interfaz distinta:

| Rol | Qué puede hacer |
|-----|-----------------|
| **ADMIN** (Administrador) | Gestiona usuarios, carreras, periodos, cursos, inscripciones, asignación de docentes, auditoría y configuración. Tiene acceso total. |
| **TEACHER** (Docente) | Ve sus cursos, crea sesiones de clase, controla la asistencia en vivo y consulta reportes de sus cursos. |
| **STUDENT** (Estudiante) | Consulta sus cursos, su porcentaje de asistencia y su horario. (El registro de asistencia se hace desde la app Android.) |

El control de acceso se hace con **guards**: `authGuard` (debe haber iniciado sesión), `guestGuard` (solo invitados) y `roleGuard('ADMIN', 'TEACHER'...)` (solo ciertos roles).

---

## 4. Flujo general de la aplicación

```
1. El usuario abre la web
        │
        ▼
2. ¿Tiene sesión iniciada?
        │
        ├── NO ──▶ Pantalla de Login (correo + contraseña)
        │                 │
        │                 ▼
        │         Firebase Authentication valida
        │                 │
        │                 ▼
        │         Se lee su perfil desde Firestore (colección "users")
        │                 │
        ▼                 ▼
3. Entra al Dashboard según su rol (Admin / Docente / Estudiante)
        │
        ▼
4. Navega por los menús y realiza sus tareas
        │
        ▼
5. Cada cambio se guarda en Firestore en tiempo real
```

---

## 5. Flujo de autenticación paso a paso

1. El usuario ingresa **correo y contraseña** en la pantalla de login.
2. Angular llama a **Firebase Authentication** con esas credenciales.
3. Si son correctas, Firebase devuelve un **usuario autenticado** (con un identificador único, el `uid`).
4. La app usa ese `uid` para leer el documento `users/{uid}` en **Firestore**, que contiene el perfil: nombre, rol, estado, foto, etc.
5. Según el **rol** (ADMIN / TEACHER / STUDENT) y el **estado** (ACTIVE / PENDING / DISABLED), la app decide qué menús y pantallas mostrar.
6. Mientras la sesión esté activa, el usuario navega libremente; al cerrar sesión, Firebase elimina el token y vuelve al login.

> **App Check:** antes de hablar con Firebase, la app presenta un token de reCAPTCHA Enterprise que confirma que las peticiones vienen de la app legítima y no de un bot.

---

## 6. Módulos y pantallas del panel

### Administración de personas y estructura académica (solo ADMIN)
- **Usuarios:** crear, editar, ver y deshabilitar usuarios. Incluye **importación masiva desde Excel**.
- **Carreras:** carreras que ofrece el instituto.
- **Periodos académicos:** por ejemplo 2026-I, 2026-II.
- **Asignación de docentes:** vincula docentes a cursos.
- **Inscripciones:** matricula estudiantes en cursos.

### Cursos (ADMIN y TEACHER)
- **Lista de cursos**, **detalle de curso**, crear/editar curso.
- Cada curso guarda código, sección, aula, horario, docentes y carrera.

### Operación docente
- **Sesiones:** el docente crea una sesión de clase (fecha, duración, tolerancia de tardanza).
- **Asistencia en vivo:** muestra en tiempo real quién va registrando su asistencia mientras escanea el QR desde el celular.

### Consultas del estudiante
- **Mi asistencia** y **Mi horario**.

### Reportes y control
- **Reportes:** porcentajes de asistencia por curso, estudiante y periodo, con filtros.
- **Auditoría:** registro de acciones importantes (quién hizo qué y cuándo). Solo ADMIN.
- **Configuración** y **Mi perfil**.

---

## 7. El Dashboard y los gráficos (ApexCharts)

Al entrar, cada rol ve un dashboard distinto con indicadores y gráficos construidos con **ApexCharts**:

- **Administrador:**
  - Asistencia por periodo (gráfico de **área**).
  - Evolución de registros por día (gráfico de **línea**).
  - Asistencia por curso (gráfico de **barras horizontales**).
  - Asistencia promedio global (gráfico **radial / medidor**).
- **Docente:**
  - Asistencia por curso (**barras**).
  - Asistencias por día (**línea**).
- **Estudiante:**
  - Su asistencia por curso (**barras**).
  - Desglose de su historial por estado (gráfico de **dona**: presente, tardanza, falta, justificada).

Los gráficos se **recolorean automáticamente** al cambiar entre modo claro y oscuro, porque leen la paleta de colores del tema activo.

---

## 8. Modo claro / oscuro (dark & light)

La aplicación soporta tres modos: **claro**, **oscuro** y **según el sistema**.

- Un servicio (`ThemeService`) guarda la preferencia del usuario en el navegador (`localStorage`) y aplica una clase `dark` al documento.
- Tailwind CSS v4 cambia todos los colores en función de esa clase mediante variables CSS (tokens de color).
- La preferencia se recuerda entre sesiones.

---

## 9. Cómo se organizan los datos en Firestore

Firestore es una base de datos **NoSQL** organizada en **colecciones** (como carpetas) que contienen **documentos** (como fichas). Las principales:

| Colección | Qué guarda |
|-----------|------------|
| `users` | Perfil de cada usuario (nombre, rol, estado, foto, documento). |
| `careers` | Carreras del instituto. |
| `academicPeriods` | Periodos académicos (2026-I, etc.). |
| `courses` | Cursos: código, sección, aula, horario, docentes, carrera. |
| `enrollments` | Inscripciones (qué estudiante está en qué curso). |
| `enrollmentCodes` | Códigos de autoinscripción generados por el admin (guardados como hash). |
| `sessions` | Sesiones de clase creadas por el docente. |
| `sessionTokens` | Tokens temporales del QR (solo se guarda su hash). |
| `attendances` | Registros de asistencia (presente, tardanza, falta, justificada). |
| `audit` | Registro de auditoría de acciones del sistema. |

> **En tiempo real:** Firestore avisa a la app cada vez que un documento cambia. Por eso la "asistencia en vivo" se actualiza sola, sin recargar la página.

---

## 10. Regla de cálculo de asistencia

El porcentaje de asistencia se calcula con una regla institucional única (igual en web y móvil):

```
% asistencia = (presentes + tardanzas) / (sesiones cerradas desde la inscripción − justificadas)
```

- Cuentan como asistencia: **Presente (PRESENT)** y **Tardanza (LATE)**.
- **Justificada (JUSTIFIED)** no cuenta como falta y se excluye del total.
- No tener registro en una sesión cerrada cuenta como **Falta (ABSENT)**.

---

## 11. Seguridad

- **Autenticación obligatoria:** nadie entra sin iniciar sesión.
- **Control por roles:** cada rol solo accede a lo que le corresponde (guards de ruta + reglas de Firestore).
- **Reglas de seguridad de Firestore:** el servidor valida cada lectura/escritura, no se confía solo en el navegador.
- **App Check:** protege contra peticiones que no vengan de la app legítima.
- **Tokens de QR como hash:** nunca se guarda el token en claro; solo su huella SHA-256.

---

## 12. Resumen

El panel web es una **aplicación Angular moderna** conectada a **Firebase** que centraliza la gestión académica y el control de asistencia. Usa **signals** para la reactividad, **Tailwind** para el diseño, **ApexCharts** para visualizar datos y **Firestore en tiempo real** para que la información esté siempre sincronizada con la app Android. Todo protegido por autenticación, roles y reglas de seguridad en el servidor.
