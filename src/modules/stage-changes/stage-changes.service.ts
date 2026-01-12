import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateStageChangeRequestDto,
  ReviewStageChangeDto,
  AddCommentDto,
} from './dto';
import { Role, StageChangeStatus } from '@prisma/client';

@Injectable()
export class StageChangesService {
  constructor(private prisma: PrismaService) {}

  async createRequest(dto: CreateStageChangeRequestDto, userId: string) {
    // Verificar que la actividad existe
    const activity = await this.prisma.activity.findUnique({
      where: { id: dto.activityId },
      include: {
        currentStage: true,
      },
    });

    if (!activity) {
      throw new NotFoundException('Actividad no encontrada');
    }

    // Verificar que la etapa destino existe
    const toStage = await this.prisma.stage.findUnique({
      where: { id: dto.toStageId },
    });

    if (!toStage) {
      throw new NotFoundException('Etapa destino no encontrada');
    }

    // No se puede solicitar cambio a la misma etapa
    if (activity.currentStageId === dto.toStageId) {
      throw new BadRequestException(
        'La actividad ya está en la etapa solicitada',
      );
    }

    const request = await this.prisma.stageChangeRequest.create({
      data: {
        description: dto.description,
        activity: { connect: { id: dto.activityId } },
        fromStage: { connect: { id: activity.currentStageId } },
        toStage: { connect: { id: dto.toStageId } },
        requestedBy: { connect: { id: userId } },
      },
      include: this.getIncludeOptions(),
    });

    return request;
  }

  async findAll(filters?: { activityId?: string; status?: StageChangeStatus }) {
    const where: any = {};

    if (filters?.activityId) where.activityId = filters.activityId;
    if (filters?.status) where.status = filters.status;

    return this.prisma.stageChangeRequest.findMany({
      where,
      include: this.getIncludeOptions(),
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const request = await this.prisma.stageChangeRequest.findUnique({
      where: { id },
      include: {
        ...this.getIncludeOptions(),
        comments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
                role: true,
              },
            },
            files: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Solicitud no encontrada');
    }

    return request;
  }

  async reviewRequest(
    id: string,
    dto: ReviewStageChangeDto,
    reviewerId: string,
  ) {
    const request = await this.findOne(id);

    if (request.status !== StageChangeStatus.PENDIENTE) {
      throw new BadRequestException('La solicitud ya fue revisada');
    }

    // Si se aprueba, actualizar la etapa de la actividad
    if (dto.status === StageChangeStatus.APROBADO) {
      // Cerrar etapa actual en historial
      const currentHistory = await this.prisma.activityStageHistory.findFirst({
        where: {
          activityId: request.activityId,
          exitedAt: null,
        },
      });

      if (currentHistory) {
        await this.prisma.activityStageHistory.update({
          where: { id: currentHistory.id },
          data: { exitedAt: new Date() },
        });
      }

      // Actualizar actividad y crear nuevo registro en historial
      await this.prisma.activity.update({
        where: { id: request.activityId },
        data: {
          currentStageId: request.toStageId,
          stageHistory: {
            create: {
              stageId: request.toStageId,
              notes: `Cambio aprobado: ${dto.reviewComment || 'Sin comentarios'}`,
            },
          },
        },
      });
    }

    const updated = await this.prisma.stageChangeRequest.update({
      where: { id },
      data: {
        status: dto.status,
        reviewComment: dto.reviewComment,
        reviewedAt: new Date(),
        reviewedBy: { connect: { id: reviewerId } },
      },
      include: this.getIncludeOptions(),
    });

    return updated;
  }

  async addComment(
    requestId: string,
    dto: AddCommentDto,
    userId: string,
  ) {
    await this.findOne(requestId);

    const comment = await this.prisma.stageChangeComment.create({
      data: {
        content: dto.content,
        user: { connect: { id: userId } },
        stageChangeRequest: { connect: { id: requestId } },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
          },
        },
      },
    });

    return comment;
  }

  async getPendingRequests() {
    return this.findAll({ status: StageChangeStatus.PENDIENTE });
  }

  async getMyRequests(userId: string) {
    return this.prisma.stageChangeRequest.findMany({
      where: { requestedById: userId },
      include: this.getIncludeOptions(),
      orderBy: { createdAt: 'desc' },
    });
  }

  private getIncludeOptions() {
    return {
      activity: {
        select: {
          id: true,
          title: true,
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      fromStage: true,
      toStage: true,
      requestedBy: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
        },
      },
      reviewedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      files: true,
      _count: {
        select: {
          comments: true,
        },
      },
    };
  }
}
