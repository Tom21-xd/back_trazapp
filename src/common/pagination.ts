/**
 * Utilidades de paginación uniformes para todos los listados.
 *
 * Contrato de respuesta:
 *   { data: T[], meta: { total, page, limit, totalPages, hasNextPage, hasPrevPage } }
 *
 * Si `all` es true se devuelven todos los registros en una sola "página"
 * (necesario para selects / Kanban / datos de referencia) manteniendo el
 * mismo envelope para que el frontend no tenga que distinguir formatos.
 */

export interface PaginationQuery {
  page?: string | number;
  limit?: string | number;
  all?: string | boolean;
}

export interface ResolvedPagination {
  all: boolean;
  page: number;
  limit: number;
  skip: number;
  take: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function resolvePagination(q: PaginationQuery = {}): ResolvedPagination {
  const all = q.all === true || q.all === 'true';

  const page = Math.max(1, parseInt(String(q.page ?? 1), 10) || 1);
  const rawLimit = parseInt(String(q.limit ?? DEFAULT_LIMIT), 10);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.isNaN(rawLimit) ? DEFAULT_LIMIT : rawLimit),
  );

  return {
    all,
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
  };
}

export function buildPaginated<T>(
  data: T[],
  total: number,
  resolved: ResolvedPagination,
): PaginatedResult<T> {
  if (resolved.all) {
    return {
      data,
      meta: {
        total: data.length,
        page: 1,
        limit: data.length,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      },
    };
  }

  const totalPages = resolved.limit > 0 ? Math.ceil(total / resolved.limit) : 1;
  return {
    data,
    meta: {
      total,
      page: resolved.page,
      limit: resolved.limit,
      totalPages,
      hasNextPage: resolved.page < totalPages,
      hasPrevPage: resolved.page > 1,
    },
  };
}
