import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../../common/decorators';

@ApiTags('notifications')
@ApiBearerAuth('JWT-auth')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

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

  @Patch('read-all')
  @ApiOperation({ summary: 'Marcar todas como leídas' })
  @ApiResponse({ status: 200, description: 'Notificaciones actualizadas' })
  markAllRead(@CurrentUser('id') userId: string) {
    return this.service.markAllRead(userId);
  }

  @Patch(':id/read')
  @ApiParam({ name: 'id', description: 'ID de la notificación' })
  @ApiOperation({ summary: 'Marcar una notificación como leída' })
  @ApiResponse({ status: 200, description: 'Notificación actualizada' })
  @ApiResponse({ status: 404, description: 'No encontrada' })
  markRead(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.markRead(id, userId);
  }
}
