# SmartAttendance --- Flujo de la experiencia y resultado esperado para la Semana Técnica

## 1. Propósito del proyecto

SmartAttendance será una solución de control de asistencia académico que
conecta una aplicación móvil Android desarrollada en Kotlin con un panel
web desarrollado en Angular. Ambos clientes utilizan Firebase como
plataforma backend.

El objetivo de la Semana Técnica es presentar una experiencia
tecnológica funcional, no solamente mostrar pantallas. Los visitantes
podrán observar y probar cómo un docente crea una sesión, cómo los
estudiantes registran su asistencia escaneando un QR y cómo los
resultados aparecen en tiempo real en el panel.

La presentación debe sentirse como una demostración de un producto real
utilizado por una institución educativa.

## 2. Objetivo general

Diseñar, construir y demostrar un sistema digital de asistencia que
permita:

-   Gestionar usuarios con distintos roles.
-   Administrar cursos y matrículas.
-   Crear sesiones de asistencia.
-   Registrar asistencia mediante códigos QR temporales.
-   Visualizar los registros en tiempo real.
-   Consultar historial y estadísticas.
-   Reducir el registro manual y facilitar el seguimiento académico.

## 3. Resultado final que queremos conseguir

Al finalizar el proyecto, los alumnos deberán presentar un prototipo
funcional integrado con estas tres piezas:

1.  **Aplicación Android:** estudiantes y docentes inician sesión desde
    sus teléfonos. Los estudiantes escanean el QR; los docentes pueden
    consultar sus cursos y sesiones.
2.  **Panel web Angular:** el administrador gestiona usuarios y cursos;
    el docente crea sesiones y visualiza quién registró asistencia.
3.  **Firebase:** autentica usuarios, almacena perfiles, cursos,
    inscripciones, sesiones y asistencias, y permite sincronizar la
    información en tiempo real.

### La demostración que debe impresionar

En un proyector se muestra el panel del docente con una sesión abierta y
un QR visible. Varios estudiantes usan sus propios celulares para
iniciar sesión y escanearlo. Al completar cada escaneo, el nombre del
estudiante aparece automáticamente en la lista del panel, junto con la
hora de registro. El contador de presentes aumenta sin recargar la
página.

La demostración termina mostrando el resumen de asistencia y el
historial de la sesión.

**Ese es el momento central de la presentación:** una acción realizada
desde un teléfono se refleja inmediatamente en el panel web.

## 4. Actores del sistema

### Administrador

-   Inicia sesión en Angular.
-   Registra o valida usuarios.
-   Crea cursos y secciones.
-   Asigna docentes.
-   Consulta indicadores generales.
-   Revisa reportes y auditoría.

### Docente

-   Inicia sesión en Android o Angular.
-   Consulta los cursos que tiene asignados.
-   Crea una sesión de asistencia.
-   Muestra el QR temporal en el proyector o pantalla.
-   Observa los registros en tiempo real.
-   Cierra la sesión y consulta el resumen.

### Estudiante

-   Se registra o inicia sesión con Google o correo y contraseña.
-   Completa su perfil institucional.
-   Se une a un curso mediante un código de inscripción o recibe una
    matrícula asignada.
-   Escanea el QR de una sesión activa.
-   Recibe confirmación del registro.
-   Consulta su historial y porcentaje de asistencia.

Los roles privilegiados no se eligen libremente durante el registro. El
administrador asigna los roles autorizados.

## 5. Flujo completo del sistema

### Etapa 1 --- Preparación institucional

**Responsable:** Administrador.

1.  El administrador inicia sesión en el panel Angular.
2.  Registra los cursos que participarán en la demostración.
3.  Registra o valida a los docentes.
4.  Asigna cada docente a uno o varios cursos.
5.  Configura secciones, si corresponde.
6.  Genera códigos de inscripción para los cursos.
7.  Comparte los códigos con los estudiantes.

**Resultado esperado:** la plataforma tiene usuarios, cursos y
relaciones configuradas antes de iniciar las actividades.

### Etapa 2 --- Registro de estudiantes

**Responsable:** Estudiante.

1.  El estudiante abre SmartAttendance en Android.
2.  Selecciona Continuar con Google o registrarse con correo y
    contraseña.
3.  Firebase Authentication autentica la identidad.
4.  La aplicación crea o recupera el perfil asociado al UID.
5.  El estudiante completa los datos institucionales solicitados.
6.  Ingresa el código de inscripción del curso.
7.  El sistema valida el código y crea la matrícula.
8.  El curso aparece en Mis cursos.

**Resultado esperado:** cada estudiante tiene una identidad única y
figura como inscrito en el curso correspondiente.

### Etapa 3 --- Creación de sesión

**Responsable:** Docente.

1.  El docente inicia sesión.
2.  Abre Mis cursos.
3.  Selecciona el curso.
4.  Presiona Crear sesión.
5.  Ingresa el título, por ejemplo: "Semana Técnica --- Demostración de
    SmartAttendance".
6.  Define la duración y las condiciones de la sesión.
7.  Confirma la creación.
8.  El sistema crea la sesión y genera un token QR temporal.
9.  El docente abre la pantalla Mostrar QR.

**Resultado esperado:** existe una sesión activa asociada a un curso y a
un docente autorizado.

### Etapa 4 --- Registro de asistencia mediante QR

**Responsable:** Estudiante y sistema.

1.  El estudiante abre la opción Escanear QR.
2.  Autoriza el uso de la cámara, si es la primera vez.
3.  Apunta al QR que muestra el docente.
4.  La aplicación lee el token.
5.  Envía el token a una operación segura del backend.
6.  El backend comprueba que el usuario esté autenticado y activo.
7.  Comprueba que el estudiante esté matriculado en el curso.
8.  Comprueba que la sesión y el token sigan vigentes.
9.  Comprueba que el estudiante no haya registrado asistencia
    previamente.
10. Registra la asistencia usando la hora del servidor.
11. La aplicación muestra "Asistencia registrada correctamente".

**Resultado esperado:** se registra una sola asistencia válida por
estudiante y sesión.

### Etapa 5 --- Visualización en tiempo real

**Responsable:** Docente y visitantes.

1.  El panel Angular mantiene abierta la pantalla de asistencia en vivo.
2.  Cada registro válido aparece en la lista.
3.  Se actualiza el contador de presentes.
4.  Se muestra la hora de registro.
5.  El docente puede buscar estudiantes y revisar el estado de la
    sesión.

**Resultado esperado:** los visitantes observan cómo los registros
realizados desde distintos teléfonos se reflejan en el panel sin
recargar la página.

### Etapa 6 --- Cierre y reportes

**Responsable:** Docente.

1.  El docente cierra la sesión.
2.  El backend impide nuevos registros para esa sesión.
3.  Se muestra el resumen de presentes y tardanzas.
4.  El docente consulta el listado completo.
5.  El estudiante puede revisar su registro en el historial.
6.  El administrador puede consultar los indicadores generales, según
    sus permisos.

**Resultado esperado:** la actividad queda cerrada y los registros
permanecen disponibles para consulta y reporte.

## 6. Guion sugerido para la presentación pública

Duración estimada: 10 a 15 minutos.

  -----------------------------------------------------------------------
  Tiempo                  Demostración            Qué verá el público
  ----------------------- ----------------------- -----------------------
  1 min                   Presentación del        Cómo se registra
                          problema                actualmente la
                                                  asistencia y qué
                                                  dificultades existen

  2 min                   Panel administrativo    Cursos, docentes y
                                                  estudiantes

  2 min                   Registro / login móvil  Acceso con Google o
                                                  correo

  2 min                   Crear sesión            El docente genera el QR

  3 min                   Escaneo en vivo         Varios alumnos escanean
                                                  desde sus celulares

  2 min                   Panel en tiempo real    Los nombres aparecen y
                                                  el contador aumenta

  2 min                   Reporte final           Resumen e historial de
                                                  asistencia
  -----------------------------------------------------------------------

### Guion breve para el presentador

"SmartAttendance es una solución desarrollada por nuestros estudiantes
para digitalizar el control de asistencia. El docente crea una sesión
desde el sistema y proyecta un código QR temporal. Los estudiantes
ingresan desde sus celulares, escanean el código y el sistema valida su
identidad y matrícula. En segundos, el registro aparece en el panel web
del docente. Toda la información se almacena en Firebase y puede
consultarse posteriormente."

## 7. Escenario práctico para el Día del Logro / Semana Técnica

Preparar una demostración con datos de prueba:

-   1 administrador.
-   1 docente.
-   1 curso llamado "Desarrollo de Sistemas".
-   8 a 15 estudiantes de prueba.
-   1 sesión llamada "Demostración Semana Técnica".
-   Teléfonos Android con la aplicación instalada.
-   Una laptop conectada al proyector con el panel Angular abierto.
-   Conexión a internet estable.
-   Un QR de respaldo para contingencias, claramente identificado como
    demostración alternativa.

### Distribución del espacio

**Estación 1 --- Administración** - Una laptop muestra el panel
Angular. - Un alumno explica la gestión de cursos y usuarios.

**Estación 2 --- Registro móvil** - Uno o dos alumnos muestran el login
y el perfil Android. - Los visitantes pueden probar el acceso con
cuentas de demostración.

**Estación 3 --- Asistencia QR** - El docente o alumno encargado
proyecta el QR. - Los visitantes escanean con sus teléfonos de prueba.

**Estación 4 --- Resultados** - Se muestra la lista en vivo y el reporte
final. - Un alumno explica cómo se almacenan y protegen los datos.

## 8. Qué debe estar terminado antes del evento

### Imprescindible para una demostración funcional

-   [ ] Aplicación Android instalada y probada.
-   [ ] Login con Google y/o correo funcionando.
-   [ ] Perfiles asociados a UID de Firebase.
-   [ ] Roles de estudiante y docente correctamente asignados.
-   [ ] Cursos e inscripciones creados.
-   [ ] Docente puede crear una sesión.
-   [ ] QR temporal puede generarse y escanearse.
-   [ ] Backend valida sesión, matrícula y duplicados.
-   [ ] Asistencia aparece en Angular en tiempo real.
-   [ ] Docente puede cerrar la sesión.
-   [ ] Se muestra un resumen de resultados.
-   [ ] Reglas de seguridad probadas; no utilizar reglas abiertas.

### Mejoras deseables si el tiempo alcanza

-   [ ] Panel con gráficos.
-   [ ] Exportación CSV.
-   [ ] Historial individual del estudiante.
-   [ ] Notificaciones.
-   [ ] Fotografía de perfil.
-   [ ] Filtros por curso y fecha.
-   [ ] Modo oscuro.
-   [ ] Auditoría de correcciones manuales.

## 9. Plan de trabajo para los alumnos

Organizar equipos pequeños con responsabilidades claras. Los integrantes
deben coordinarse usando un repositorio Git compartido y tareas
visibles.

### Equipo A --- Aplicación Android

Responsabilidades: - Kotlin y Jetpack Compose. - Autenticación. -
Perfil. - Cursos e inscripción. - Escáner QR. - Historial del
estudiante.

### Equipo B --- Panel Angular

Responsabilidades: - Login web. - Dashboard. - Gestión de usuarios y
cursos. - Sesiones. - Asistencia en vivo. - Reportes.

### Equipo C --- Firebase e integración

Responsabilidades: - Configuración del proyecto Firebase. - Firestore y
modelo de datos. - Reglas de seguridad. - Cloud Functions. - Validación
del QR y asistencia. - Pruebas de integración.

Si el grupo es pequeño, los equipos pueden combinar responsabilidades.
Todos deben comprender el flujo completo, no solo su módulo.

## 10. Métricas para evaluar el resultado

Al finalizar la presentación, comprobar:

-   ¿Cuántos estudiantes pudieron autenticarse?
-   ¿Cuántos escanearon el QR correctamente?
-   ¿Cuánto tardó en aparecer cada registro en el panel?
-   ¿El sistema rechazó un QR vencido?
-   ¿El sistema evitó un segundo registro del mismo estudiante?
-   ¿El docente pudo cerrar la sesión?
-   ¿Se pudo consultar el historial?

Como meta de demostración, buscar que un registro válido aparezca en el
panel en pocos segundos con una conexión estable. Medir el resultado
real durante los ensayos; no prometer un tiempo fijo sin pruebas.

## 11. Pruebas negativas que demuestran calidad

Además del camino exitoso, mostrar brevemente que el sistema controla
errores:

1.  Escanear un QR vencido: debe rechazarlo.
2.  Escanear dos veces el mismo QR en la misma sesión: debe informar que
    ya existe asistencia.
3.  Intentar registrar asistencia sin estar inscrito: debe rechazarlo.
4.  Intentar registrar asistencia con sesión cerrada: debe rechazarlo.
5.  Abrir una pantalla sin permisos: debe bloquear el acceso.

Estas pruebas demuestran que no es solamente una aplicación visual, sino
un sistema con reglas de negocio y controles de seguridad.

## 12. Consideraciones para el evento

-   Usar cuentas y datos ficticios o autorizados; no proyectar datos
    personales reales.
-   Preparar usuarios de demostración y probarlos antes del evento.
-   Confirmar permisos de cámara en cada teléfono.
-   Probar la red Wi-Fi y los datos móviles.
-   Mantener la laptop conectada a la corriente.
-   Tener cargadores y una batería externa.
-   Ensayar el flujo completo varias veces.
-   Preparar capturas o un video corto como respaldo si falla internet.
-   No mostrar claves, tokens privados ni credenciales de Firebase.
-   Definir quién presenta, quién opera Android y quién explica
    Angular/Firebase.

## 13. Alcance responsable del producto

SmartAttendance es una herramienta de apoyo para el registro y
seguimiento de asistencia. Un QR por sí solo no demuestra de manera
absoluta que la persona estuvo físicamente en el aula: puede compartirse
o fotografiarse. La expiración, rotación de tokens, autenticación,
matrícula y controles de sesión reducen abusos, pero no sustituyen
mecanismos adicionales de verificación presencial.

Para una primera versión académica, el objetivo es demostrar un flujo
seguro y funcional de registro. No presentar el sistema como una
solución infalible contra suplantaciones.

## 14. Definición de terminado

El proyecto se considera listo para la Semana Técnica cuando:

1.  Un administrador puede preparar usuarios, cursos y docentes.
2.  Un estudiante puede iniciar sesión y estar inscrito en un curso.
3.  Un docente puede crear una sesión y mostrar un QR temporal.
4.  Un estudiante inscrito puede escanearlo y recibir confirmación.
5.  El registro aparece en el panel Angular en tiempo real.
6.  El sistema rechaza QR inválidos, vencidos, sesiones cerradas y
    duplicados.
7.  El docente puede cerrar la sesión y consultar el resumen.
8.  El equipo puede explicar la arquitectura, las colecciones de
    Firebase y las medidas de seguridad.

**Resultado esperado de la Semana Técnica:** presentar SmartAttendance
como un prototipo integrado, construido por los alumnos, que resuelve un
problema concreto y que el público puede probar en vivo desde un
teléfono Android y un panel web.
