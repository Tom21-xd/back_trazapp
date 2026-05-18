# back_trazapp — API (NestJS + Prisma + PostgreSQL)

API para gestión de proyectos, actividades, etapas (Kanban), comentarios,
adjuntos y solicitudes de cambio de etapa con aprobación.

## Requisitos

- Node.js 20+ (probado en 22)
- PostgreSQL 14+
- npm

## Puesta en marcha

```bash
# 1. Dependencias
npm install            # ejecuta automáticamente `prisma generate`

# 2. Variables de entorno
cp .env.example .env
#   - Edita DATABASE_URL con tu PostgreSQL
#   - Genera secretos JWT fuertes:
#     node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# 3. Base de datos (esquema reproducible vía migraciones)
npm run prisma:deploy  # aplica prisma/migrations a la BD
npm run db:seed        # datos iniciales (usuario admin, etapas, etc.)
#   atajo: npm run db:setup  (deploy + seed)

# 4. Levantar
npm run start:dev      # http://localhost:3000/api
```

Swagger: `http://localhost:3000/api/docs`

## Scripts útiles

| Script | Descripción |
|---|---|
| `npm run start:dev` | API en watch mode |
| `npm run build` | Compila a `dist/` |
| `npm test` | Tests unitarios (Jest) |
| `npm run prisma:migrate` | Crea/aplica migración en desarrollo |
| `npm run prisma:deploy` | Aplica migraciones (producción/CI) |
| `npm run prisma:studio` | GUI de la BD |
| `npm run db:seed` | Siembra datos |
| `npm run db:reset` | Reset + migraciones + seed |

## Variables de entorno

Ver `.env.example`. Resumen:

- `DATABASE_URL` — conexión PostgreSQL
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — mínimo 32 caracteres, **únicos**
- `JWT_EXPIRATION` (`1h`) / `JWT_REFRESH_EXPIRATION` (`7d`)
- `FRONTEND_URL` — origen permitido para CORS (def. `http://localhost:3001`)
- `UPLOAD_DIR` — carpeta de adjuntos en disco (def. `uploads`)
- `MAX_FILE_SIZE_MB` — tamaño máx. por archivo (def. `10`)
- `THROTTLE_TTL` / `THROTTLE_LIMIT` — rate limiting global

## Seguridad

- JWT con access + refresh tokens (rotación + limpieza de tokens caducados).
- Guards globales (autenticado por defecto; rutas públicas explícitas).
- `helmet`, rate limiting global y reforzado en `/auth/login` y `/auth/register`.
- Validación estricta de DTOs (`whitelist`, `forbidNonWhitelisted`, `@MaxLength`).
- Filtro de excepciones con logging y mapeo de errores Prisma (P2002/P2025/P2003).

## Adjuntos

Almacenamiento en disco local (`UPLOAD_DIR`, ignorado por git). Endpoints en
`/api/files`: subida multipart, descarga/preview protegida por token y borrado
(autor o admin). Un archivo se asocia a una actividad, comentario o
solicitud de cambio de etapa.
