/**
 * Catálogo central de permisos. Modelo ATÓMICO: 1 acción = 1 permiso.
 * Donde aplica, se distingue el alcance:
 *   - `:own`  -> sobre lo propio / asignado al usuario
 *   - `:any`  -> sobre cualquier registro de esa entidad
 * El comodín "*" otorga todos los permisos (rol Administrador del sistema).
 * Las lecturas de datos de referencia (etapas, etiquetas, tipos) NO requieren permiso.
 */
export const PERMISSIONS = [
  // Proyectos
  { key: 'project:read', group: 'Proyectos', description: 'Ver proyectos' },
  { key: 'project:create', group: 'Proyectos', description: 'Crear proyectos' },
  { key: 'project:update', group: 'Proyectos', description: 'Editar proyectos' },
  { key: 'project:delete', group: 'Proyectos', description: 'Eliminar proyectos' },
  // Actividades
  { key: 'activity:read:own', group: 'Actividades', description: 'Ver mis actividades asignadas' },
  { key: 'activity:read:any', group: 'Actividades', description: 'Ver todas las actividades' },
  { key: 'activity:create', group: 'Actividades', description: 'Crear actividades' },
  { key: 'activity:update', group: 'Actividades', description: 'Editar actividades' },
  { key: 'activity:delete', group: 'Actividades', description: 'Eliminar actividades' },
  { key: 'activity:assign', group: 'Actividades', description: 'Asignar/desasignar usuarios' },
  // Etapas
  { key: 'stage:create', group: 'Etapas', description: 'Crear etapas' },
  { key: 'stage:update', group: 'Etapas', description: 'Editar etapas' },
  { key: 'stage:reorder', group: 'Etapas', description: 'Reordenar etapas' },
  { key: 'stage:delete', group: 'Etapas', description: 'Eliminar etapas' },
  // Etiquetas
  { key: 'tag:create', group: 'Etiquetas', description: 'Crear etiquetas' },
  { key: 'tag:update', group: 'Etiquetas', description: 'Editar etiquetas' },
  { key: 'tag:delete', group: 'Etiquetas', description: 'Eliminar etiquetas' },
  // Tipos de proyecto
  { key: 'projectType:create', group: 'Tipos de proyecto', description: 'Crear tipos de proyecto' },
  { key: 'projectType:update', group: 'Tipos de proyecto', description: 'Editar tipos de proyecto' },
  { key: 'projectType:delete', group: 'Tipos de proyecto', description: 'Eliminar tipos de proyecto' },
  // Usuarios
  { key: 'user:read', group: 'Usuarios', description: 'Ver el listado de usuarios' },
  { key: 'user:create', group: 'Usuarios', description: 'Crear usuarios' },
  { key: 'user:update', group: 'Usuarios', description: 'Editar datos de usuarios' },
  { key: 'user:activate', group: 'Usuarios', description: 'Activar / desactivar usuarios' },
  { key: 'user:delete', group: 'Usuarios', description: 'Eliminar usuarios' },
  // Comentarios
  { key: 'comment:create', group: 'Comentarios', description: 'Comentar en actividades' },
  { key: 'comment:update:own', group: 'Comentarios', description: 'Editar mis comentarios' },
  { key: 'comment:delete:own', group: 'Comentarios', description: 'Eliminar mis comentarios' },
  { key: 'comment:update:any', group: 'Comentarios', description: 'Editar comentarios de otros' },
  { key: 'comment:delete:any', group: 'Comentarios', description: 'Eliminar comentarios de otros' },
  // Archivos
  { key: 'file:upload', group: 'Archivos', description: 'Subir archivos adjuntos' },
  { key: 'file:delete:own', group: 'Archivos', description: 'Eliminar mis archivos' },
  { key: 'file:delete:any', group: 'Archivos', description: 'Eliminar archivos de otros' },
  { key: 'file:read:any', group: 'Archivos', description: 'Ver/descargar archivos de cualquier actividad' },
  // Solicitudes de cambio de etapa
  { key: 'stagechange:read:own', group: 'Solicitudes', description: 'Ver mis solicitudes de cambio' },
  { key: 'stagechange:read:any', group: 'Solicitudes', description: 'Ver todas las solicitudes (cola pendientes)' },
  { key: 'stagechange:create', group: 'Solicitudes', description: 'Solicitar cambio de etapa' },
  { key: 'stagechange:comment', group: 'Solicitudes', description: 'Comentar en solicitudes' },
  { key: 'stagechange:review', group: 'Solicitudes', description: 'Aprobar/rechazar solicitudes' },
  { key: 'stagechange:manage:any', group: 'Solicitudes', description: 'Gestionar solicitudes de cualquier actividad (no solo asignadas)' },
  // Auditoría
  { key: 'audit:read', group: 'Auditoría', description: 'Ver el registro de auditoría' },
  // Roles y permisos
  { key: 'role:read', group: 'Roles y permisos', description: 'Ver roles y permisos' },
  { key: 'role:create', group: 'Roles y permisos', description: 'Crear roles' },
  { key: 'role:update', group: 'Roles y permisos', description: 'Editar roles y sus permisos' },
  { key: 'role:delete', group: 'Roles y permisos', description: 'Eliminar roles' },
  { key: 'role:assign', group: 'Roles y permisos', description: 'Asignar un rol a un usuario' },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

export const ALL_PERMISSION_KEYS: string[] = PERMISSIONS.map((p) => p.key);

export const WILDCARD = '*';

/** ¿El conjunto de permisos del usuario satisface TODOS los requeridos? */
export function hasPermissions(
  userPermissions: string[] | undefined,
  required: string[],
): boolean {
  if (!userPermissions || userPermissions.length === 0) return false;
  if (userPermissions.includes(WILDCARD)) return true;
  return required.every((r) => userPermissions.includes(r));
}

/** ¿El usuario tiene AL MENOS UNO de los permisos requeridos? */
export function hasAnyPermission(
  userPermissions: string[] | undefined,
  required: string[],
): boolean {
  if (!userPermissions || userPermissions.length === 0) return false;
  if (userPermissions.includes(WILDCARD)) return true;
  return required.some((r) => userPermissions.includes(r));
}
