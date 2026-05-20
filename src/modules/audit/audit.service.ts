import { Injectable, Logger } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPaginated,
  resolvePagination,
  type PaginationQuery,
} from '../../common/pagination';

interface AuditEntry {
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  newData?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /** Best-effort: registrar auditoría nunca debe romper la petición. */
  async record(entry: AuditEntry) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: entry.userId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId || '-',
          newData: (entry.newData as object) ?? undefined,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
        },
      });
    } catch (err) {
      this.logger.error(
        `No se pudo registrar auditoría: ${(err as Error).message}`,
      );
    }
  }

  async findAll(
    filters: {
      userId?: string;
      entityType?: string;
      action?: AuditAction;
    },
    pagination: PaginationQuery = {},
  ) {
    const where: any = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.action) where.action = filters.action;

    const include = {
      user: { select: { id: true, name: true, email: true } },
    };
    const resolved = resolvePagination(pagination);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        ...(resolved.all
          ? {}
          : { skip: resolved.skip, take: resolved.take }),
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return buildPaginated(data, total, resolved);
  }
}
