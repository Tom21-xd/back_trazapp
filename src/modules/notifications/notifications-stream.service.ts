import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';

export interface StreamPayload {
  type: 'notification' | 'unreadCount' | 'heartbeat';
  data?: unknown;
}

/**
 * Mantiene las conexiones SSE abiertas por usuario y permite hacer broadcast.
 * Una misma cuenta puede tener varias pestañas/dispositivos abiertos a la vez,
 * por eso es Map<userId, Set<Subject>>.
 *
 * Best-effort: si un Subject falla al emitir no rompe el flujo principal.
 */
@Injectable()
export class NotificationsStreamService {
  private readonly logger = new Logger(NotificationsStreamService.name);
  private streams = new Map<string, Set<Subject<StreamPayload>>>();

  register(userId: string): Subject<StreamPayload> {
    const subject = new Subject<StreamPayload>();
    const set = this.streams.get(userId) ?? new Set();
    set.add(subject);
    this.streams.set(userId, set);
    return subject;
  }

  unregister(userId: string, subject: Subject<StreamPayload>) {
    const set = this.streams.get(userId);
    if (!set) return;
    set.delete(subject);
    subject.complete();
    if (set.size === 0) this.streams.delete(userId);
  }

  /** Cantidad de conexiones activas (útil para diagnóstico). */
  activeConnections(): number {
    let total = 0;
    for (const s of this.streams.values()) total += s.size;
    return total;
  }

  /** Envía un payload a todas las pestañas abiertas de los usuarios indicados. */
  broadcast(userIds: string[], payload: StreamPayload) {
    const targets = [...new Set(userIds)].filter(Boolean);
    for (const userId of targets) {
      const set = this.streams.get(userId);
      if (!set) continue;
      for (const subject of set) {
        try {
          subject.next(payload);
        } catch (err) {
          this.logger.warn(
            `SSE next() falló para ${userId}: ${(err as Error).message}`,
          );
        }
      }
    }
  }
}
