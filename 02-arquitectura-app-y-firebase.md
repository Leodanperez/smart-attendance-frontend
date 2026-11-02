# SmartAttendance --- Arquitectura Android y funcionamiento de Firebase

## 1. Objetivo y alcance

Especificar la arquitectura de la aplicación Android nativa y el modelo
de datos de Firebase para SmartAttendance.

**Stack acordado:** - Kotlin. - Android nativo. - Jetpack Compose +
Material 3. - Arquitectura MVVM. - Kotlin Coroutines y Flow. - Firebase
Authentication. - Cloud Firestore. - Cloud Storage (opcional para
fotos). - Firebase Cloud Messaging (fase posterior). - Cloud Functions
para operaciones sensibles. - CameraX + ML Kit Barcode Scanning o una
librería QR equivalente.

La aplicación no utilizará Flutter.

## 2. Principios de arquitectura

-   Separación por funcionalidades y capas.
-   UI declarativa con Jetpack Compose.
-   ViewModels exponen estado mediante `StateFlow`.
-   Repositories encapsulan acceso a Firebase.
-   Modelos de dominio separados de DTO/documentos cuando aporte
    claridad.
-   Operaciones críticas se validan en servidor.
-   Reglas de Firestore aplican autorización; ocultar botones no es
    seguridad.
-   Fechas críticas y marcas de tiempo se generan en servidor.
-   No guardar contraseñas en Firestore: Firebase Authentication las
    administra.

## 3. Arquitectura lógica

``` text
Jetpack Compose UI
       |
       v
ViewModel (StateFlow / UI State)
       |
       v
Use Cases (cuando la complejidad lo justifique)
       |
       v
Repository interfaces
       |
       v
Repository implementations
       |
       +------ Firebase Authentication
       +------ Cloud Firestore
       +------ Cloud Storage
       +------ Callable Cloud Functions
       +------ Camera / QR scanner
```

### Capas

**Presentation** - Screens. - Reusable components. - Navigation. -
ViewModels. - UI state y eventos.

**Domain** - Entidades. - Interfaces de repositorios. - Casos de uso
para reglas de negocio relevantes.

**Data** - Implementaciones de repositorios. - Firebase data sources. -
DTOs y mappers. - Manejo de errores.

## 4. Estructura de paquetes sugerida

``` text
com.example.smartattendance
├── core
│   ├── common
│   ├── navigation
│   ├── designsystem
│   ├── permissions
│   └── result
├── data
│   ├── datasource
│   │   ├── auth
│   │   └── firestore
│   ├── dto
│   ├── mapper
│   └── repository
├── domain
│   ├── model
│   ├── repository
│   └── usecase
├── feature
│   ├── auth
│   ├── profile
│   ├── studenthome
│   ├── teacherhome
│   ├── courses
│   ├── enrollment
│   ├── qrgenerator
│   ├── qrscanner
│   ├── attendance
│   └── reports
└── MainActivity.kt
```

## 5. Roles y permisos

Roles: - `ADMIN`: administra usuarios, cursos y asignaciones. -
`TEACHER`: gestiona cursos asignados, sesiones y asistencia de esos
cursos. - `STUDENT`: consulta sus cursos y registra su asistencia.

Estados de usuario: - `PENDING`: perfil creado, pendiente de validación
institucional. - `ACTIVE`: puede usar las funciones autorizadas. -
`DISABLED`: acceso funcional bloqueado.

**Regla importante:** el cliente Android nunca debe poder elegir o
modificar libremente su propio rol. El alta inicial crea un perfil
`PENDING` con rol `STUDENT` o un rol provisional seguro, según la
política del proyecto. La asignación de `TEACHER` y `ADMIN` se hace
desde una operación administrativa protegida.

Para mayor seguridad, los roles privilegiados pueden reflejarse en
Firebase Custom Claims, establecidos únicamente desde un entorno
confiable con Firebase Admin SDK. Firestore conserva el perfil visible.

## 6. Modelo de Firestore

Todas las colecciones principales son top-level para facilitar consultas
y reglas explícitas.

### 6.1 `users/{uid}`

``` json
{
  "uid": "firebase-auth-uid",
  "firstName": "Ana",
  "lastName": "Lopez",
  "email": "ana@example.com",
  "photoUrl": null,
  "institutionalCode": "EST-0001",
  "role": "STUDENT",
  "status": "PENDING",
  "authProvider": "google.com",
  "createdAt": "SERVER_TIMESTAMP",
  "updatedAt": "SERVER_TIMESTAMP"
}
```

Notas: - `uid` debe coincidir con el UID de Firebase Authentication. -
`authProvider` puede ser `google.com` o `password`. - No almacenar
contraseña. - `institutionalCode` puede ser obligatorio según las reglas
del centro. - `role` y `status` solo los modifica un actor autorizado.

### 6.2 `courses/{courseId}`

``` json
{
  "name": "Desarrollo de Sistemas",
  "description": "Curso de desarrollo de aplicaciones",
  "courseCode": "DS-2026-01",
  "section": "A",
  "teacherIds": ["uid-docente-01"],
  "status": "ACTIVE",
  "createdBy": "uid-admin",
  "createdAt": "SERVER_TIMESTAMP",
  "updatedAt": "SERVER_TIMESTAMP"
}
```

### 6.3 `enrollments/{enrollmentId}`

``` json
{
  "courseId": "course-001",
  "studentId": "uid-estudiante-01",
  "status": "ACTIVE",
  "enrolledAt": "SERVER_TIMESTAMP",
  "enrolledBy": "uid-estudiante-01"
}
```

ID recomendado: combinación determinística `courseId_studentId`, para
impedir duplicados.

### 6.4 `enrollmentCodes/{codeId}`

``` json
{
  "courseId": "course-001",
  "codeHash": "HASH_DEL_CODIGO",
  "status": "ACTIVE",
  "expiresAt": "SERVER_TIMESTAMP_MAS_VIGENCIA",
  "maxUses": 40,
  "uses": 0,
  "createdBy": "uid-docente",
  "createdAt": "SERVER_TIMESTAMP"
}
```

El código de inscripción debe validarse mediante Cloud Function. No
guardar un código secreto en texto plano si puede evitarse. Aplicar
límites de uso y expiración.

### 6.5 `sessions/{sessionId}`

``` json
{
  "courseId": "course-001",
  "title": "Semana Tecnica - Sesion 1",
  "teacherId": "uid-docente-01",
  "status": "ACTIVE",
  "startsAt": "SERVER_TIMESTAMP",
  "expiresAt": "SERVER_TIMESTAMP_MAS_DURACION",
  "lateAfter": null,
  "createdAt": "SERVER_TIMESTAMP",
  "closedAt": null
}
```

### 6.6 `sessionTokens/{tokenId}`

``` json
{
  "sessionId": "session-001",
  "courseId": "course-001",
  "tokenHash": "HASH_DEL_TOKEN",
  "status": "ACTIVE",
  "expiresAt": "SERVER_TIMESTAMP_MAS_60_SEGUNDOS",
  "createdAt": "SERVER_TIMESTAMP"
}
```

El QR representa un token aleatorio, temporal y de un solo propósito. La
función de servidor valida el hash, sesión, vigencia y estado. Se puede
renovar periódicamente el token. No incluir correo, UID ni datos
personales en el QR.

### 6.7 `attendances/{attendanceId}`

``` json
{
  "sessionId": "session-001",
  "courseId": "course-001",
  "studentId": "uid-estudiante-01",
  "status": "PRESENT",
  "registeredAt": "SERVER_TIMESTAMP",
  "source": "QR"
}
```

ID recomendado: `sessionId_studentId`, para garantizar un único registro
por estudiante y sesión. La creación debe realizarse de forma
transaccional o mediante Cloud Function para evitar duplicados y validar
todos los permisos.

Estados posibles: - `PRESENT` - `LATE` - `ABSENT` - `JUSTIFIED`

La falta puede derivarse al cerrar la sesión comparando inscritos y
asistencias, o guardarse explícitamente en una fase posterior.

### 6.8 `auditLogs/{logId}`

``` json
{
  "actorId": "uid-docente",
  "action": "ATTENDANCE_MANUALLY_UPDATED",
  "entityType": "ATTENDANCE",
  "entityId": "session-001_student-001",
  "reason": "Correccion autorizada",
  "createdAt": "SERVER_TIMESTAMP"
}
```

Los registros de auditoría deben escribirse desde operaciones confiables
y no ser editables por usuarios normales.

## 7. Flujo de autenticación

### Email y contraseña

1.  Android llama a Firebase Authentication
    `createUserWithEmailAndPassword`.
2.  Firebase crea la identidad y devuelve `uid`.
3.  La app crea `users/{uid}` con perfil mínimo y estado seguro.
4.  Se envía verificación de correo, si el centro la exige.
5.  El usuario completa su perfil.
6.  Se consulta el estado y rol para decidir el acceso.

### Google

1.  Android inicia el flujo de Google Sign-In / Credential Manager según
    la configuración vigente.
2.  Se obtiene la credencial de Google.
3.  Se intercambia por credencial de Firebase Authentication.
4.  Firebase devuelve el UID.
5.  Si no existe `users/{uid}`, crear perfil básico.
6.  Si faltan datos institucionales, completar perfil.
7.  Cargar permisos y navegar según el rol.

Si el mismo correo usa más de un proveedor, configurar correctamente la
vinculación de proveedores de Firebase para evitar cuentas duplicadas.

## 8. Flujo de inscripción a curso

1.  El estudiante inicia sesión.
2.  Ingresa un código de inscripción.
3.  La app llama a una Cloud Function.
4.  La función verifica identidad, estado del estudiante, hash del
    código, vigencia y cupo.
5.  La función crea `enrollments/{courseId_studentId}` si no existe.
6.  La app muestra el curso en Mis cursos.

No confiar en una validación hecha solamente en Kotlin.

## 9. Flujo de creación de sesión y QR

1.  Docente autenticado selecciona un curso asignado.
2.  Android solicita crear sesión.
3.  Cloud Function verifica rol y asignación docente-curso.
4.  La función crea `sessions/{sessionId}`.
5.  Genera token aleatorio seguro y guarda solo su hash.
6.  Devuelve el token temporal al docente para representarlo como QR.
7.  El QR se renueva con una frecuencia definida y expira.
8.  El docente puede cerrar la sesión.

La función debe controlar que el docente no cree sesiones para cursos
ajenos.

## 10. Flujo de registro de asistencia

1.  Estudiante autenticado escanea el QR.
2.  Android obtiene el token y llama a `registerAttendance`.
3.  Cloud Function valida:
    -   Usuario autenticado y activo.
    -   Rol `STUDENT`.
    -   Inscripción activa en el curso.
    -   Sesión activa y dentro de horario.
    -   Token válido y no vencido.
    -   No existe asistencia previa para esa sesión.
4.  La función crea el documento con ID determinístico.
5.  Devuelve el resultado.
6.  Firestore actualiza la vista de asistencia del docente en tiempo
    real.

La cámara solo lee el QR. El cliente no decide si la asistencia es
válida.

## 11. Seguridad de Firebase

Configurar Firebase Authentication, Firestore Rules, Storage Rules, App
Check y Cloud Functions.

Reglas conceptuales mínimas: - Un usuario puede leer su propio perfil. -
Un usuario no puede cambiar `role`, `status` ni `uid`. - Estudiantes
solo consultan sus inscripciones y asistencias. - Docentes solo
consultan cursos asignados y datos de sus sesiones. - Solo
administradores autorizados gestionan roles y cursos globales. - Los
clientes no crean directamente asistencias, tokens de sesión ni logs de
auditoría. - Los clientes no pueden escribir campos privilegiados.

Las reglas finales deben escribirse y probarse con Firebase Emulator
Suite. No desplegar reglas abiertas como `allow read, write: if true`.

## 12. Índices de Firestore previstos

Crear índices compuestos según las consultas reales, por ejemplo: -
`enrollments`: `studentId ASC, status ASC`. - `enrollments`:
`courseId ASC, status ASC`. - `sessions`:
`courseId ASC, startsAt DESC`. - `sessions`:
`teacherId ASC, status ASC`. - `attendances`:
`studentId ASC, registeredAt DESC`. - `attendances`:
`sessionId ASC, registeredAt ASC`. - `attendances`:
`courseId ASC, registeredAt DESC`.

Firestore indicará índices faltantes al ejecutar consultas; ajustar
según las consultas implementadas.

## 13. Dependencias y configuración

-   Crear proyecto Android en Android Studio con Kotlin.
-   Usar Jetpack Compose y Material 3.
-   Configurar Firebase con el plugin de Google Services y
    `google-services.json`.
-   Registrar SHA-1/SHA-256 para los proveedores de autenticación que lo
    requieran.
-   Habilitar Authentication: Email/Password y Google.
-   Crear Firestore en modo producción.
-   Configurar Storage solo si se almacenarán fotos.
-   Configurar Cloud Functions y App Check.
-   No subir claves privadas ni archivos de credenciales de Admin SDK al
    repositorio.

Las versiones concretas de Gradle, Kotlin, Compose y Firebase BoM se
elegirán compatibles entre sí al crear el proyecto; evitar copiar
versiones antiguas sin verificar compatibilidad.

## 14. Fases de implementación

**Fase 1 --- Base** - Proyecto Android. - Navegación. - Tema Material
3. - Firebase configurado.

**Fase 2 --- Autenticación y perfil** - Registro email. - Login email. -
Google. - Recuperación. - Perfil y roles.

**Fase 3 --- Cursos** - Consulta de cursos. - Inscripción mediante
código. - Vista de cursos por rol.

**Fase 4 --- QR y asistencia** - Crear sesión. - Generar token
temporal. - Escanear QR. - Validación en Cloud Functions. - Evitar
duplicados.

**Fase 5 --- Reportes** - Asistencia en vivo. - Historial. -
Estadísticas. - Auditoría de correcciones.

**Fase 6 --- Calidad** - Reglas y pruebas con Emulator Suite. - Pruebas
de permisos por rol. - Pruebas en dispositivos reales. - Manejo de
conexión y errores. - Publicación interna.

## 15. Criterios de aceptación

-   Google y email permiten autenticar.
-   Cada identidad tiene un único perfil asociado a su UID.
-   Un estudiante no puede elevar sus privilegios.
-   Solo estudiantes inscritos pueden registrar asistencia.
-   Un QR vencido o sesión cerrada no registra asistencia.
-   No se permiten duplicados por sesión y estudiante.
-   El docente solo administra cursos asignados.
-   La asistencia usa hora del servidor.
-   Las reglas de Firestore bloquean accesos no autorizados.
