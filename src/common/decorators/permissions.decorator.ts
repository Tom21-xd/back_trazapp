import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'required_permissions';
export const ANY_PERMISSIONS_KEY = 'required_any_permissions';

/**
 * Exige que el usuario tenga TODOS los permisos indicados.
 * Ej: @RequirePermissions('project:create')
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Exige que el usuario tenga AL MENOS UNO de los permisos indicados.
 * Útil para lecturas con alcance: own/any.
 * Ej: @RequireAnyPermission('activity:read:own', 'activity:read:any')
 */
export const RequireAnyPermission = (...permissions: string[]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);
