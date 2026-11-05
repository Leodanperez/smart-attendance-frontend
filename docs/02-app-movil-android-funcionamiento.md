# Smart Attendance — App Móvil (Android)

## Funcionamiento y flujo técnico

> Documento de estudio. Describe cómo está construida la aplicación móvil Android de Smart Attendance, qué tecnologías usa y cómo fluye la información, con foco en el flujo estrella del sistema: el **registro de asistencia por código QR**.

---

## 1. ¿Qué es la app móvil?

La app Android es la herramienta que usan **docentes y estudiantes en el aula**:

- El **docente** inicia una sesión de clase y muestra en su pantalla un **código QR dinámico** que cambia cada cierto tiempo.
- El **estudiante** abre la app, **escanea el QR** con la cámara y su asistencia queda registrada al instante.

La app comparte la misma base de datos en la nube (Firebase/Firestore) que el panel web, por lo que lo que se registra en el celular aparece de inmediato en la vista de "asistencia en vivo" del panel.

---

## 2. Tecnologías utilizadas (stack)

| Área | Tecnología | Para qué se usa |
|------|-----------|-----------------|
| Plataforma | **Android nativo** | App para teléfonos Android |
| Lenguaje | **Kotlin** | Lenguaje principal de la app |
| Interfaz de usuario | **Jetpack Compose** | Construcción de pantallas con código declarativo |
| Diseño visual | **Material 3 (Material You)** | Sistema de diseño de Google |
| Backend / Base de datos | **Firebase (Google)** | Autenticación y base de datos en la nube |
| — Autenticación | **Firebase Authentication** | Inicio de sesión |
| — Base de datos | **Cloud Firestore** | Base de datos NoSQL en tiempo real |
| Escaneo de QR | **CameraX + Google ML Kit (Barcode Scanning)** | Leer el código QR con la cámara |
| Generación de QR | **ZXing** | Dibujar el QR en la pantalla del docente |
| Programación asíncrona | **Kotlin Coroutines + Flow** | Tareas en segundo plano y datos en tiempo real |
| Navegación | **Navigation Compose** | Moverse entre pantallas |
| Carga de imágenes | **Coil** | Mostrar fotos de perfil |
| Serialización | **kotlinx.serialization** | Convertir datos a/desde JSON |
| Inicio de sesión con Google | **Credentials API + Google ID** | Login con cuenta Google (opcional) |
| Pantalla de inicio | **Core SplashScreen** | Splash al abrir la app |
| Sistema de compilación | **Gradle (Kotlin DSL)** | Construcción del proyecto |

### Requisitos de la app
- **Android mínimo:** Android 7.0 (API 24).
- **Android objetivo:** API 37.
- **Permisos:** Internet, estado de red y **cámara** (para escanear el QR).

---

## 3. Arquitectura de la app (Clean Architecture)

La app está organizada en capas para que el código sea ordenado y fácil de mantener:

```
┌───────────────────────────────────────────────┐
│  FEATURE (Pantallas)                            │
│  Login, Home docente, Home estudiante,          │
│  Escáner QR, Generador QR, Cursos, Reportes...  │
├───────────────────────────────────────────────┤
│  DOMAIN (Reglas del negocio)                    │
│  Modelos (User, Course, Session, Attendance)    │
│  Casos de uso (LoginUseCase, etc.)              │
│  Interfaces de repositorio                      │
├───────────────────────────────────────────────┤
│  DATA (Acceso a datos)                          │
│  Repositorios (implementación)                  │
│  DataSources (Firebase Auth y Firestore)        │
│  DTOs y Mappers (convierten datos de Firebase)  │
└───────────────────────────────────────────────┘
```

- **Feature:** lo que el usuario ve y toca (pantallas con Jetpack Compose).
- **Domain:** las reglas puras del negocio, sin depender de Firebase.
- **Data:** cómo se leen y guardan los datos en Firebase.

Los **DTO** (objetos que llegan de Firestore) se transforman con **mappers** a **modelos de dominio** limpios que usa el resto de la app.

---

## 4. Roles en la app

| Rol | Pantalla principal | Qué hace |
|-----|--------------------|----------|
| **Docente (TEACHER)** | Home docente | Crea sesiones de clase y **muestra el QR dinámico**. Consulta sus cursos y reportes. |
| **Estudiante (STUDENT)** | Home estudiante | **Escanea el QR** para registrar asistencia. Consulta sus cursos, porcentaje de asistencia e historial. Puede inscribirse a un curso con un código. |

Al iniciar sesión, la app lee el rol del usuario desde Firestore y lo lleva a la pantalla correcta.

---

## 5. Flujo general de la app

```
1. Abre la app (pantalla splash)
        │
        ▼
2. ¿Hay sesión iniciada?
        │
        ├── NO ──▶ Pantalla de Login
        │                 │
        │                 ▼
        │         Firebase Authentication valida
        │                 │
        │                 ▼
        │         Lee perfil del usuario en Firestore
        │
        ▼
3. Según el rol:
        ├── Docente  ──▶ Home Docente  ──▶ Crear sesión + Mostrar QR
        └── Estudiante ─▶ Home Estudiante ─▶ Escanear QR
        │
        ▼
4. La asistencia se guarda en Firestore en tiempo real
        │
        ▼
5. El panel web y la app ven los datos al instante
```

---

## 6. Flujo estrella: registro de asistencia por QR

Este es el corazón del sistema. Participan el docente y el estudiante.

### Paso A — El docente abre la sesión (genera el QR)

1. El docente elige un curso y crea una **sesión de clase** (define duración y tolerancia de tardanza).
2. La app crea un documento en la colección `sessions` con estado **ACTIVE** y las horas de inicio y expiración.
3. La app genera un **token aleatorio** (10 caracteres). De ese token **solo se guarda su huella SHA-256** en la colección `sessionTokens` (nunca el token en claro).
4. El token en claro se usa para dibujar el **código QR** en la pantalla del docente con **ZXing**.
5. El QR contiene un JSON con la estructura:
   ```json
   { "v": 1, "sessionId": "...", "courseId": "...", "token": "...", "courseName": "...", "title": "..." }
   ```
6. **El QR es dinámico:** se renueva cada cierto tiempo (por defecto ~60 segundos). Al renovarse, el token anterior se marca como **REVOKED** y se crea uno nuevo. Esto evita que alguien tome una foto del QR y la reenvíe después.

### Paso B — El estudiante escanea el QR

1. El estudiante abre la pantalla **Escanear** (la app pide permiso de cámara la primera vez).
2. **CameraX** muestra la cámara en vivo y **ML Kit** detecta el código QR automáticamente.
3. Al leerlo, la app interpreta el JSON y extrae `sessionId`, `courseId` y `token`.
4. La app envía el registro a Firestore: crea un documento en `attendances` con el identificador `sessionId_studentId` (así un mismo alumno no puede registrarse dos veces en la misma sesión).
5. Las **reglas de seguridad de Firestore** validan en el servidor que:
   - El token corresponde a una sesión activa y vigente (no expirado, no revocado).
   - El estudiante está inscrito en el curso.
   - La ventana de tiempo de la sesión está abierta.
6. Según la hora, el estado queda como **PRESENTE** o **TARDANZA** (si pasó el tiempo de tolerancia).
7. El estudiante ve el resultado al instante; no necesita tocar ningún botón, el envío es automático.

### Paso C — Cierre de la sesión

1. Al terminar la clase, el docente **cierra la sesión** (estado **CLOSED**).
2. La app marca automáticamente como **FALTA (ABSENT)** a los estudiantes inscritos que no registraron asistencia (cada falta lleva un motivo).
3. Se revocan los tokens activos de esa sesión.

> **Opción manual:** si un estudiante no puede escanear, puede ingresar el **código manualmente** en la misma pantalla del escáner.

---

## 7. Diagrama resumido del QR

```
   DOCENTE                              ESTUDIANTE
   ───────                              ──────────
Crea sesión (ACTIVE)
        │
Genera token aleatorio
        │
Guarda SHA-256 en sessionTokens
        │
Dibuja QR (JSON) ──────────────▶  Escanea con la cámara (ML Kit)
        │                                  │
El QR se renueva cada ~60s                 │ lee sessionId + courseId + token
        │                                  ▼
        │                         Escribe en attendances
        │                                  │
        │                         Reglas de Firestore validan
        │                                  ▼
        │                         PRESENTE o TARDANZA
        ▼                                  │
Cierra sesión (CLOSED) ◀───────────────────┘
        │
Marca FALTA a los que no registraron
```

---

## 8. Autoinscripción con código

El estudiante puede inscribirse a un curso sin intervención del docente:

1. El administrador genera un **código de inscripción** en el panel web (se guarda como hash, con fecha de expiración y número máximo de usos).
2. El estudiante ingresa el código en la app.
3. La app busca el código por su hash, valida que esté **activo, vigente y con cupo**, y crea la inscripción.
4. La inscripción y el incremento de usos del código se hacen en una **operación atómica (batch)**, para que no queden datos a medias.

---

## 9. Datos en tiempo real (Coroutines + Flow)

La app usa **Kotlin Coroutines** y **Flow** junto con los *listeners* de Firestore para recibir datos en vivo:

- El home del estudiante escucha si algún docente abrió una sesión de sus cursos, y le avisa que puede escanear.
- El docente ve el **roster en vivo**: quién ya registró asistencia mientras transcurre la clase.
- Todo se actualiza solo, sin recargar.

---

## 10. Regla de cálculo de asistencia (igual que en el web)

```
% asistencia = (presentes + tardanzas) / (sesiones cerradas − justificadas)
```

- Cuentan como asistencia: **Presente** y **Tardanza**.
- **Justificada** no cuenta como falta y se excluye del total.
- Sin registro en una sesión cerrada = **Falta**.

Esta regla está implementada igual en la app y en el panel para que los porcentajes coincidan siempre.

---

## 11. Seguridad

- **Token del QR como hash:** nunca viaja ni se guarda el token en claro; solo su huella SHA-256.
- **QR dinámico:** el código caduca a los pocos segundos, evitando capturas y reenvíos.
- **Validación en el servidor:** las reglas de Firestore verifican cada registro; no se confía solo en el teléfono.
- **Identificador único por registro:** `sessionId_studentId` impide asistencias duplicadas.
- **Permiso de cámara:** se solicita explícitamente al usuario y solo se usa para escanear.

---

## 12. Modo claro / oscuro

La app incluye un control de tema (`ThemeController`) con soporte para **modo claro y oscuro** usando los colores de **Material 3**, en línea con el estilo del panel web.

---

## 13. Resumen

La app Android es una aplicación **nativa en Kotlin con Jetpack Compose** y **arquitectura limpia**, conectada a **Firebase**. Su función central es el **registro de asistencia por QR dinámico**: el docente genera un código que cambia cada pocos segundos y el estudiante lo escanea con **CameraX + ML Kit**. Toda la información se valida con reglas de seguridad y se sincroniza en tiempo real con el panel web gracias a **Firestore**, **Coroutines** y **Flow**.
