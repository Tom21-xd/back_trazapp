import {
  Controller,
  Get,
  Logger,
  Patch,
  Param,
  Query,
  Sse,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Observable, merge, interval, map } from 'rxjs';
import { NotificationsService } from './notifications.service';
import { NotificationsStreamService } from './notifications-stream.service';
import { CurrentUser, Public } from '../../common/decorators';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

interface SseMessage {
  data: string;
  type?: string;
}

@ApiTags('notifications')
@ApiBearerAuth('JWT-auth')
@Controller('notifications')
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(
    private readonly service: NotificationsService,
    private readonly streamSvc: NotificationsStreamService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Mis notificaciones (paginado)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'all', required: false })
  @ApiQuery({ name: 'unread', required: false, description: 'true: solo no leídas' })
  @ApiResponse({ status: 200, description: 'Lista paginada de notificaciones' })
  findMine(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('all') all?: string,
    @Query('unread') unread?: string,
  ) {
    return this.service.findForUser(
      userId,
      { page, limit, all },
      unread === 'true',
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Cantidad de notificaciones no leídas' })
  @ApiResponse({ status: 200, description: '{ count }' })
  unreadCount(@CurrentUser('id') userId: string) {
    return this.service.unreadCount(userId);
  }

  /**
   * Server-Sent Events: el cliente abre esta conexión persistente y recibe
   * eventos en tiempo real cuando se crean notificaciones para él.
   *
   * EventSource no soporta headers personalizados, por eso aceptamos el token
   * vía query param (`?token=<jwt>`). El endpoint es público a nivel de guard
   * y verifica el token manualmente.
   */
  @Public()
  @Sse('stream')
  @ApiOperation({
    summary: 'Stream SSE en tiempo real (token vía ?token=)',
  })
  stream(@Query('token') token: string): Observable<SseMessage> {
    if (!token) {
      throw new UnauthorizedException('Falta token');
    }
    let userId: string;
    try {
      const payload = this.jwt.verify<JwtPayload>(token, {
        secret: this.config.get<string>('jwt.secret'),
      });
      userId = payload.sub;
    } catch {
      throw new UnauthorizedException('Token inválido');
    }

    const subject = this.streamSvc.register(userId);
    this.logger.log(
      `SSE conectado · user=${userId.slice(0, 8)} · activos=${this.streamSvc.activeConnections()}`,
    );

    // Heartbeat cada 25s: mantiene viva la conexión a través de reverse proxies
    // que cierran idle (típico nginx con proxy_read_timeout 60s).
    const heartbeat$ = interval(25_000).pipe(
      map(() => ({
        type: 'heartbeat',
        data: JSON.stringify({ type: 'heartbeat', at: Date.now() }),
      })),
    );

    const events$ = subject.asObservable().pipe(
      map((payload) => ({
        type: payload.type,
        data: JSON.stringify(payload),
      })),
    );

    return new Observable<SseMessage>((observer) => {
      // Mensaje inicial: cuenta actual de no leídas, para que el cliente sincronice
      void this.service.unreadCount(userId).then(({ count }) =>
        observer.next({
          type: 'unreadCount',
          data: JSON.stringify({ type: 'unreadCount', data: { count } }),
        }),
      );

      const sub = merge(events$, heartbeat$).subscribe({
        next: (msg) => observer.next(msg),
        error: (err) => observer.error(err),
      });

      return () => {
        sub.unsubscribe();
        this.streamSvc.unregister(userId, subject);
        this.logger.log(
          `SSE desconectado · user=${userId.slice(0, 8)} · activos=${this.streamSvc.activeConnections()}`,
        );
      };
    });
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Marcar todas como leídas' })
  @ApiResponse({ status: 200, description: 'Notificaciones actualizadas' })
  async markAllRead(@CurrentUser('id') userId: string) {
    const res = await this.service.markAllRead(userId);
    // Notifica a las pestañas abiertas del propio usuario
    this.streamSvc.broadcast([userId], {
      type: 'unreadCount',
      data: { count: 0 },
    });
    return res;
  }

  @Patch(':id/read')
  @ApiParam({ name: 'id', description: 'ID de la notificación' })
  @ApiOperation({ summary: 'Marcar una notificación como leída' })
  @ApiResponse({ status: 200, description: 'Notificación actualizada' })
  @ApiResponse({ status: 404, description: 'No encontrada' })
  async markRead(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    const res = await this.service.markRead(id, userId);
    // Refresca el badge en todas las pestañas
    const { count } = await this.service.unreadCount(userId);
    this.streamSvc.broadcast([userId], {
      type: 'unreadCount',
      data: { count },
    });
    return res;
  }
}
