import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

export interface EmailPayload {
  subject: string;
  message: string;
  /** URL absoluta opcional para el botón "Ver en TrazApp" */
  url?: string;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private fromAddress = '';

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async onModuleInit() {
    const host = this.config.get<string>('mail.host');
    const port = this.config.get<number>('mail.port');
    const user = this.config.get<string>('mail.user');
    const pass = this.config.get<string>('mail.pass');
    this.fromAddress = this.config.get<string>('mail.from') ?? '';

    if (!host || !user || !pass) {
      this.logger.warn(
        'SMTP_HOST / SMTP_USER / SMTP_PASS no definidas — Email desactivado',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: port ?? 587,
      secure: (port ?? 587) === 465,
      auth: { user, pass },
    });

    // Verificamos credenciales sin bloquear el arranque
    this.transporter
      .verify()
      .then(() => this.logger.log(`SMTP activo (${host}:${port})`))
      .catch((err) => {
        this.logger.error(
          `SMTP no responde: ${(err as Error).message} — Email desactivado`,
        );
        this.transporter = null;
      });
  }

  isEnabled(): boolean {
    return !!this.transporter;
  }

  private renderHtml(payload: EmailPayload, recipientName?: string): string {
    const safeMessage = payload.message
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br />');
    const greeting = recipientName ? `Hola ${recipientName},` : 'Hola,';
    const ctaButton = payload.url
      ? `<p style="margin: 28px 0 8px 0;">
            <a href="${payload.url}" style="display:inline-block;padding:12px 22px;background:#00923f;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;">Ver en TrazApp</a>
         </p>`
      : '';
    return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${payload.subject}</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;color:#171717;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e5e5;">
            <tr>
              <td style="background:#00923f;padding:18px 24px;color:#ffffff;font-weight:700;font-size:16px;">
                TrazApp · Alcaldía de Florencia
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 8px 0;font-size:14px;color:#525252;">${greeting}</p>
                <h2 style="margin:0 0 12px 0;font-size:18px;color:#171717;">${payload.subject}</h2>
                <p style="margin:0;font-size:14px;line-height:1.55;color:#404040;">${safeMessage}</p>
                ${ctaButton}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#fafafa;border-top:1px solid #e5e5e5;font-size:11px;color:#737373;">
                Este es un mensaje automático del sistema TrazApp. Si no esperabas
                esta notificación, puedes ignorarla.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }

  /** Envía un email a un email específico (sin Prisma). */
  async sendTo(email: string, payload: EmailPayload, recipientName?: string) {
    if (!this.transporter) return;
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: recipientName ? `"${recipientName}" <${email}>` : email,
        subject: payload.subject,
        text: `${payload.message}${payload.url ? `\n\nAbrir: ${payload.url}` : ''}`,
        html: this.renderHtml(payload, recipientName),
      });
    } catch (err) {
      this.logger.warn(
        `No se pudo enviar email a ${email}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Envía a múltiples usuarios resolviendo los emails desde la BD.
   * No bloquea ni propaga errores: si SMTP falla para uno, los demás siguen.
   */
  async sendToUsers(userIds: string[], payload: EmailPayload) {
    if (!this.transporter) return;
    const targets = [...new Set(userIds)].filter(Boolean);
    if (targets.length === 0) return;

    let users: {
      id: string;
      email: string;
      name: string;
      isActive: boolean;
    }[] = [];
    try {
      users = await this.prisma.user.findMany({
        where: { id: { in: targets }, isActive: true },
        select: { id: true, email: true, name: true, isActive: true },
      });
    } catch (err) {
      this.logger.error(
        `No se pudieron resolver emails: ${(err as Error).message}`,
      );
      return;
    }

    await Promise.allSettled(
      users.map((u) => this.sendTo(u.email, payload, u.name)),
    );
  }
}
