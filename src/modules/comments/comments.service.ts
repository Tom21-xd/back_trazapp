import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto, UpdateCommentDto } from './dto';
import { FILE_PUBLIC_SELECT } from '../../common/prisma/file-select';
import { hasAnyPermission } from '../../common/permissions';

interface AuthUser {
  id: string;
  permissions?: string[];
}
import {
  buildPaginated,
  resolvePagination,
  type PaginationQuery,
} from '../../common/pagination';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityEventsService } from '../activity-events/activity-events.service';

@Injectable()
export class CommentsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private events: ActivityEventsService,
  ) {}

  async create(dto: CreateCommentDto, userId: string) {
    // Verificar que la actividad existe
    const activity = await this.prisma.activity.findUnique({
      where: { id: dto.activityId },
    });

    if (!activity) {
      throw new NotFoundException('Actividad no encontrada');
    }

    const comment = await this.prisma.comment.create({
      data: {
        content: dto.content,
        user: { connect: { id: userId } },
        activity: { connect: { id: dto.activityId } },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        files: FILE_PUBLIC_SELECT,
      },
    });

    await this.notifications.newComment(
      dto.activityId,
      activity.title,
      userId,
    );

    await this.events.record({
      activityId: dto.activityId,
      type: 'COMMENT_ADDED',
      actorId: userId,
      commentId: comment.id,
      note: comment.content.slice(0, 200),
    });

    return comment;
  }

  async findByActivity(activityId: string, pagination: PaginationQuery = {}) {
    const include = {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
        },
      },
      files: FILE_PUBLIC_SELECT,
    };
    const resolved = resolvePagination(pagination);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where: { activityId },
        include,
        orderBy: { createdAt: 'desc' },
        ...(resolved.all
          ? {}
          : { skip: resolved.skip, take: resolved.take }),
      }),
      this.prisma.comment.count({ where: { activityId } }),
    ]);
    return buildPaginated(data, total, resolved);
  }

  async findOne(id: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        activity: {
          select: {
            id: true,
            title: true,
          },
        },
        files: FILE_PUBLIC_SELECT,
      },
    });

    if (!comment) {
      throw new NotFoundException('Comentario no encontrado');
    }

    return comment;
  }

  async update(id: string, dto: UpdateCommentDto, user: AuthUser) {
    const comment = await this.findOne(id);

    const isOwner = comment.userId === user.id;
    const allowed = isOwner
      ? hasAnyPermission(user.permissions, [
          'comment:update:own',
          'comment:update:any',
        ])
      : hasAnyPermission(user.permissions, ['comment:update:any']);
    if (!allowed) {
      throw new ForbiddenException(
        'No tienes permisos para editar este comentario',
      );
    }

    const updated = await this.prisma.comment.update({
      where: { id },
      data: { content: dto.content },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        files: FILE_PUBLIC_SELECT,
      },
    });

    return updated;
  }

  async remove(id: string, user: AuthUser) {
    const comment = await this.findOne(id);

    const isOwner = comment.userId === user.id;
    const allowed = isOwner
      ? hasAnyPermission(user.permissions, [
          'comment:delete:own',
          'comment:delete:any',
        ])
      : hasAnyPermission(user.permissions, ['comment:delete:any']);
    if (!allowed) {
      throw new ForbiddenException(
        'No tienes permisos para eliminar este comentario',
      );
    }

    await this.prisma.comment.delete({
      where: { id },
    });

    return { message: 'Comentario eliminado exitosamente' };
  }
}
