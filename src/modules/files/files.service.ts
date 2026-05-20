import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import { extname, join, resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { UploadFileDto } from './dto';
import { hasAnyPermission } from '../../common/permissions';
import { ActivityEventsService } from '../activity-events/activity-events.service';

interface AuthUser {
  id: string;
  permissions?: string[];
}

// Allowlist de tipos permitidos (imágenes y documentos).
const ALLOWED_MIME = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
]);

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly uploadDir: string;
  private readonly maxFileSize: number;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private events: ActivityEventsService,
  ) {
    const dir = this.config.get<string>('upload.dir') || 'uploads';
    this.uploadDir = resolve(process.cwd(), dir);
    const maxMb = Number(this.config.get('upload.maxFileSizeMb')) || 10;
    this.maxFileSize = maxMb * 1024 * 1024;
  }

  private async ensureDir() {
    await fs.mkdir(this.uploadDir, { recursive: true });
  }

  /** Devuelve el id de la actividad "raíz" del destino indicado y valida que exista. */
  private async resolveActivityId(dto: UploadFileDto): Promise<string> {
    const targets = [
      dto.activityId,
      dto.commentId,
      dto.stageChangeRequestId,
      dto.stageChangeCommentId,
    ].filter(Boolean);

    if (targets.length !== 1) {
      throw new BadRequestException(
        'Debes adjuntar el archivo a exactamente un destino (actividad, comentario o solicitud).',
      );
    }

    if (dto.activityId) {
      const activity = await this.prisma.activity.findUnique({
        where: { id: dto.activityId },
        select: { id: true },
      });
      if (!activity) throw new NotFoundException('Actividad no encontrada');
      return activity.id;
    }

    if (dto.commentId) {
      const comment = await this.prisma.comment.findUnique({
        where: { id: dto.commentId },
        select: { activityId: true },
      });
      if (!comment) throw new NotFoundException('Comentario no encontrado');
      return comment.activityId;
    }

    if (dto.stageChangeRequestId) {
      const req = await this.prisma.stageChangeRequest.findUnique({
        where: { id: dto.stageChangeRequestId },
        select: { activityId: true },
      });
      if (!req) throw new NotFoundException('Solicitud no encontrada');
      return req.activityId;
    }

    const scComment = await this.prisma.stageChangeComment.findUnique({
      where: { id: dto.stageChangeCommentId },
      select: { stageChangeRequest: { select: { activityId: true } } },
    });
    if (!scComment) throw new NotFoundException('Comentario no encontrado');
    return scComment.stageChangeRequest.activityId;
  }

  /** 'file:read:any' accede a cualquier actividad; si no, debe estar asignado. */
  private async assertCanAccessActivity(activityId: string, user: AuthUser) {
    if (hasAnyPermission(user.permissions, ['file:read:any'])) return;

    const assignment = await this.prisma.activityAssignment.findFirst({
      where: { activityId, userId: user.id },
      select: { id: true },
    });

    if (!assignment) {
      throw new ForbiddenException(
        'No tienes permisos sobre esta actividad',
      );
    }
  }

  async upload(
    file: Express.Multer.File,
    dto: UploadFileDto,
    user: AuthUser,
  ) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    if (file.size > this.maxFileSize) {
      throw new BadRequestException(
        `El archivo supera el tamaño máximo permitido (${
          this.maxFileSize / (1024 * 1024)
        } MB)`,
      );
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(
        `Tipo de archivo no permitido: ${file.mimetype}`,
      );
    }

    const activityId = await this.resolveActivityId(dto);
    await this.assertCanAccessActivity(activityId, user);

    await this.ensureDir();

    const ext = extname(file.originalname).slice(0, 16);
    const storedName = `${randomUUID()}${ext}`;
    const absolutePath = join(this.uploadDir, storedName);

    await fs.writeFile(absolutePath, file.buffer);

    try {
      const record = await this.prisma.file.create({
        data: {
          originalName: file.originalname,
          storedName,
          mimeType: file.mimetype,
          size: file.size,
          path: storedName,
          uploadedById: user.id,
          activityId: dto.activityId ?? null,
          commentId: dto.commentId ?? null,
          stageChangeRequestId: dto.stageChangeRequestId ?? null,
          stageChangeCommentId: dto.stageChangeCommentId ?? null,
        },
      });
      await this.events.record({
        activityId,
        type: 'FILE_UPLOADED',
        actorId: user.id,
        fileId: record.id,
        note: record.originalName,
        metadata: {
          mimeType: record.mimeType,
          size: record.size,
          targetType: dto.commentId
            ? 'comment'
            : dto.stageChangeRequestId
              ? 'stageChangeRequest'
              : dto.stageChangeCommentId
                ? 'stageChangeComment'
                : 'activity',
        },
      });
      return this.serialize(record);
    } catch (err) {
      // Si la fila no se pudo crear, no dejamos el archivo huérfano en disco
      await fs.unlink(absolutePath).catch(() => undefined);
      this.logger.error(
        `Error guardando metadatos de archivo: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async findOneEntity(id: string) {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('Archivo no encontrado');
    return file;
  }

  /** Para descarga: valida permisos y devuelve metadatos + ruta absoluta. */
  async getForDownload(id: string, user: AuthUser) {
    const file = await this.findOneEntity(id);
    const activityId = await this.resolveActivityId({
      activityId: file.activityId ?? undefined,
      commentId: file.commentId ?? undefined,
      stageChangeRequestId: file.stageChangeRequestId ?? undefined,
      stageChangeCommentId: file.stageChangeCommentId ?? undefined,
    });
    await this.assertCanAccessActivity(activityId, user);

    const absolutePath = join(this.uploadDir, file.storedName);
    try {
      await fs.access(absolutePath);
    } catch {
      throw new NotFoundException('El archivo ya no existe en el servidor');
    }
    return { file, absolutePath };
  }

  async listByTarget(dto: UploadFileDto, user: AuthUser) {
    const activityId = await this.resolveActivityId(dto);
    await this.assertCanAccessActivity(activityId, user);

    const where: any = {};
    if (dto.activityId) where.activityId = dto.activityId;
    if (dto.commentId) where.commentId = dto.commentId;
    if (dto.stageChangeRequestId)
      where.stageChangeRequestId = dto.stageChangeRequestId;
    if (dto.stageChangeCommentId)
      where.stageChangeCommentId = dto.stageChangeCommentId;

    const files = await this.prisma.file.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });
    return files.map((f) => this.serialize(f));
  }

  async remove(id: string, user: AuthUser) {
    const file = await this.findOneEntity(id);

    const isOwner = file.uploadedById === user.id;
    const allowed = isOwner
      ? hasAnyPermission(user.permissions, [
          'file:delete:own',
          'file:delete:any',
        ])
      : hasAnyPermission(user.permissions, ['file:delete:any']);
    if (!allowed) {
      throw new ForbiddenException(
        'No tienes permisos para eliminar este archivo',
      );
    }

    // Resolvemos el activityId raíz ANTES de borrar para no perder la FK
    let activityId: string | null = null;
    try {
      activityId = await this.resolveActivityId({
        activityId: file.activityId ?? undefined,
        commentId: file.commentId ?? undefined,
        stageChangeRequestId: file.stageChangeRequestId ?? undefined,
        stageChangeCommentId: file.stageChangeCommentId ?? undefined,
      });
    } catch {
      activityId = null;
    }

    await this.prisma.file.delete({ where: { id } });
    await fs
      .unlink(join(this.uploadDir, file.storedName))
      .catch(() => undefined);

    if (activityId) {
      await this.events.record({
        activityId,
        type: 'FILE_DELETED',
        actorId: user.id,
        note: file.originalName,
        metadata: {
          mimeType: file.mimeType,
          size: file.size,
          uploaderId: file.uploadedById,
        },
      });
    }

    return { message: 'Archivo eliminado exitosamente' };
  }

  /** Quita rutas internas del payload expuesto al cliente. */
  private serialize(file: {
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
    createdAt: Date;
    uploadedById: string;
    activityId: string | null;
    commentId: string | null;
    stageChangeRequestId: string | null;
    stageChangeCommentId: string | null;
  }) {
    return {
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      createdAt: file.createdAt,
      uploadedById: file.uploadedById,
      activityId: file.activityId,
      commentId: file.commentId,
      stageChangeRequestId: file.stageChangeRequestId,
      stageChangeCommentId: file.stageChangeCommentId,
      url: `/files/${file.id}`,
    };
  }
}
