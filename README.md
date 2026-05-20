# back_trazapp — API

API REST de **TrazApp** construida con **NestJS + Prisma + PostgreSQL**.
Gestión de proyectos, actividades, etapas (Kanban), comentarios, adjuntos,
solicitudes de cambio de etapa, notificaciones y auditoría, con
**autorización 100 % por permisos** (RBAC granular configurable).

> Parte del monorepo TrazApp. Visión general y modelo de roles/permisos en el
> [README raíz](../README.md).

## Requisitos

- Node.js 20+ (probado en 22)
- PostgreSQL 14+
- npm

## Puesta en marcha

```bash
# 1. Dependencias (ver nota sobre --legacy-peer-deps abajo)
npm install --legacy-peer-deps     # ejecuta `prisma generate` (postinstall)

# 2. Variables de entorno
cp .env.example .env
#   - DATABASE_URL: tu conexión PostgreSQL
#   - Secretos JWT fuertes y únicos (>=32 chars):
#     node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# 3. Base de datos
npm run prisma:deploy   # aplica prisma/migrations
npm run prisma:generate # cliente Prisma (hazlo con el server detenido)
npm run db:seed         # permisos + 3 roles + admin + etapas/etiquetas
#   atajo dev: npm run db:reset   (dropea + migra + siembra)

# 4. Levantar
npm run start:dev       # http://localhost:3000/api
```

- API: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/api/docs`
- Admin inicial: `admin@trazapp.com` / `admin123`

## Scripts

| Script | Descripción |
|--------|-------------|
| `npm run start:dev` | API en watch mode |
| `npm run build` | Compila a `dist/` |
| `npm test` | Tests unitarios (Jest) — 11 suites / 97 tests |
| `npm run prisma:migrate` | Crear/aplicar migración (desarrollo) |
| `npm run prisma:deploy` | Aplicar migraciones (producción/CI) |
| `npm run prisma:generate` | Regenerar cliente Prisma |
| `npm run prisma:studio` | GUI de la base de datos |
| `npm run db:seed` | Sembrar permisos, roles y datos base |
| `npm run db:reset` | Reset + migraciones + seed (desarrollo) |

## Variables de entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Conexión PostgreSQL | — |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Secretos (>=32 chars, **únicos**) | — |
| `JWT_EXPIRATION` / `JWT_REFRESH_EXPIRATION` | Vigencia tokens | `1h` / `7d` |
| `FRONTEND_URL` | Origen permitido (CORS) | `http://localhost:3001` |
| `UPLOAD_DIR` | Carpeta de adjuntos (ignorada por git) | `uploads` |
| `MAX_FILE_SIZE_MB` | Tamaño máx. por archivo | `10` |
| `THROTTLE_TTL` / `THROTTLE_LIMIT` | Rate limiting global (s / nº) | `60` / `120` |

## Módulos

| Módulo | Base | Notas |
|--------|------|-------|
| `auth` | `/auth` | login, register, refresh, logout, me |
| `users` | `/users` | CRUD (paginado) |
| `roles` | `/roles` | Roles + catálogo de permisos + asignación a usuario |
| `projects` | `/projects` | CRUD + `/:id/stats` |
| `project-types` | `/project-types` | Tipos de proyecto |
| `activities` | `/activities` | CRUD, `my-activities`, asignación |
| `stages` | `/stages` | Etapas + `reorder` |
| `tags` | `/tags` | Etiquetas |
| `stage-changes` | `/stage-changes` | Solicitudes: crear, `pending`, `my-requests`, `review`, comentarios |
| `comments` | `/comments` | Comentarios por actividad |
| `files` | `/files` | Subida/descarga/borrado de adjuntos |
| `notifications` | `/notifications` | Lista, no leídas, marcar leídas |
| `audit` | `/audit` | Registro de auditoría (`audit:read`) |

Todos los listados devuelven `{ data, meta }` (paginado). `?all=true`
devuelve el conjunto completo en el mismo envelope (selects / Kanban).

## Autorización (RBAC granular)

- **Guards globales** (orden): `ThrottlerGuard` → `JwtAuthGuard`
  (autenticado por defecto; `@Public()` exime) → `PermissionsGuard`.
- Las rutas mutadoras declaran `@RequirePermissions('clave')`. Los permisos
  del usuario se resuelven **por petición** desde su rol
  (`AppRole` → `RolePermission` → `Permission`) en `JwtStrategy.validate`.
- Reglas finas a nivel de servicio (ortogonales al permiso):
  - **Comentarios**: editar/eliminar = autor o `content:moderate`.
  - **Solicitudes**: crear/comentar sobre actividades **asignadas** o
    con `content:moderate`.
  - **Archivos**: acceso por relación a la actividad (asignado) o
    `content:moderate`; borrar = quien subió o `content:moderate`.
- Catálogo: `src/common/permissions.ts`. Modelo y roles del sistema:
  ver [README raíz](../README.md#modelo-de-autorización-rbac-granular).

## Seguridad

- JWT access + refresh (rotación; limpieza de tokens caducados/revocados).
- `helmet`; rate limiting global y reforzado en `/auth/login` y `/auth/register`.
- Validación estricta de DTOs (`whitelist`, `forbidNonWhitelisted`, `@MaxLength`).
- Filtro de excepciones con logging y mapeo de errores Prisma:
  P2002 → 409, P2025 → 404, P2003 → 400, **P2021/P2022 → 500 con aviso de
  esquema desincronizado**, error de conexión → 503. En desarrollo se incluye
  el detalle Prisma para diagnóstico.
- Auditoría automática de mutaciones (interceptor global).

## Migraciones

`prisma/migrations`:

1. `…_init` — esquema base.
2. `…_rbac_granular` — `app_roles`, `permissions`, `role_permissions`,
   `users.appRoleId`.
3. `…_drop_legacy_role` — **elimina** la columna/enum `role` legacy
   (destructiva; el seed reasigna roles).

> Si ves *"La base de datos no está sincronizada con el esquema [P2022]"* en
> login u otra ruta, faltan migraciones: `npm run db:reset` (dev) o
> `npm run prisma:deploy` (prod).

## Adjuntos

Disco local (`UPLOAD_DIR`). `/api/files`: subida `multipart/form-data`,
descarga/preview autenticada por token, borrado (autor o `content:moderate`).
Un archivo pertenece a una actividad, comentario o solicitud.

## Notas

- **`--legacy-peer-deps`**: el árbol combina `@nestjs/swagger@11` con
  `@nestjs/common` 10/11; npm exige la bandera. No afecta el runtime.
- Si `prisma generate` falla por `EPERM` en Windows, detené el dev server
  (mantiene bloqueado el query engine) y reintentá.
