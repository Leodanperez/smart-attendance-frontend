# SmartAttendance --- Panel web Angular

## 1. Objetivo

Definir qué hará y qué verá el usuario en el panel web administrativo de
SmartAttendance, desarrollado con **Angular**. El panel complementa la
aplicación Android Kotlin: no reemplaza el escaneo móvil de los
estudiantes.

El panel será utilizado principalmente por administradores y docentes.
Se conectará al mismo proyecto Firebase.

## 2. Stack del frontend

-   Angular con componentes standalone.
-   TypeScript.
-   Angular Router.
-   Angular Reactive Forms.
-   AngularFire / Firebase SDK para Authentication y Firestore.
-   Angular Material o una librería visual consistente.
-   RxJS y Signals para estado de interfaz.
-   Gráficos para estadísticas.
-   Exportación CSV en una fase inicial; PDF/Excel puede incorporarse
    después.

Las versiones exactas se fijarán al crear el proyecto, verificando
compatibilidad con la versión de Angular elegida.

## 3. Roles y alcance

### Administrador (`ADMIN`)

Puede: - Ver indicadores globales. - Crear, editar y desactivar
cursos. - Crear y administrar secciones. - Asignar docentes a cursos. -
Buscar y validar usuarios. - Asignar roles autorizados. - Consultar
reportes globales. - Revisar auditoría.

### Docente (`TEACHER`)

Puede: - Ver únicamente cursos asignados. - Consultar estudiantes
inscritos. - Crear y cerrar sesiones. - Mostrar el QR desde el panel, si
se habilita esa función. - Ver asistencia en tiempo real. - Consultar
historial y estadísticas de sus cursos. - Solicitar o realizar
correcciones autorizadas con motivo y auditoría.

### Estudiante (`STUDENT`)

El panel web no es prioritario para estudiantes. Su experiencia
principal será Android. Si se habilita acceso web, será solo de consulta
de sus cursos e historial.

## 4. Estructura de navegación

### Menú ADMIN

-   Dashboard.
-   Usuarios.
-   Cursos.
-   Asignación de docentes.
-   Inscripciones.
-   Sesiones.
-   Reportes.
-   Auditoría.
-   Configuración.

### Menú TEACHER

-   Dashboard.
-   Mis cursos.
-   Estudiantes.
-   Sesiones.
-   Asistencia en vivo.
-   Reportes.

El menú y las rutas se filtran por permisos, pero la seguridad real se
aplica también en Firebase Rules y Cloud Functions.

## 5. Pantallas del panel

### W01 --- Login

Elementos: - Correo. - Contraseña. - Iniciar sesión. - Continuar con
Google. - Recuperar contraseña.

Comportamiento: - Firebase Authentication. - Consultar perfil y
permisos. - Redirigir según rol. - Bloquear usuarios `PENDING` o
`DISABLED` según política.

### W02 --- Dashboard administrador

Indicadores: - Total de estudiantes activos. - Total de docentes
activos. - Cursos activos. - Sesiones realizadas. - Asistencia
promedio. - Actividad reciente.

Gráficos: - Asistencia por periodo. - Asistencia por curso. - Evolución
de registros.

Filtros: - Periodo académico. - Carrera o programa, si el modelo
institucional lo incorpora. - Curso. - Sección.

### W03 --- Gestión de usuarios

Tabla: - Código institucional. - Nombre completo. - Correo. - Rol. -
Estado. - Fecha de registro. - Acciones.

Funciones: - Buscar por nombre, correo o código. - Filtrar por rol y
estado. - Ver detalle. - Activar/desactivar. - Asignar rol autorizado. -
Completar o corregir datos institucionales.

No permitir que un administrador se asigne privilegios fuera de su
alcance. Toda modificación sensible debe pasar por una operación
autorizada y quedar auditada.

### W04 --- Detalle de usuario

Mostrar: - Datos de perfil. - UID (solo para soporte autorizado). -
Proveedor de autenticación. - Rol y estado. - Cursos asociados. -
Historial de actividad pertinente.

Acciones: - Editar datos institucionales. - Cambiar estado. - Asignar o
retirar rol, según permisos. - Ver inscripciones.

No mostrar contraseñas ni credenciales privadas.

### W05 --- Gestión de cursos

Tabla: - Código. - Nombre. - Sección. - Docentes asignados. - Número de
estudiantes. - Estado.

Acciones: - Crear curso. - Editar curso. - Activar/desactivar. - Ver
detalle. - Asignar docente.

Formulario: - Nombre. - Descripción. - Código. - Sección. -
Docente(s). - Estado.

### W06 --- Asignación de docentes

-   Buscar docente activo.
-   Seleccionar curso.
-   Asignar o retirar docente.
-   Mostrar cursos actuales del docente.
-   Confirmar cambios.

La escritura debe estar protegida por rol y validada por backend.

### W07 --- Inscripciones y códigos

-   Seleccionar curso.
-   Generar código de inscripción.
-   Definir vigencia y límite de usos.
-   Desactivar código.
-   Consultar estudiantes inscritos.
-   Exportar lista.

El código debe mostrarse al usuario autorizado cuando se genera. Guardar
hash en Firestore y validar el código mediante Cloud Function.

### W08 --- Dashboard docente

Indicadores: - Mis cursos. - Estudiantes inscritos. - Sesiones
activas. - Asistencias de hoy. - Promedio de asistencia.

Accesos: - Abrir curso. - Crear sesión. - Ver asistencia en vivo. -
Consultar reportes.

### W09 --- Detalle de curso

-   Nombre, código y sección.
-   Docente(s).
-   Estudiantes inscritos.
-   Porcentaje general de asistencia.
-   Sesiones recientes.
-   Acciones Crear sesión y Ver reporte.

### W10 --- Crear y administrar sesión

Formulario: - Curso asignado. - Título o tema. - Fecha/hora. -
Duración. - Configuración de tardanza, si aplica.

Acciones: - Crear sesión. - Cerrar sesión. - Consultar estado. - Mostrar
QR dinámico.

El QR se obtiene de una operación segura del backend. Nunca generar
tokens predecibles en Angular.

### W11 --- Asistencia en tiempo real

Tabla: - Código del estudiante. - Nombre. - Hora de registro. -
Estado. - Fuente de registro.

Indicadores: - Total inscritos. - Presentes. - Tardanzas. - Pendientes.

Funciones: - Búsqueda. - Filtros. - Actualización en tiempo real. -
Exportar CSV.

No exponer estudiantes de cursos que el docente no tiene asignados.

### W12 --- Reportes

Filtros: - Curso. - Estudiante. - Periodo. - Estado.

Reportes: - Asistencia por curso. - Asistencia por estudiante. - Resumen
por sesión. - Estudiantes con bajo porcentaje de asistencia.

Exportación: - CSV en primera versión. - PDF y Excel como mejora
posterior.

Los porcentajes deben calcularse con una regla institucional explícita:
por ejemplo, sesiones válidas en las que el estudiante estuvo inscrito.
Definir cómo se tratan las tardanzas y justificaciones antes de publicar
el indicador.

### W13 --- Auditoría

Tabla: - Fecha y hora. - Usuario que realizó la acción. - Acción. -
Entidad afectada. - Motivo. - Detalle permitido.

Solo lectura para administradores autorizados. No permitir editar ni
borrar logs desde el panel.

### W14 --- Perfil y configuración

-   Nombre.
-   Correo.
-   Fotografía.
-   Rol.
-   Cerrar sesión.
-   Preferencias visuales básicas.

## 6. Organización del proyecto Angular

``` text
src/app
├── core
│   ├── auth
│   ├── guards
│   ├── services
│   ├── models
│   └── layout
├── shared
│   ├── components
│   ├── pipes
│   └── directives
├── features
│   ├── dashboard
│   ├── users
│   ├── courses
│   ├── teacher-assignments
│   ├── enrollments
│   ├── sessions
│   ├── live-attendance
│   ├── reports
│   ├── audit
│   └── profile
└── app.routes.ts
```

Servicios sugeridos: - `AuthService` - `UserService` - `CourseService` -
`EnrollmentService` - `SessionService` - `AttendanceService` -
`ReportService` - `AuditService`

## 7. Conexión con Firebase

El panel y Android comparten: - Firebase Authentication. - Cloud
Firestore. - Cloud Functions. - Cloud Storage, si se usan imágenes.

Angular puede leer y escribir datos no sensibles directamente con
Firebase SDK cuando las reglas lo permitan. Operaciones privilegiadas
deben ejecutarse mediante Cloud Functions o backend confiable.

No incluir Firebase Admin SDK ni credenciales de servicio en el
navegador.

## 8. Seguridad del frontend

-   Guard de autenticación para rutas privadas.
-   Guard de rol para experiencia de navegación.
-   Ocultar acciones no autorizadas.
-   Validación de formularios.
-   Manejo de expiración y cierre de sesión.
-   Reglas Firestore y Functions como autoridad final.
-   No confiar en el rol almacenado solo en el estado del navegador.
-   No guardar tokens sensibles manualmente en localStorage.
-   Aplicar App Check cuando sea compatible con el entorno web.

## 9. Fases de implementación

**Fase 1 --- Base** - Crear proyecto Angular. - Configurar Firebase. -
Layout, rutas y autenticación. - Guards.

**Fase 2 --- Administración** - Dashboard. - Gestión de usuarios. -
Gestión de cursos. - Asignación de docentes.

**Fase 3 --- Operación docente** - Mis cursos. - Estudiantes. - Crear
sesiones. - Mostrar QR. - Asistencia en vivo.

**Fase 4 --- Reportes** - Historial. - Estadísticas. - Exportación
CSV. - Auditoría.

**Fase 5 --- Calidad** - Pruebas por rol. - Reglas y permisos. -
Responsive. - Accesibilidad. - Pruebas de integración con Firebase
Emulator Suite.

## 10. Criterios de aceptación

-   ADMIN puede gestionar usuarios y cursos según permisos.
-   TEACHER solo ve cursos que tiene asignados.
-   El docente puede crear y cerrar sesiones.
-   La asistencia se actualiza en vivo.
-   Los reportes respetan filtros y reglas de cálculo acordadas.
-   Las operaciones sensibles quedan auditadas.
-   Ninguna autorización depende únicamente de guards o controles
    visuales de Angular.
