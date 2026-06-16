# Backlog de historias de usuario

Backlog funcional derivado de las incidencias detectadas en las pruebas de despliegue local
(jornadas abiertas sin cerrar, fichajes olvidados, ausencias sin gestionar) y de los requisitos
de la **Ley de control horario 2026** (España): registro digital obligatorio, registros
inmutables y trazables, pausas computables, conservación 4 años y acceso para la Inspección
de Trabajo.

> Origen: `historias de usuario.txt` (notas de trabajo). El documento original tenía dos HU 4;
> aquí se renumeran como HU-04 (pausas/trazabilidad) y HU-05 (horarios).

## Resumen y priorización

| HU | Título | Fase | Depende de |
|----|--------|------|------------|
| HU-04 | Pausas intrajornada y trazabilidad inalterable | 4 | — |
| HU-05 | Horarios y cargas horarias personalizadas | 4 | — |
| HU-02 | Fichaje con registro olvidado (entrada manual) | 5 | HU-04 |
| HU-03 | Cierre automático de turno por olvido | 5 | HU-04, HU-05 |
| HU-01 | Gestión de ausencias injustificadas | 5 | HU-04, HU-05 |
| HU-06 | Confirmación de acciones (prevención de errores) | 6 | HU-04 |
| HU-07 | Geolocalización en el fichaje (RGPD) | 8 | HU-04, HU-06 |
| HU-08 | Modo kiosco (PIN / código QR) | 8 | HU-05, HU-07 |

El orden no es el del documento original: **HU-04 y HU-05 van primero porque son la base de
datos sobre la que se apoya todo lo demás** (modelo de eventos auditable + horario teórico
de cada empleado). Sin horario teórico no se puede saber cuándo cerrar un turno (HU-03) ni
qué día cuenta como ausencia (HU-01); sin auditoría append-only no se puede permitir ningún
registro manual (HU-02) cumpliendo la ley.

---

## HU-04 — Pausas intrajornada y trazabilidad inalterable

**Como** auditor o inspector de trabajo, **quiero** que el sistema registre las pausas y sea
inalterable, **para** asegurar el cumplimiento de los descansos obligatorios sin manipulación
de datos.

Criterios de aceptación:
- Pausar la jornada (comida, café) y reanudarla.
- Ninguna modificación hace UPDATE destructivo: toda corrección genera un registro nuevo y
  conserva el anterior en una tabla de auditoría (append-only).
- Exportación a PDF/CSV verificable (requisito legal para inspecciones).

Implicaciones técnicas (nuestro stack):
- Migración mayor: pasar de `attendance` (check_in/check_out planos) a un modelo de eventos
  `attendance_events` (tipos: `check_in`, `check_out`, `pause_start`, `pause_end`) con
  `source` (`realtime`, `manual`, `system`, `kiosk`) y `created_by`.
- Tabla `attendance_audit` append-only: quién cambió qué, cuándo, valor anterior y motivo
  (la ley exige campo de justificación obligatorio en cada corrección).
- Cómputo de horas trabajadas = suma de tramos entre eventos, descontando pausas no computables.
- Export CSV primero (barato); PDF con totalización por periodo después.

## HU-05 — Asignación de horarios y cargas horarias personalizadas

**Como** administrador/RRHH, **quiero** asignar a cada empleado un horario y carga horaria
(completa, parcial, turnos), **para** calcular horas extra correctamente y que las
automatizaciones (HU-01, HU-03) usen la hora de salida real de cada contrato.

Criterios de aceptación:
- Plantillas de horario (ej. L-V 09:00–17:00, media jornada L-X-V, turno de mañana).
- Asignación de plantilla u horario personalizado al crear/editar empleado.
- Carga horaria semanal esperada calculada y visible (40h, 20h…).
- Cambios de horario con fecha de efecto: no alteran reportes pasados (vigencias).

Edge cases:
- Turnos nocturnos (22:00–06:00): el "día de trabajo" se vincula al inicio del turno, no al
  calendario natural — ni ausencia el segundo día ni cierre a las 23:59.
- Cambio de horario a mitad de semana: aplicar solo desde la fecha indicada.

Implicaciones técnicas:
- Tablas `schedule_templates` y `employee_schedules` (asignación con `valid_from`/`valid_to`).
- Reemplaza las constantes hardcodeadas del frontend (`WORK_HOURS = 8`, 9:00–17:00 en
  `frontend/src/utils/constants.ts`).
- UI admin tipo calendario semanal (la versión arrastrar-bloques puede esperar a Fase 6).

## HU-02 — Fichaje con registro olvidado (entrada manual)

**Como** empleado, **quiero** registrar mi entrada manualmente si olvidé fichar al llegar,
**para** que mi jornada quede contabilizada sin bloquear mi día.

Criterios de aceptación:
- Opción secundaria visible "Registro olvidado" junto al botón de fichar.
- El empleado indica la hora real y opcionalmente un motivo.
- Queda en estado **Pendiente de validación** por el responsable, pero permite seguir
  trabajando (y fichar la salida).
- Marcado en BD como `manual` — trazabilidad para la Inspección (vía HU-04).

Edge cases:
- Hora futura → bloqueada por validación (frontend y backend).
- Solapamiento con un turno previo no cerrado → rechazar.
- Abuso (uso diario) → contador/indicador para el admin en el dashboard.

Implicaciones técnicas:
- Estado `pending_validation` en el registro + endpoint admin de validación (aprueba/rechaza
  con log de auditoría).
- Icono distintivo en el historial (reloj naranja) para fichajes manuales.

## HU-03 — Cierre automático de turno por olvido

**Como** sistema/empleado, **quiero** una alerta si no fiché la salida tras mi horario y que
el sistema cierre el turno si no respondo, **para** evitar jornadas abiertas indefinidas.
*(Resuelve la incidencia detectada en las pruebas locales: hoy el contador sigue sumando sin tope.)*

Criterios de aceptación:
- A los 15 min de la hora teórica de salida (según horario de HU-05): notificación
  "¿Sigues trabajando?".
- Sin interacción en otros 15 min → el sistema registra la salida automáticamente a la hora
  teórica de fin de turno, etiquetada como `system` (cierre por sistema).
- El cierre ocurre en backend aunque la app del empleado esté cerrada u offline.
- Al abrir la app al día siguiente: banner "Tu turno de ayer se cerró automáticamente a las
  18:00. Revisa si es correcto."

Edge cases:
- Horas extra legítimas cerradas por el sistema → se corrigen con HU-02 o vía admin.

Implicaciones técnicas:
- Scheduler en el propio API (node-cron en proceso; en Docker basta con el contenedor del API).
- Primera iteración de notificaciones: in-app + email. Push real queda para más adelante.

## HU-01 — Gestión de ausencias injustificadas

**Como** sistema/administrador, **quiero** detectar automáticamente empleados sin actividad
en todo el día y notificarles, **para** un control de asistencia preciso y legal.

Criterios de aceptación:
- Tarea programada diaria (23:59 o fin de turno según HU-05) que detecta empleados sin entrada.
- Cruce previo con el módulo de ausencias (vacaciones, bajas) antes de marcar la ausencia.
- Email automático al día siguiente: "Se registra una ausencia el día de ayer sin que
  corresponda a un día de vacaciones/baja", con botón "Justificar ausencia".
- El empleado no edita ese día: lo reporta al responsable.
- El admin autoriza y crea el registro manual con log de auditoría (quién y cuándo).

Edge cases:
- Fallo/bounce del email → fallback con notificación in-app (la tabla `notifications` ya existe).
- Cambios de zona horaria del empleado en viaje → la evaluación usa el horario asignado
  (HU-05) y `APP_TIMEZONE`, no la hora del dispositivo.

Implicaciones técnicas:
- **Módulo nuevo de ausencias** (tabla `absences`: vacaciones, baja médica, permiso) — requisito
  implícito de esta HU, hoy no existe.
- Servicio de email (nodemailer + SMTP configurable por env; en dev, Mailpit en docker-compose).
- Dashboard admin con alertas rojo/naranja para ausencias pendientes de justificar.

## HU-06 — Confirmación de acciones para prevención de errores

**Como** empleado, **quiero** confirmación antes de registrar entrada, pausa, reanudación o
salida, **para** evitar registros accidentales.

Criterios de aceptación:
- Las acciones principales no se ejecutan al instante: paso intermedio de confirmación
  ("Vas a registrar tu entrada a las 09:02. ¿Confirmar?").
- Se registra la hora de la **intención inicial**, no la del clic de confirmación.
- Botón de confirmar deshabilitado tras el primer clic (anti doble-tap).

Edge cases:
- Offline: guardar localmente con el timestamp original y sincronizar al volver la conexión,
  con aviso "Registro guardado en modo offline". *(Stretch: la cola offline es la parte
  compleja; el modal de confirmación entra primero.)*

Implicaciones técnicas:
- El backend debe aceptar un `intended_at` acotado (ej. máx. 2 min en el pasado) para no
  penalizar la confirmación lenta — excepción controlada al principio de "timestamps de servidor".
- En móvil, componente "slide to confirm" (encaja con el rediseño UX/UI de la Fase 6).

## HU-07 — Geolocalización en el fichaje y privacidad (RGPD)

**Como** administrador/empresa, **quiero** registrar la ubicación solo en el momento del
fichaje, **para** verificar el lugar de trabajo sin rastreo continuo.

Criterios de aceptación (resumen):
- Captura puntual de lat/long + `accuracy` en el payload del fichaje; nunca en background.
- Configurable por perfil: obligatoria / opcional / deshabilitada.
- Si es obligatoria y se deniegan permisos → fichaje bloqueado con mensaje de ayuda.
- Geocercas opcionales (radio configurable por centro de trabajo).
- Pantalla educativa de pre-permiso antes del pop-up nativo del navegador.
- Baja precisión (>1 km): permitir el fichaje pero generar alerta de anomalía silenciosa
  para el admin, en vez de bloquear.
- Vista admin: enlace "Ver en mapa" por registro.

Edge cases: mock locations (flag de advertencia), interiores con mala señal (etiquetar
"baja precisión"), captura offline con sincronización posterior.

## HU-08 — Fichaje en centro de trabajo: modo kiosco (PIN / QR)

**Como** trabajador presencial, **quiero** fichar con mi QR personal o PIN en una tablet
compartida, **para** fichar rápido sin usar mi móvil personal.

Criterios de aceptación (resumen):
- PIN único (4-6 dígitos) y QR generados por empleado; consultables en su portal o por email.
- El admin activa el "Modo Kiosco" en el dispositivo, que queda vinculado al centro
  (hereda geocoordenadas fijas).
- Pantalla permanente numpad + cámara; al identificar, registra la acción según el estado
  actual del empleado (entrada / pregunta pausa-salida) y resetea en 3-5 s.
- Registros etiquetados `source: kiosk_<centro>` para auditoría (campo ya previsto en HU-04).

Edge cases: buddy punching (QR dinámico rotando cada 30 s para entornos exigentes),
concurrencia a hora punta, kiosco offline con validación local y sincronización,
limpieza total del estado entre fichajes (sin datos del anterior en DOM/caché),
feedback audiovisual inmediato (beep + check verde / cruz roja), screen pinning en la tablet.

---

## Requisitos transversales (ley control horario 2026)

Aplican a todas las HUs y se verifican en cada fase:

- **Inmutabilidad**: ningún registro se borra ni se sobreescribe sin rastro (HU-04 lo implementa,
  el resto lo respeta).
- **Identificación unívoca** del trabajador en cada fichaje (sin biometría — excluida por la AEPD).
- **Sellado temporal automático** del servidor (ya implementado en Fase 1).
- **Conservación 4 años** con cifrado y servidores en la UE (afecta a backups de Fase 7 y a la
  elección de hosting).
- **Acceso del trabajador** a sus propios registros en cualquier momento (ya cubierto por
  `GET /attendance` filtrado por rol).
- **Exportación PDF/CSV** verificable para la Inspección (HU-04).
