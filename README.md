# Sistema de Control de Asistencia de Empleados

[![CI](https://github.com/sefogi/asist_employed/actions/workflows/ci.yml/badge.svg)](https://github.com/sefogi/asist_employed/actions/workflows/ci.yml)

Sistema de gestión de asistencia laboral: los empleados fichan entrada/salida y solicitan horas extra; el administrador gestiona empleados, aprueba horas extra y exporta reportes.

## Arquitectura

```
┌──────────────┐      HTTP/JSON       ┌──────────────┐        SQL        ┌──────────────┐
│   Frontend   │ ──────────────────▶  │   API REST   │ ────────────────▶ │  PostgreSQL  │
│ React + Vite │   JWT en cada call   │  Fastify 5   │   pg (pool)       │      16      │
└──────────────┘                      └──────────────┘                   └──────────────┘
```

- **Frontend:** React 19 + TypeScript + Tailwind CSS (`frontend/`)
- **Backend:** Node 22 + Fastify 5 + TypeScript (`backend/`)
- **Base de datos:** PostgreSQL 16 (migraciones SQL versionadas en `backend/migrations/`)
- **Contrato de API:** OpenAPI 3.1 design-first en [`docs/openapi.yaml`](docs/openapi.yaml), servido con Swagger UI en `/api/docs`
- **Seguridad:** contraseñas con bcrypt, sesiones JWT con expiración, autorización por rol en el backend
- **Tests:** vitest contra PostgreSQL real (TDD), incluye test de conformidad con el contrato OpenAPI

## Estructura del repositorio

Monorepo con [pnpm workspaces](https://pnpm.io/workspaces):

```
asist_employed/
├── frontend/             # SPA React (asist-employed-web)
│   ├── src/
│   └── package.json
├── backend/              # API REST (asist-employed-api)
│   ├── src/
│   ├── migrations/       # migraciones SQL versionadas de la BD
│   ├── test/
│   └── package.json
├── docs/
│   └── openapi.yaml      # contrato del API (fuente de verdad)
├── backend/Dockerfile    # imagen del API (multi-stage)
├── frontend/Dockerfile   # build de la SPA + nginx
├── frontend/nginx.conf   # nginx sirve la SPA y proxyea /api
├── docker-compose.yml    # stack de producción (db + api + web)
├── docker-compose.dev.yml# solo la BD para desarrollo
├── .env.example          # configuración global de producción
├── pnpm-workspace.yaml
└── package.json          # scripts del workspace
```

## Desarrollo local

Requisitos: Node 22+, pnpm, Docker.

```bash
# 1. Dependencias de todo el workspace (una sola vez, en la raíz)
pnpm install

# 2. Base de datos en Docker (puerto 5433; crea las BD asist y asist_test)
docker compose -f docker-compose.dev.yml up -d

# 3. Variables de entorno
cp backend/.env.example backend/.env      # revisa JWT_SECRET y APP_TIMEZONE
cp frontend/.env.example frontend/.env    # VITE_API_URL

# 4. Migraciones + datos de prueba
pnpm seed

# 5. Arrancar (en dos terminales)
pnpm dev:api    # API en http://localhost:3000 (Swagger en /api/docs)
pnpm dev        # frontend en http://localhost:5173
```

Los tests del backend necesitan la BD de Docker levantada: `pnpm test`.

## Despliegue en producción (Docker)

Todo el stack —PostgreSQL, API y frontend con nginx— corre en un solo servidor con `docker compose`. No hace falta Node ni pnpm instalados en la máquina: las imágenes se construyen solas.

```bash
# 1. Configuración global (en la raíz del repo)
cp .env.example .env       # edita POSTGRES_PASSWORD y, sobre todo, JWT_SECRET

# 2. Construir y levantar (db → api → web, encadenados por healthcheck)
docker compose up -d --build

# 3. Cargar el usuario admin inicial (solo la primera vez)
docker compose --profile tools run --rm seed
```

La aplicación queda en **http://localhost:8080** (cambia el puerto con `WEB_PORT` en el `.env`). nginx sirve la SPA y proxyea `/api` al backend, así que **todo va por el mismo origen y no hay CORS** en producción.

Detalles del stack:

- **`db`** — PostgreSQL 16 con volumen persistente `asist_db_prod`. No publica puerto al host: solo es accesible desde la red interna del compose.
- **`api`** — aplica las migraciones automáticamente al arrancar; healthcheck contra `/api/v1/health`. No arranca hasta que la BD está `healthy`.
- **`web`** — nginx con la SPA compilada; no arranca hasta que el API está `healthy`.
- **`seed`** — servicio puntual (perfil `tools`), no forma parte del stack permanente. Define `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` en el `.env` para no usar las credenciales por defecto.

Operación habitual:

```bash
docker compose ps                 # estado y salud de los servicios
docker compose logs -f api        # logs del backend
docker compose up -d --build      # redeploy tras cambios de código
docker compose down               # parar (conserva los datos)
docker compose down -v            # parar y BORRAR la base de datos
```

> El compose de producción usa el proyecto `asist_employed` y el de desarrollo `asist_employed_dev`: son independientes y no se pisan, puedes tener ambos sin conflicto.

## Usuarios de prueba (seed)

| Rol | Email | Contraseña |
| --- | --- | --- |
| Admin | admin@empresa.com | cambiar-admin-123 |
| Empleado | juan@empresa.com | empleado-1234 |
| Empleado | maria@empresa.com | empleado-1234 |
| Empleado | carlos@empresa.com | empleado-1234 |

> En producción define `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD` antes de ejecutar el seed, o cambia la contraseña tras el primer login.

## API

Contrato completo en [`docs/openapi.yaml`](docs/openapi.yaml). Resumen:

| Método | Ruta | Quién | Descripción |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/login` | público | Login → JWT |
| GET | `/api/v1/auth/me` | autenticado | Usuario actual |
| GET/POST | `/api/v1/employees` | admin | Listar / crear empleados |
| GET/PATCH/DELETE | `/api/v1/employees/:id` | admin (GET también el propio) | Detalle / editar / eliminar |
| GET | `/api/v1/attendance` | autenticado | Empleado: los suyos; admin: todos |
| POST | `/api/v1/attendance/check-in` | empleado | Fichar entrada (hora del servidor) |
| POST | `/api/v1/attendance/check-out` | empleado | Fichar salida |
| POST | `/api/v1/attendance/:id/overtime/request` | empleado dueño | Solicitar horas extra (notifica al admin) |
| POST | `/api/v1/attendance/:id/overtime/approve` | admin | Aprobar horas extra |
| POST | `/api/v1/attendance/manual` | empleado | Registro olvidado (entrada manual, queda pendiente de validar) |
| POST | `/api/v1/attendance/:id/validate` | admin | Aprobar / rechazar una entrada manual |
| GET/POST | `/api/v1/attendance/pause/start` · `/pause/end` | empleado | Pausar / reanudar la jornada |
| GET/PATCH | `/api/v1/attendance/:id` | dueño/admin | Detalle con pausas y auditoría / corregir (admin) |
| GET | `/api/v1/attendance/export.csv` | admin | Exportar asistencia en CSV (inspección) |
| GET/POST | `/api/v1/schedule-templates` | admin | Listar / crear plantillas de horario |
| GET/DELETE | `/api/v1/schedule-templates/:id` | admin | Detalle / eliminar plantilla |
| GET/POST | `/api/v1/employees/:id/schedule` | admin | Horario del empleado / asignar con vigencia |
| GET/POST | `/api/v1/absences` | admin (GET propio el empleado) | Listar / registrar ausencias |
| DELETE | `/api/v1/absences/:id` | admin | Eliminar ausencia |
| GET | `/api/v1/notifications` | admin | Notificaciones |
| DELETE | `/api/v1/notifications/:id` | admin | Eliminar notificación |
| GET | `/api/v1/login-logs` | admin | Registro de logins |
| GET | `/api/v1/health` | público | Healthcheck |

## Reglas de negocio del fichaje

- La hora de entrada/salida la fija **el servidor**, nunca el cliente.
- Un empleado no puede fichar entrada dos veces el mismo día (índice único en BD para registros abiertos).
- "Hoy" se evalúa en la zona horaria de `APP_TIMEZONE` (formato IANA, p. ej. `Europe/Madrid`).
- Al solicitar horas extra se crea automáticamente una notificación para el admin, ligada al registro de asistencia; al aprobarlas, la notificación se elimina.

### Pausas y trazabilidad (HU-04, Ley de control horario 2026)

- **Pausas intrajornada**: el empleado puede pausar (comida, café) y reanudar; solo se permite una pausa abierta a la vez y no se puede fichar salida con una pausa abierta. El tiempo pausado se descuenta de los minutos trabajados.
- **Registros inalterables**: corregir un fichaje (`PATCH /attendance/:id`, solo admin) **no destruye** el valor anterior; lo conserva en la tabla de auditoría `attendance_audit` (append-only) junto con quién, cuándo y un **motivo obligatorio**.
- **Export para inspección**: `GET /attendance/export.csv` (admin) genera un CSV con entrada, salida, minutos de pausa y trabajados, horas extra y si el registro fue corregido.

### Horarios y cargas horarias (HU-05)

- **Plantillas de horario**: bloques de trabajo por día (ISO 1=lunes…7=domingo); un `end_time` ≤ `start_time` es un turno nocturno. La carga horaria semanal esperada se calcula automáticamente.
- **Asignación con vigencias**: al asignar un horario desde una fecha, la asignación anterior se cierra el día previo (`valid_to`), de modo que los informes pasados no se alteran. Un horario "personalizado" de un empleado se modela como una plantilla dedicada.

### Registro olvidado (HU-02)

- Cada fichaje lleva un `source` (`realtime`, `manual`, `system`) y un `status` (`confirmed`, `pending_validation`, `rejected`).
- El empleado puede crear una **entrada manual** (`POST /attendance/manual`) si olvidó fichar: nace como `manual` + `pending_validation`, no puede tener hora futura ni solaparse con otro fichaje, y deja huella en la auditoría.
- El responsable la **valida** (`POST /attendance/:id/validate`, aprobar/rechazar), lo que también queda auditado.

### Cierre automático de turnos (HU-03)

- Un **scheduler** en el propio API (node-cron, `AUTO_CLOSE_CRON`) revisa las jornadas abiertas:
  - Pasada la hora teórica de salida + `AUTO_CLOSE_WARN_MINUTES`, avisa una vez al empleado ("¿Sigues trabajando?").
  - Pasada la hora teórica + `AUTO_CLOSE_GRACE_MINUTES`, **cierra el turno** a la hora teórica de fin y lo registra como `system_close` en la auditoría.
- La hora teórica sale del **horario activo** del empleado (HU-05); si no tiene horario, se usa `MAX_SHIFT_HOURS` como red de seguridad. Soporta turnos nocturnos (la hora de fin cae al día siguiente).
- El cierre ocurre en el backend, **independientemente de si la app del empleado está abierta**. Se puede desactivar con `AUTO_CLOSE_ENABLED=false`.

### Ausencias injustificadas (HU-01)

- **Módulo de ausencias**: el admin/RRHH registra vacaciones, bajas y permisos (`/absences`); cada empleado consulta las suyas.
- Un **cron diario** (`ABSENCE_CHECK_CRON`) detecta empleados que, según su horario activo, tenían día laborable pero no ficharon **ni** tienen una ausencia registrada, y genera un aviso in-app (`notifications` tipo `absence`). Es idempotente (un aviso por empleado y día).
- El **envío por email** queda preparado como punto de extensión (`EMAIL_ENABLED`, hoy desactivado): el aviso efectivo es la notificación in-app. El SMTP real se integrará en la Fase 7.

## Migraciones de base de datos

El esquema está versionado con migraciones SQL planas (estilo Flyway, *roll-forward*):

- Cada cambio de esquema es un fichero nuevo en `backend/migrations/`, numerado y **inmutable** una vez aplicado: `001_init.sql`, `002_lo_que_sea.sql`…
- El runner ([backend/src/db/migrate.ts](backend/src/db/migrate.ts)) aplica en orden las pendientes, cada una en su transacción, y registra lo aplicado en la tabla `schema_migrations`. Un advisory lock de Postgres impide que dos instancias migren a la vez.
- El API ejecuta las migraciones pendientes al arrancar, y también puedes lanzarlas a mano con `pnpm migrate`.
- **Nunca edites una migración ya aplicada**: si algo está mal, se corrige con una migración nueva (*roll forward*). No hay migraciones *down*; en producción revertir esquema con datos reales es más peligroso que avanzar.

## Scripts (desde la raíz)

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` | Frontend en modo desarrollo (Vite) |
| `pnpm dev:api` | API con recarga (tsx watch) |
| `pnpm build` | Compila frontend y backend |
| `pnpm lint` / `pnpm typecheck` | Linter / chequeo de tipos en ambos paquetes |
| `pnpm test` | Suite TDD del backend contra Postgres real |
| `pnpm migrate` / `pnpm seed` | Migraciones / datos iniciales |

## Flujo de trabajo (Git Flow + SemVer)

Ramas:

- **`main`** — solo releases estables, cada una con tag `vX.Y.Z`.
- **`develop`** — integración continua del trabajo terminado.
- **`feature/<nombre>`** — sale de `develop`, vuelve a `develop` con `git merge --no-ff`.
- **`release/X.Y.Z`** — sale de `develop` cuando se prepara una versión; ajustes finales, merge a `main` (+ tag) y de vuelta a `develop`.
- **`hotfix/<nombre>`** — sale de `main` para arreglos urgentes; merge a `main` y `develop`.

Commits con [Conventional Commits](https://www.conventionalcommits.org/es/) (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`…; `!` para breaking changes), que mapean directo a [SemVer](https://semver.org/lang/es/): `fix` → patch, `feat` → minor, breaking → major. Pre-1.0, los breaking changes suben el minor.

## Integración continua (CI/CD)

GitHub Actions en [`.github/workflows/`](.github/workflows):

- **`ci.yml`** — se ejecuta en cada PR y push a `develop`/`main`. Tres jobs en paralelo:
  - `quality`: `lint` + `typecheck` + `build` de todo el monorepo.
  - `test`: la suite TDD del backend contra un **Postgres real** (service container).
  - `docker`: construye las imágenes de API y web para validar los Dockerfiles.

  Usa caché de pnpm y de capas Docker (GHA) para acelerar; cancela ejecuciones obsoletas de la misma rama.
- **`release.yml`** — al crear un tag `vX.Y.Z`, construye y publica las imágenes de producción en GHCR (`ghcr.io/sefogi/asist_employed-api` y `-web`). El despliegue automático en un servidor se añadirá cuando exista uno.

## Roadmap

El backlog funcional detallado está en [docs/historias-usuario.md](docs/historias-usuario.md)
(HU-01 a HU-08, alineadas con la Ley de control horario 2026).

- [x] **Fase 1** — Backend propio (Fastify + PostgreSQL), bcrypt + JWT, contrato OpenAPI, TDD
- [x] **Fase 2** ([#1](https://github.com/sefogi/asist_employed/issues/1)) — Dockerización completa (frontend + API + BD + nginx) para un solo servidor
- [x] **Fase 3** ([#2](https://github.com/sefogi/asist_employed/issues/2)) — CI/CD con GitHub Actions (lint + tests + build de imágenes); deploy a servidor pendiente de infraestructura
- [x] **Fase 4** ([#3](https://github.com/sefogi/asist_employed/issues/3)) — Núcleo legal del registro horario: pausas + auditoría inalterable + export (HU-04), horarios y cargas horarias (HU-05)
- [x] **Fase 5** ([#4](https://github.com/sefogi/asist_employed/issues/4)) — Incidencias y automatización: registro olvidado (HU-02), cierre automático de turno (HU-03), ausencias injustificadas + módulo de vacaciones/bajas (HU-01; email preparado para Fase 7)
- [x] **Fase 6** ([#5](https://github.com/sefogi/asist_employed/issues/5)) — Rediseño UX/UI (mobile-first, routing, sistema de diseño) + confirmación de acciones con hora de intención (HU-06)
- [ ] **Fase 7** ([#6](https://github.com/sefogi/asist_employed/issues/6)) — Hardening: HTTPS, backups automáticos (retención 4 años), rate-limiting
- [ ] **Fase 8** ([#7](https://github.com/sefogi/asist_employed/issues/7)) — Avanzadas: geolocalización RGPD (HU-07), modo kiosco PIN/QR (HU-08)

## Licencia

MIT — ver [LICENSE.MD](LICENSE.MD).
