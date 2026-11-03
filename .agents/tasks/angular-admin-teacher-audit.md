# Auditoría del panel Angular — flujos ADMIN y TEACHER

Investigación de solo lectura. No se modificó código. Build verificado con `npx ng build` (ver §7).

## Resumen ejecutivo

El panel está **mucho más completo de lo que sugiere la pregunta "qué falta para el 100%"**. Prácticamente todas las features declaradas en rutas existen, están cableadas a servicios reales de Firestore, persisten datos y auditan acciones. No hay botones sin handler, formularios sin submit, ni listas con datos simulados; tampoco hay TODOs ni placeholders de datos (solo `placeholder=` de HTML en inputs, que es legítimo). El build de producción compila limpio, sin errores ni warnings.

Los hallazgos reales se concentran en **inconsistencias con `firestore.rules`** (sobre todo en inscripciones y en permisos de lectura cruzados) y en **un flujo que el panel ofrece pero que las reglas, en modo demo sin Cloud Functions, no soportan desde el cliente**. También hay matices de navegación por rol. No encontré nada que, por sí solo, rompa el flujo central del docente (crear sesión → QR → en vivo → cerrar → reportes), que está completo y correctamente limitado a sus cursos.

Veredicto por rol:

- **TEACHER**: flujo docente completo y con scoping correcto por `teacherIds`. Pendiente menor: un enlace de navegación ambiguo y la imposibilidad (por reglas) de que el QR sea escaneado si el canje de códigos de inscripción nunca ocurre (dependencia de app móvil). Ver BLOQ-1, IMP-2.
- **ADMIN**: CRUD completo y persistente de usuarios, carreras, periodos, cursos, asignaciones e inscripciones; settings y auditoría funcionan de verdad. El punto crítico es la **inscripción por código**: el panel genera códigos pero el canje depende de una Cloud Function que, según el contexto, no existe (BLOQ-1).

---

## 1) Mapa de navegación por rol

### Fuente del menú
`src/app/core/layout/navigation.ts` define `NAVIGATION` y `navigationFor(role)` (líneas 38-80, 82-89). El sidebar (`src/app/core/layout/sidebar.ts:146` `nav = computed(() => navigationFor(this.user()?.role))`) **filtra correctamente por rol**: cada `NavItem.roles` se comprueba contra el rol en sesión y los grupos vacíos se descartan.

### Qué ve ADMIN
Dashboard; Usuarios + Registrar usuario; Periodos académicos; Carreras; Cursos; Asignación de docentes; Inscripciones; Sesiones; Asistencia en vivo; Reportes; Auditoría; Configuración; Mi perfil. Coincide con los `canActivate: [roleGuard('ADMIN')]` de `app.routes.ts`.

### Qué ve TEACHER
Dashboard; **Mis cursos** (`/courses`); Estudiantes; Sesiones; Asistencia en vivo; Reportes; Mi perfil. No ve Usuarios, Periodos, Carreras, Asignación, Inscripciones, Auditoría ni Configuración. Coincide con los guards (`students`, `sessions`, `live-attendance`, `reports` permiten `'ADMIN','TEACHER'`).

### Hallazgos de navegación

- **MENOR — doble entrada "Cursos" / "Mis cursos" al mismo path.** `navigation.ts:56-57`: ADMIN ve "Cursos" y TEACHER/STUDENT ven "Mis cursos", ambos a `/courses`. Correcto, pero conviven en el mismo grupo; no hay bug, el filtrado por rol evita que un usuario vea las dos. Sin acción obligatoria.
- **MENOR — `/courses` y `/courses/:id` sin `roleGuard`.** `app.routes.ts:72-76, 95-98`. Es intencional (los comparten los tres roles) y el aislamiento real lo da `AcademicScopeService` (ver §4) + `firestore.rules`. No es un fallo, pero significa que un STUDENT con sesión en el panel podría navegar a `/courses` (el menú no se lo ofrece, pero la URL es accesible). Dado que STUDENT usa la app móvil y las reglas filtran los datos, el impacto es nulo; documentarlo basta.
- **Sin rutas rotas ni features inalcanzables.** Cada `loadComponent` de `app.routes.ts` resuelve a un componente existente en `src/app/features/...`. Todas las features tienen entrada en el menú o se alcanzan por enlaces contextuales (p. ej. `teacher-assignments` desde cursos con `?courseId=`, `enrollments` desde periodos/carreras).

---

## 2) Datos quemados / placeholders / TODOs

Búsqueda `TODO|FIXME|placeholder|hardcoded|dummy|mock|lorem` en `src/**/*.ts`: **no hay datos simulados ni TODOs**. Las únicas coincidencias son atributos `placeholder=` de inputs (login, buscadores, formularios) — uso legítimo de UI.

Todos los indicadores y listas provienen de Firestore vía servicios:
- Dashboards (`admin-dashboard.ts`, `teacher-dashboard.ts`, `student-dashboard.ts`) calculan KPIs con `ReportService` sobre datos de `AcademicScopeService`. No hay "90%" ni números fijos.
- El número de estudiantes, cursos, sesiones, asistencias, etc. se derivan de los datos reales.

Observaciones de configuración (no son datos quemados de negocio, pero sí valores fijos del entorno):
- **MENOR — `environment.ts:6` `production: false` sin archivo de reemplazo.** `angular.json` no define `fileReplacements` para producción, así que incluso el build de producción usa `environment.ts` con `production:false`. No rompe nada funcional, pero conviene corregir si algún código depende de `environment.production`.
- **MENOR — App Check desactivado.** `environment.ts:17` `recaptchaEnterpriseSiteKey: ''`. Aceptable en demo; relevante para endurecer seguridad en producción.
- Credenciales Firebase en `environment.ts` son la config pública del cliente (no secreta), correcto para este diseño.

---

## 3) Flujos incompletos / acciones sin efecto

No encontré botones sin handler, formularios sin submit real ni dialogs que no persistan. Verificado caso por caso:

- **Usuarios**: creación real (`UserService.createUser`, `user.service.ts:103-168`) usando una app secundaria de Firebase para no cerrar la sesión del ADMIN; cambios de rol/estado y edición institucional persisten con auditoría. Detalle (`user-detail.ts`) con acciones reales.
- **Carreras** (`careers.ts` + `career-form-dialog.ts` + `career.service.ts`): crear/editar vía diálogo persiste y propaga `careerName` a los cursos.
- **Periodos** (`academic-periods.ts` + `period-form-dialog.ts` + `academic-period.service.ts`): crear/editar fechas/activar/cerrar persisten; cerrar un periodo desactiva sus cursos en el mismo batch.
- **Cursos** (`course-form.ts`, `course.service.ts`): crear/editar/activar/desactivar persisten; código generado único.
- **Asignación de docentes** (`teacher-assignments.ts`): `arrayUnion`/`arrayRemove` reales.
- **Sesiones / En vivo / QR**: completo (ver §4).
- **Settings** (`settings.ts` + `settings.service.ts`): guarda en `settings/general` con merge + auditoría; el panel consume esos valores en vivo (duración/tardanza por defecto, umbral, segundos del QR).
- **Auditoría** (`audit.ts`): solo lectura real desde `auditLogs`, con filtros y export CSV.
- **Perfil** (`profile.ts`): edición propia, subida de foto a Storage, reset de contraseña, tema y tamaño de texto.

Único "flujo que la UI ofrece pero no se completa sola": la **inscripción por código** (ver BLOQ-1 en §6), porque el canje lo haría una Cloud Function inexistente.

---

## 4) Flujo TEACHER (detalle)

### Scoping por `teacherIds`: correcto
`AcademicScopeService` (`academic-scope.service.ts`) aísla todo por rol:
- Cursos del docente: `coursesFor` → `courseService.getForTeacher(uid)` = `where('teacherIds','array-contains', uid)` (`course.service.ts:54-60`).
- Inscripciones/sesiones/asistencias: `byRole(...)` usa `getByCourses(courseIds)` con los ids de **sus** cursos (`academic-scope.service.ts:82-101`).
- Estudiantes visibles: solo los inscritos activos en sus cursos (`students$`, líneas 98-111).
- `course-detail.ts:184-188` `canManage` exige `TEACHER && c.teacherIds.includes(uid)` para mostrar acciones de gestión.

### Flujo completo: crear → QR → en vivo → cerrar → reportes
- **Crear sesión**: `sessions.ts` (formulario reactivo con validación, defaults desde Settings) → `SessionService.create` (`session.service.ts:73-106`) escribe el doc en `sessions` con `teacherId = uid`, `status:'ACTIVE'`, y redirige a `/live-attendance?sessionId=`.
- **Mostrar QR**: `session-qr.ts` + `SessionService.requestQrToken` (`session.service.ts:117-140`) crea el token en `sessionTokens` guardando solo el hash; payload `{v:1,sessionId,courseId,token}` (`buildQrPayload`, 146-148); se renueva solo según `qrRefreshSeconds`.
- **Asistencia en vivo**: `live-attendance.ts` escucha `attendances` de la sesión en tiempo real (`getBySession`), muestra contador "en vivo", stats y tabla; permite corregir estado con motivo (`correct` → `attendance.service.ts:68-99`).
- **Cerrar sesión**: `SessionService.close` (`session.service.ts:108-115`) pone `status:'CLOSED'` + `closedAt`, con confirmación.
- **Reportes de sus cursos**: `reports.ts` y `students.ts` operan solo sobre los cursos del docente (scoping). CSV disponible.

**El flujo docente está completo.** No hay nada que solo funcione para ADMIN y le falte al TEACHER dentro de su ámbito: el docente puede crear/cerrar sesiones de sus cursos, generar QR y ver/corregir asistencia, igual que un ADMIN. Lo que el ADMIN tiene de más (usuarios, periodos, carreras, asignaciones, inscripciones, auditoría, settings) es por diseño de rol, no un déficit del TEACHER.

### Matiz TEACHER
- **IMP-2 (ver §6)**: el QR del docente solo sirve de verdad si un estudiante inscrito lo escanea desde la app móvil **y** existe un registro de inscripción `enrollments/{courseId_studentId}` con `status:'ACTIVE'`. Como el canje de código por Cloud Function no existe (BLOQ-1), en una demo sin inscripciones manuales por ADMIN el QR no producirá asistencias. El docente del panel no puede inscribir estudiantes (Inscripciones es solo ADMIN), así que depende del ADMIN.

---

## 5) ADMIN: CRUD, settings y auditoría

- **Usuarios**: completo y persistente (`users-list.ts`, `user-form/`, `user-detail.ts`, `user.service.ts`). Alta real contra Auth+Firestore, unicidad de documento/código, cambio de rol/estado con motivo, bloqueo de auto-cambio (`preventSelfChange`), edición institucional. **Funciona.**
- **Carreras / Periodos / Cursos / Asignaciones / Inscripciones**: CRUD real y auditado (ver §3). **Funcionan y persisten.**
- **Settings**: `settings.service.ts` lee/escribe `settings/general` y el panel lo consume en vivo. **Funciona de verdad.**
- **Auditoría**: cada operación de servicio añade un log al **mismo batch** (`audit.service.ts:addToBatch`), atómico con la operación; la vista `audit.ts` lista/filtra/exporta. **Funciona de verdad.**

Excepción importante en el CRUD de ADMIN: **inscripciones por código** (BLOQ-1). La inscripción **manual** por ADMIN sí persiste (`enrollment.service.ts:enroll` → doc `enrollments/{id}`), y las reglas la permiten. Lo que no funciona end-to-end es el canje del código generado.

---

## 6) Consistencia con `firestore.rules`

Revisé `firestore.rules` contra lo que hace el cliente. Hallazgos ordenados por prioridad.

### BLOQUEANTE

- **BLOQ-1 — Inscripción por código sin backend que la canjee (ADMIN/ambos).**
  - UI/servicio: `enrollments.ts` genera códigos y `enrollment.service.ts:107-131` escribe en la colección **`enrollmentCodes`** (plural con "s"). Comentarios del propio código dicen que "la validación al canjear la hace la Cloud Function" (`enrollment.service.ts:104`, `crypto.utils.ts:16`).
  - Reglas: la colección con regla definida es **`enrollmentCodes`** (`firestore.rules`, bloque `match /enrollmentCodes/{codeId}`). Permite a ADMIN crear/leer/deshabilitar, **consistente** con el panel.
  - Problema real: el **canje** (incrementar `uses`, crear el `enrollments/{courseId_studentId}`) lo haría una Cloud Function con Admin SDK; la regla de `enrollments` dice textualmente que el canje lo hace la Function y que desde el cliente **solo ADMIN** puede crear inscripciones. El contexto indica que **no hay Cloud Functions** (plan gratuito). Por tanto, un estudiante **no puede** autoinscribirse con el código desde la app, y sin inscripción activa el QR del docente no genera asistencias.
  - Recomendación: decidir una de dos vías. (a) Asumir inscripción **manual por ADMIN** como único camino (ya funciona) y **quitar/ocultar** la generación de códigos para no prometer un flujo inexistente; o (b) permitir por reglas el autoenrol del estudiante validando el `codeHash` (como ya se hace con `tokenValid` para asistencia), replicando el patrón client-side del QR. Dado el diseño "modo demo sin Functions", (b) es coherente con el resto del sistema.

### IMPORTANTE

- **IMP-1 — Permiso de lectura de `users` más amplio en reglas que lo que la UI aprovecha, y un posible exceso (ambos).** `firestore.rules` (match `/users/{uid}`, `allow get`) concede lectura a cualquier usuario activo cuando `resource.data.role == 'TEACHER'` (cuarta condición) además de a ADMIN, al propio usuario y a TEACHER sobre STUDENT/TEACHER. Significa que **un STUDENT activo puede leer el perfil de cualquier TEACHER**. La UI del panel no explota esto (el panel no es para STUDENT), pero como las reglas se comparten con Android, conviene confirmar que exponer datos del docente (documento, teléfono, dirección) a estudiantes es intencional. Recomendación: si no lo es, restringir esa cuarta condición a campos públicos o eliminarla.

- **IMP-2 — Cadena de dependencias del QR (TEACHER).** La regla de creación de `attendances` (bloque `match /attendances/{attendanceId}`, `allow create` por QR) exige: estar inscrito (`enrolledIn`), sesión `ACTIVE` y en horario, y `tokenValid`. Todo correcto y coherente con `session.service.ts`. Pero depende de que exista la inscripción (ver BLOQ-1). No es un bug de reglas; es la consecuencia aguas abajo de BLOQ-1. Resolver BLOQ-1 desbloquea esto.

### MENOR

- **MENOR-1 — `sessionTokens` revocación vs. renovación.** La regla solo permite update a `status:'REVOKED'` (`match /sessionTokens/{tokenId}`, `allow update`). El cliente **no** revoca el token al renovar: `session-qr.ts` simplemente crea uno nuevo (`requestQrToken`) y deja el anterior expirar por `expiresAt`. Es seguro (el viejo caduca), pero quedan tokens `ACTIVE` vencidos en la colección. Recomendación opcional: revocar el token previo al rotar para higiene de datos.
- **MENOR-2 — `enrollmentCodes.createdBy`.** La regla de create exige `createdBy == request.auth.uid`; el servicio usa `this.auth.currentUser()?.uid ?? null`. Si por carrera de inicialización `currentUser()` fuera null, el create fallaría. En la práctica el ADMIN está autenticado, así que es un riesgo teórico; vale la pena endurecer el servicio para exigir uid no nulo (como ya hace `session.service.ts:create`).

No se detectaron acciones de la UI que las reglas **bloquearían** en el flujo ADMIN/TEACHER normal (crear curso/carrera/periodo/sesión/asignación/inscripción manual/corrección de asistencia/settings): todas cumplen las precondiciones de sus reglas (ids determinísticos, campos requeridos, `updatedBy`/`updateReason` en correcciones, `status` permitidos).

---

## 7) Build / calidad

Comando ejecutado: `npx ng build` (configuración por defecto = **production**, según `angular.json` `defaultConfiguration: "production"`).

Resultado: **compila correctamente**, exit code 0.
- "Application bundle generation complete."
- Sin errores de TypeScript ni de plantilla.
- Sin warnings de presupuesto (initial total ≈ 957 kB raw / 253 kB transfer, por debajo del `maximumWarning` de 1 MB).
- Lazy chunks por feature generados (dashboard, users, courses, reports, etc.), confirmando el lazy-loading de rutas.

No se ejecutó ningún servidor (`ng serve` omitido por instrucción). No hay suite de tests ejecutable relevante que correr para esta auditoría (el scaffolding incluye Vitest pero no hay specs de negocio significativos para el alcance pedido).

---

## Conclusiones y recomendaciones priorizadas

### Bloqueante
1. **BLOQ-1 — Resolver la inscripción por código** (ADMIN/ambos). Elegir: eliminar la generación de códigos y quedarse con inscripción manual (rápido, ya funciona), **o** implementar el autoenrol client-side validando `codeHash` por reglas, al estilo del QR. Es lo único que impide que el flujo "estudiante se inscribe → escanea QR → aparece en vivo" funcione end-to-end sin backend. Archivos: `src/app/features/enrollments/enrollments.ts`, `src/app/core/services/enrollment.service.ts`, `firestore.rules` (bloques `enrollmentCodes` y `enrollments`).

### Importante
2. **IMP-1 — Revisar la lectura de perfiles TEACHER por cualquier usuario activo** en `firestore.rules` (match `/users/{uid}`, cuarta condición de `allow get`). Confirmar intención o restringir, porque expone datos personales del docente a estudiantes vía reglas compartidas con Android.
3. **IMP-2 — Queda resuelto al cerrar BLOQ-1** (la cadena del QR depende de que exista la inscripción activa).

### Menor
4. Alinear comentarios/strings que mencionan Cloud Functions inexistentes para no confundir (`settings.ts:42`, `enrollment.service.ts:104`, `crypto.utils.ts:16`, `error-message.ts`): o bien implementar lo prometido, o bien aclarar que es modo demo client-side.
5. Añadir `environment.prod.ts` con `production: true` y `fileReplacements` en `angular.json`, o setear `production: true` según despliegue.
6. Revocar el token de QR anterior al rotar (`session-qr.ts` / `session.service.ts`) para no dejar tokens `ACTIVE` vencidos (MENOR-1).
7. Endurecer `enrollment.service.ts:generateCode` para exigir uid no nulo (MENOR-2).
8. Documentar que `/courses` es accesible por URL para STUDENT aunque no esté en su menú (sin impacto por el scoping de datos).

### Lo que NO falta (para calibrar el "100%")
Navegación por rol, CRUD de usuarios/carreras/periodos/cursos/asignaciones, inscripción manual, flujo completo del docente (sesión→QR→en vivo→cerrar→reportes), settings, auditoría, perfil, tema claro/oscuro y export CSV: **todo implementado, cableado a Firestore y persistente**. El panel está cerca del 100% funcional; el gap principal es el canje de códigos de inscripción por la ausencia de Cloud Functions.
