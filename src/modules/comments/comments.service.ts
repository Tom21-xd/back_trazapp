import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto, UpdateCommentDto } from './dto';
import { Role } from '@prisma/client';

@Injectable()
export class CommentsService {
  constructor(private prisma: PrismaService) {}

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
            role: true,
          },
        },
        files: true,
      },
    });

    return comment;
  }

  async findByActivity(activityId: string) {
    return this.prisma.comment.findMany({
      where: { activityId },
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
      orderBy: { createdAt: 'desc' },
    });
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
            role: true,
          },
        },
        activity: {
          select: {
            id: true,
            title: true,
          },
        },
        files: true,
      },
    });

    if (!comment) {
      throw new NotFoundException('Comentario no encontrado');
    }

    return comment;
  }

  async update(
    id: string,
    dto: UpdateCommentDto,
    userId: string,
    userRole: Role,
  ) {
    const comment = await this.findOne(id);

    // Solo el autor o admin pueden editar
    if (comment.userId !== userId && userRole !== Role.ADMIN) {
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
            role: true,
          },
        },
        files: true,
      },
    });

    return updated;
  }

  async remove(id: string, userId: string, userRole: Role) {
    const comment = await this.findOne(id);

    // Solo el autor o admin pueden eliminar
    if (comment.userId !== userId && userRole !== Role.ADMIN) {
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
