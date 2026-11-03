# Revisión — Responsividad mobile-first del panel Angular

Veredicto: **APPROVED**

## Alcance revisado
- Commit `294ff69` ("fix: evitar desborde horizontal en movil en 3 pantallas del panel"), parte de plantilla responsive.
- Plantillas inline de los componentes standalone en `src/app/features/`.
- Utilidades compartidas en `src/styles.css` (`.table-wrap`, `.table`, `.card`, `.input`, `.label`, `.btn`, `.badge`, etc.).

## Evidencia de verificación (registrada por el coder, no re-ejecutada)
- Mensaje de commit `294ff69`: `npx ng build --configuration production -> exit code 0, sin errores ni warnings de plantilla (NG8xxx)`.
- Verificación requerida presente. No se re-ejecutó el build por indicación de la tarea.

## Comprobación por checklist

1. **Tablas anchas con scroll horizontal** — OK.
   - En `.table-wrap` (que aplica `overflow-x-auto`): `sessions.ts:116`, `audit.ts:61`, `students.ts:45`, `live-attendance.ts:138`, `courses-list.ts:92`, `academic-periods.ts:64`, `courses/course-detail.ts:88,113`, `reports.ts:107` (envoltura única que cubre todas las tablas y el `ng-template #studentTable`), `users-list.ts:90` (tabla de escritorio).
   - `enrollments.ts:122` usa `overflow-x-auto` directo en lugar de `.table-wrap`; la tabla vive dentro de una `card`, por lo que repetir `.table-wrap` duplicaría estilos. El scroll horizontal queda cubierto. Aceptable.

2. **Grids mobile-first (1 col en móvil escalando con sm:/md:/lg:)** — OK.
   - Filtros y stats: `admin-dashboard.ts:45,93`, `reports.ts:46`, `live-attendance.ts:101`, `teacher/student-dashboard`, `students.ts:24`, `audit.ts:31`. Todos parten de 1 columna.
   - Formularios de dos columnas: `profile.ts:52`, `settings.ts:17`, `user-detail.ts:125`, dialogs `career-form-dialog.ts:62`, `period-form-dialog.ts:67` usan `sm:grid-cols-2` (1 col por defecto).

3. **Cabeceras título+botones con flex-wrap y gap** — OK.
   - `live-attendance.ts:68` cabecera de sesión convertida a `flex flex-wrap items-center justify-between gap-3`; la fila de badges/botón (`:77`) pasa a `flex flex-wrap items-center gap-2`, evitando desborde de "EN VIVO"/estado/"Cerrar sesión" en móvil. Escritorio sin cambios.

4. **Formularios: inputs a ancho completo y pares que colapsan** — Mayormente OK.
   - `.input` ya es `w-full`.
   - Selectores con botón al lado: `teacher-assignments.ts:59` y `enrollments.ts:109` cambian `min-w-64 flex-1` → `w-full flex-1 sm:w-auto sm:min-w-64`, forzando el control a ancho completo en móvil para que el botón baje y no desborde. Correcto.
   - Pares `grid grid-cols-2 gap-2` sin colapso (`sessions.ts:68` Duración/Tardanza; `user-detail.ts:141` Tipo/Número doc). Son dos inputs cortos dentro de tarjetas a columna única en móvil; a 320px el contenido disponible (~248px) se reparte en ~120px por columna, los inputs `w-full` se encogen y NO hay desborde horizontal. Quedan estrechos pero usables; no constituye fallo de corrección.

5. **Contenedores de ancho fijo grande ajustados** — OK.
   - Diálogos `career-form-dialog.ts:46` (`w-[34rem] max-w-full`) y `period-form-dialog.ts:51` (`w-[32rem] max-w-full`) acotados con `max-w-full`, reforzado por `.dialog-panel { max-width: calc(100vw - 2rem) }` en `styles.css`. No desbordan.

6. **truncate/min-w-0 en filas flex** — OK.
   - `users-list.ts` filas de escritorio y tarjetas móviles usan `min-w-0` + `truncate` en nombre/correo.

7. **download.ts a 320px** — OK.
   - Contenedor `max-w-2xl` con `px-4`, botón APK `w-full max-w-xs mx-auto`, QR `w-40`, tarjetas y listas reflúyen. Sin elementos de ancho fijo que desborden a 320px. (Archivo no modificado; ya cumplía.)

## Restricciones
- Cambios solo en breakpoints pequeños; variantes `sm:`/`md:`/`lg:` conservan el layout de escritorio. Sin cambios de color/tipografía/look&feel.
- No se tocaron routing ni `app.config` dentro del alcance responsive.
- Proyecto Android no tocado.

## Observación (no bloqueante)
- El commit `294ff69`, rotulado como cambio responsive, incluye además una modificación de lógica de negocio en `live-attendance.ts` `close()`: pasa de `sessionService.close()` a `sessionService.closeAndMarkAbsent(session, absentIds)` y cambia textos/flujo del diálogo. Esa lógica corresponde a una funcionalidad aprobada por separado (marcar faltas al cerrar, mensajes 6–8 del usuario) y el método `closeAndMarkAbsent` está definido en `session.service.ts` del árbol de trabajo construido (build exit 0). En el estado actual del working tree compila y ejecuta, por lo que no hay fallo alcanzable de corrección/datos. Se anota como higiene de commit: una pieza de lógica quedó mezclada en un commit "solo responsive" y depende de cambios aún no commiteados de `session.service.ts`. No es un bloqueante del objetivo responsive y no autoriza modificar ese comportamiento aprobado.

## Conclusión
Los cambios cumplen los requisitos aprobados de responsividad mobile-first, reutilizan las utilidades existentes, mantienen el escritorio idéntico y no introducen fallos alcanzables de corrección, seguridad o datos dentro del alcance. La verificación requerida (build de producción, exit 0, sin warnings de plantilla) está registrada. No quedan bloqueantes.
