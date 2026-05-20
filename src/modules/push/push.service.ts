import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

export interface SubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  onModuleInit() {
    const publicKey = this.config.get<string>('push.vapidPublicKey');
    const privateKey = this.config.get<string>('push.vapidPrivateKey');
    const subject = this.config.get<string>('push.vapidSubject');

    if (!publicKey || !privateKey) {
      this.logger.warn(
        'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY no definidas — Web Push desactivado',
      );
      return;
    }
    try {
      webpush.setVapidDetails(subject!, publicKey, privateKey);
      this.enabled = true;
      this.logger.log('Web Push (VAPID) activo');
    } catch (err) {
      this.logger.error(
        `No se pudo inicializar VAPID: ${(err as Error).message}`,
      );
    }
  }

  /** Clave pública para que el frontend cree la suscripción. */
  getPublicKey(): string | null {
    if (!this.enabled) return null;
    return this.config.get<string>('push.vapidPublicKey') ?? null;
  }

  /** Guarda (upsert por endpoint) la suscripción de un dispositivo. */
  async subscribe(
    userId: string,
    sub: SubscriptionPayload,
    userAgent?: string,
  ) {
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      throw new Error('Suscripción inválida');
    }
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      update: {
        userId,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent,
        lastUsedAt: new Date(),
      },
      create: {
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent,
      },
    });
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
    return { ok: true };
  }

  /** Envía una notificación push a todos los dispositivos de los usuarios indicados. */
  async sendToUsers(userIds: string[], payload: PushNotificationPayload) {
    if (!this.enabled) return;
    const targets = [...new Set(userIds)].filter(Boolean);
    if (targets.length === 0) return;

    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId: { in: targets } },
    });
    if (subs.length === 0) return;

    const body = JSON.stringify(payload);
    const obsoleteEndpoints: string[] = [];
    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body,
          );
          await this.prisma.pushSubscription
            .update({
              where: { id: sub.id },
              data: { lastUsedAt: new Date() },
            })
            .catch(() => undefined);
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // 404/410: el endpoint del navegador ya no existe; lo limpiamos
          if (status === 404 || status === 410) {
            obsoleteEndpoints.push(sub.endpoint);
          } else {
            this.logger.warn(
              `Push fallido para ${sub.endpoint.slice(0, 60)}…: ${
                (err as Error).message
              }`,
            );
          }
        }
      }),
    );

    if (obsoleteEndpoints.length > 0) {
      await this.prisma.pushSubscription
        .deleteMany({
          where: { endpoint: { in: obsoleteEndpoints } },
        })
        .catch(() => undefined);
    }
  }
}
