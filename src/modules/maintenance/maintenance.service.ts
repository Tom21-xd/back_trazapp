import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface PurgeSummary {
  notificationsRead: number;
  notificationsOld: number;
  auditLogs: number;
}

/**
 * Limpieza periódica de tablas que crecen sin límite (notificaciones y
 * auditoría). Las retenciones son configurables por entorno; 0 desactiva
 * esa categoría. Se ejecuta cada día de madrugada.
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'data-retention' })
  async handleRetentionCron() {
    const summary = await this.purgeExpiredData();
    this.logger.log(
      `Retención: ${summary.notificationsRead} notif. leídas, ` +
        `${summary.notificationsOld} notif. antiguas, ` +
        `${summary.auditLogs} registros de auditoría purgados.`,
    );
  }

  private daysAgo(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  /** Ejecuta la purga según la política de retención configurada. */
  async purgeExpiredData(): Promise<PurgeSummary> {
    const readDays = Number(this.config.get('retention.notificationsReadDays'));
    const allDays = Number(this.config.get('retention.notificationsAllDays'));
    const auditDays = Number(this.config.get('retention.auditDays'));

    let notificationsRead = 0;
    let notificationsOld = 0;
    let auditLogs = 0;

    // Notificaciones leídas más antiguas que `readDays`
    if (readDays > 0) {
      const res = await this.prisma.notification.deleteMany({
        where: { isRead: true, createdAt: { lt: this.daysAgo(readDays) } },
      });
      notificationsRead = res.count;
    }

    // Cualquier notificación (leída o no) más antigua que `allDays`
    if (allDays > 0) {
      const res = await this.prisma.notification.deleteMany({
        where: { createdAt: { lt: this.daysAgo(allDays) } },
      });
      notificationsOld = res.count;
    }

    // Auditoría más antigua que `auditDays`
    if (auditDays > 0) {
      const res = await this.prisma.auditLog.deleteMany({
        where: { createdAt: { lt: this.daysAgo(auditDays) } },
      });
      auditLogs = res.count;
    }

    return { notificationsRead, notificationsOld, auditLogs };
  }
}
