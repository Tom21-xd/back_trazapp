import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, ANY_PERMISSIONS_KEY } from '../decorators';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { hasPermissions, hasAnyPermission } from '../permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredAny = this.reflector.getAllAndOverride<string[]>(
      ANY_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Sin decoradores de permiso => basta con estar autenticado
    if (
      (!required || required.length === 0) &&
      (!requiredAny || requiredAny.length === 0)
    ) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (
      required &&
      required.length > 0 &&
      !hasPermissions(user?.permissions, required)
    ) {
      throw new ForbiddenException(
        'No tienes permisos suficientes para esta acción',
      );
    }

    if (
      requiredAny &&
      requiredAny.length > 0 &&
      !hasAnyPermission(user?.permissions, requiredAny)
    ) {
      throw new ForbiddenException(
        'No tienes permisos suficientes para esta acción',
      );
    }
    return true;
  }
}
