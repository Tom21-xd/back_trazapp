import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditAction } from '@prisma/client';
import { AuditService } from './audit.service';

// Mapea el primer segmento de la ruta a un nombre de entidad legible
const ENTITY_MAP: Record<string, string> = {
  projects: 'Project',
  activities: 'Activity',
  stages: 'Stage',
  tags: 'Tag',
  users: 'User',
  comments: 'Comment',
  'stage-changes': 'StageChangeRequest',
  'project-types': 'ProjectType',
  files: 'File',
  auth: 'Auth',
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const method: string = req.method;

    // Solo mutaciones de usuarios autenticados
    if (method === 'GET' || method === 'OPTIONS' || method === 'HEAD') {
      return next.handle();
    }

    return next.handle().pipe(
      tap((response) => {
        const user = req.user;
        if (!user?.id) return;

        const path: string = (req.originalUrl || req.url || '').split('?')[0];
        const segments = path.replace(/^\/api\//, '').split('/');
        const base = segments[0] || 'unknown';
        const entityType = ENTITY_MAP[base] || base;

        let action: AuditAction;
        if (base === 'auth' && path.includes('/login'))
          action = AuditAction.LOGIN;
        else if (base === 'auth' && path.includes('/logout'))
          action = AuditAction.LOGOUT;
        else if (base === 'stage-changes' && method === 'POST' && path.endsWith('stage-changes'))
          action = AuditAction.STAGE_CHANGE_REQUEST;
        else if (base === 'stage-changes' && path.includes('/review'))
          action = AuditAction.UPDATE;
        else if (method === 'POST') action = AuditAction.CREATE;
        else if (method === 'PATCH' || method === 'PUT')
          action = AuditAction.UPDATE;
        else if (method === 'DELETE') action = AuditAction.DELETE;
        else return;

        const resp = response as { id?: string } | undefined;
        const entityId =
          req.params?.id || (resp && resp.id) || segments[1] || '-';

        void this.audit.record({
          userId: user.id,
          action,
          entityType,
          entityId: String(entityId),
          ipAddress:
            (req.headers?.['x-forwarded-for'] as string) ||
            req.ip ||
            req.socket?.remoteAddress,
          userAgent: req.headers?.['user-agent'],
        });
      }),
    );
  }
}
