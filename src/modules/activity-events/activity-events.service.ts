import { Injectable, Logger } from '@nestjs/common';
import { ActivityEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPaginated,
  resolvePagination,
  type PaginationQuery,
} from '../../common/pagination';

interface RecordParams {
  activityId: string;
  type: ActivityEventType;
  actorId: string;
  targetUserId?: string | null;
  fromStageId?: string | null;
  toStageId?: string | null;
  stageChangeRequestId?: string | null;
  commentId?: string | null;
  fileId?: string | null;
  note?: string;
  metadata?: Prisma.InputJsonValue;
}

const EVENT_INCLUDE = {
  actor: {
    select: { id: true, name: true, email: true, avatar: true },
  },
  targetUser: {
    select: { id: true, name: true, email: true, avatar: true },
  },
  fromStage: {
    select: { id: true, name: true, color: true },
  },
  toStage: {
    select: { id: true, name: true, color: true },
  },
  stageChangeRequest: {
    select: {
      id: true,
      status: true,
      description: true,
      reviewComment: true,
    },
  },
  comment: {
    select: { id: true, content: true },
  },
  file: {
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      size: true,
    },
  },
} as const;

@Injectable()
export class ActivityEventsService {
  private readonly logger = new Logger(ActivityEventsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Registra un evento en la timeline. Best-effort: nunca debe romper la operación
   * que lo invoca; los fallos se loguean y se ignoran.
   */
  async record(params: RecordParams): Promise<void> {
    try {
      await this.prisma.activityEvent.create({
        data: {
          activityId: params.activityId,
          type: params.type,
          actorId: params.actorId,
          targetUserId: params.targetUserId ?? null,
          fromStageId: params.fromStageId ?? null,
          toStageId: params.toStageId ?? null,
          stageChangeRequestId: params.stageChangeRequestId ?? null,
          commentId: params.commentId ?? null,
          fileId: params.fileId ?? null,
          note: params.note,
          metadata: params.metadata,
        },
      });
    } catch (err) {
      this.logger.error(
        `No se pudo registrar evento ${params.type} en actividad ${params.activityId}: ${
          (err as Error).message
        }`,
      );
    }
  }

  /** Lista los eventos de una actividad (más recientes primero por defecto). */
  async list(activityId: string, pagination: PaginationQuery = {}) {
    const resolved = resolvePagination(pagination);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.activityEvent.findMany({
        where: { activityId },
        include: EVENT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        ...(resolved.all ? {} : { skip: resolved.skip, take: resolved.take }),
      }),
      this.prisma.activityEvent.count({ where: { activityId } }),
    ]);
    return buildPaginated(data, total, resolved);
  }
}
