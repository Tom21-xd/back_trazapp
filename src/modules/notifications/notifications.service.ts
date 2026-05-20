import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { EmailService } from '../email/email.service';
import {
  buildPaginated,
  resolvePagination,
  type PaginationQuery,
} from '../../common/pagination';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private push: PushService,
    private email: EmailService,
    private config: ConfigService,
  ) {}

  // ---------- Lectura (usuario actual) ----------

  async findForUser(
    userId: string,
    pagination: PaginationQuery = {},
    onlyUnread = false,
  ) {
    const where = { userId, ...(onlyUnread ? { isRead: false } : {}) };
    const resolved = resolvePagination(pagination);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...(resolved.all
          ? {}
          : { skip: resolved.skip, take: resolved.take }),
      }),
      this.prisma.notification.count({ where }),
    ]);
    return buildPaginated(data, total, resolved);
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  async markRead(id: string, userId: string) {
    const notif = await this.prisma.notification.findUnique({ where: { id } });
    if (!notif || notif.userId !== userId) {
      throw new NotFoundException('Notificación no encontrada');
    }
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { message: 'Todas las notificaciones marcadas como leídas' };
  }

  // ---------- Emisión (best-effort: nunca rompe el flujo de negocio) ----------

  private async emit(
    userIds: string[],
    type: NotificationType,
    title: string,
    message: string,
    metadata?: Record<string, unknown>,
  ) {
    const targets = [...new Set(userIds)].filter(Boolean);
    if (targets.length === 0) return;
    try {
      await this.prisma.notification.createMany({
        data: targets.map((userId) => ({
          userId,
          type,
          title,
          message,
          metadata: metadata as object,
        })),
      });
    } catch (err) {
      this.logger.error(
        `No se pudo emitir notificación (${type}): ${(err as Error).message}`,
      );
    }

    // Push + Email en paralelo (best-effort, ninguno bloquea al otro)
    const activityId =
      (metadata as { activityId?: string } | undefined)?.activityId;
    const frontendUrl = this.config.get<string>('frontendUrl') ?? '';
    const url = activityId
      ? `${frontendUrl}/activities/${activityId}`
      : `${frontendUrl}/dashboard`;

    void this.push
      .sendToUsers(targets, { title, body: message, url })
      .catch((err) =>
        this.logger.warn(
          `No se pudo enviar push (${type}): ${(err as Error).message}`,
        ),
      );
    void this.email
      .sendToUsers(targets, { subject: title, message, url })
      .catch((err) =>
        this.logger.warn(
          `No se pudo enviar email (${type}): ${(err as Error).message}`,
        ),
      );
  }

  /** Usuarios que pueden revisar solicitudes (permiso stagechange:review). */
  private async adminIds(): Promise<string[]> {
    try {
      const reviewers = await this.prisma.user.findMany({
        where: {
          isActive: true,
          appRole: {
            permissions: {
              some: { permission: { key: 'stagechange:review' } },
            },
          },
        },
        select: { id: true },
      });
      return reviewers.map((a) => a.id);
    } catch {
      return [];
    }
  }

  async activityAssigned(
    activityId: string,
    activityTitle: string,
    userIds: string[],
    excludeUserId?: string,
  ) {
    await this.emit(
      userIds.filter((id) => id !== excludeUserId),
      NotificationType.ACTIVIDAD_ASIGNADA,
      'Nueva actividad asignada',
      `Se te asignó la actividad "${activityTitle}"`,
      { activityId },
    );
  }

  async activityUnassigned(
    activityId: string,
    activityTitle: string,
    userIds: string[],
    excludeUserId?: string,
  ) {
    await this.emit(
      userIds.filter((id) => id !== excludeUserId),
      NotificationType.ACTIVIDAD_DESASIGNADA,
      'Te retiraron de una actividad',
      `Ya no estás asignado a "${activityTitle}"`,
      { activityId },
    );
  }

  async stageChanged(
    activityId: string,
    activityTitle: string,
    newStageName: string,
    assigneeIds: string[],
    actorId?: string,
  ) {
    await this.emit(
      assigneeIds.filter((id) => id !== actorId),
      NotificationType.CAMBIO_ETAPA,
      'Cambio de etapa',
      `"${activityTitle}" ahora está en ${newStageName}`,
      { activityId },
    );
  }

  async stageChangeRequested(
    activityId: string,
    activityTitle: string,
    requesterName: string,
  ) {
    await this.emit(
      await this.adminIds(),
      NotificationType.SOLICITUD_CAMBIO_ETAPA,
      'Solicitud de cambio de etapa',
      `${requesterName} solicitó un cambio de etapa en "${activityTitle}"`,
      { activityId },
    );
  }

  async stageChangeReviewed(
    requesterId: string,
    activityId: string,
    activityTitle: string,
    approved: boolean,
    comment?: string,
  ) {
    await this.emit(
      [requesterId],
      approved
        ? NotificationType.CAMBIO_ETAPA_APROBADO
        : NotificationType.CAMBIO_ETAPA_RECHAZADO,
      approved ? 'Cambio de etapa aprobado' : 'Cambio de etapa rechazado',
      `Tu solicitud en "${activityTitle}" fue ${
        approved ? 'aprobada' : 'rechazada'
      }${comment ? `: ${comment}` : ''}`,
      { activityId },
    );
  }

  async newComment(
    activityId: string,
    activityTitle: string,
    authorId: string,
  ) {
    try {
      const assignments = await this.prisma.activityAssignment.findMany({
        where: { activityId },
        select: { userId: true },
      });
      await this.emit(
        assignments.map((a) => a.userId).filter((id) => id !== authorId),
        NotificationType.NUEVO_COMENTARIO,
        'Nuevo comentario',
        `Hay un nuevo comentario en "${activityTitle}"`,
        { activityId },
      );
    } catch (err) {
      this.logger.error(
        `No se pudo notificar comentario: ${(err as Error).message}`,
      );
    }
  }
}
