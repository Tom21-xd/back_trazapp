import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { LoginDto, RegisterDto, RefreshTokenDto } from './dto';
import { JwtPayload } from './strategies/jwt.strategy';

const RESET_TOKEN_TTL_MIN = 60; // 1 hora

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private email: EmailService,
  ) {}

  async register(dto: RegisterDto) {
    // Verificar si el usuario ya existe
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('El email ya está registrado');
    }

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Crear usuario
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        phone: dto.phone,
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    // Generar tokens
    const tokens = await this.generateTokens(user.id, user.email);

    return {
      user,
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    // Buscar usuario
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    // Verificar contraseña
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    // Actualizar último acceso
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generar tokens
    const tokens = await this.generateTokens(user.id, user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        appRoleId: user.appRoleId,
      },
      ...tokens,
    };
  }

  async refreshToken(dto: RefreshTokenDto) {
    try {
      // Verificar el refresh token
      const payload = this.jwtService.verify<JwtPayload>(dto.refreshToken, {
        secret: this.config.get('jwt.refreshSecret'),
      });

      // Buscar el token en la BD
      const storedToken = await this.prisma.refreshToken.findUnique({
        where: { token: dto.refreshToken },
        include: { user: true },
      });

      if (!storedToken || storedToken.revokedAt) {
        throw new UnauthorizedException('Refresh token inválido');
      }

      if (new Date() > storedToken.expiresAt) {
        throw new UnauthorizedException('Refresh token expirado');
      }

      if (!storedToken.user.isActive) {
        throw new UnauthorizedException('Usuario inactivo');
      }

      // Generar nuevos tokens
      const tokens = await this.generateTokens(payload.sub, payload.email);

      // Revocar el refresh token usado
      await this.prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      });

      return tokens;
    } catch (error) {
      // Conservamos los mensajes específicos que ya lanzamos arriba
      // (expirado / usuario inactivo) y solo genéricos el resto.
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Refresh token inválido');
    }
  }

  /**
   * Inicia el flujo de recuperación: si el email existe, genera un token de un solo uso
   * y se lo manda por correo. NUNCA revela si el email existe o no (anti-enumeración).
   */
  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Respuesta uniforme aunque no exista el usuario
    const ok = {
      message:
        'Si la dirección está registrada, te enviamos un correo con las instrucciones',
    };
    if (!user || !user.isActive) return ok;

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60 * 1000);

    try {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetTokenHash: tokenHash,
          passwordResetExpiresAt: expiresAt,
        },
      });
    } catch (err) {
      this.logger.error(
        `No se pudo guardar token de reset: ${(err as Error).message}`,
      );
      return ok;
    }

    const frontendUrl = this.config.get<string>('frontendUrl') ?? '';
    const url = `${frontendUrl}/reset-password?token=${rawToken}`;

    // Email best-effort; si el SMTP no está configurado, log y seguimos
    await this.email.sendTo(
      user.email,
      {
        subject: 'Recupera tu contraseña · TrazApp',
        message:
          'Recibimos una solicitud para restablecer tu contraseña. ' +
          'El enlace es válido durante 1 hora. Si no fuiste tú, ignora este mensaje.',
        url,
      },
      user.name,
    );

    return ok;
  }

  /**
   * Completa el reset: valida el token (hash + expiración), actualiza la contraseña
   * y revoca todas las sesiones activas del usuario.
   */
  async resetPassword(token: string, newPassword: string) {
    if (!token || typeof token !== 'string') {
      throw new BadRequestException('Token inválido');
    }
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException(
        'La contraseña debe tener al menos 6 caracteres',
      );
    }

    const tokenHash = hashToken(token);
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { gt: new Date() },
        isActive: true,
      },
    });
    if (!user) {
      throw new BadRequestException(
        'El enlace no es válido o ya expiró. Solicita uno nuevo.',
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
    });

    // Revoca todas las sesiones activas tras un reset
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return {
      message: 'Contraseña actualizada. Inicia sesión con la nueva.',
    };
  }

  /** El usuario edita su propio perfil (nombre, teléfono, avatar). */
  async updateProfile(
    userId: string,
    data: { name?: string; phone?: string; avatar?: string },
  ) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.avatar !== undefined ? { avatar: data.avatar } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        avatar: true,
        appRoleId: true,
      },
    });
    return updated;
  }

  /** Cambio de contraseña con el usuario autenticado (requiere la actual). */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }
    if (currentPassword === newPassword) {
      throw new BadRequestException(
        'La nueva contraseña debe ser distinta a la actual',
      );
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });

    // Revoca el resto de sesiones por seguridad
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { message: 'Contraseña actualizada correctamente' };
  }

  async logout(userId: string) {
    // Revoca TODAS las sesiones activas del usuario (no requiere enviar el token)
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    return { message: 'Logout exitoso' };
  }

  private async generateTokens(userId: string, email: string) {
    const payload: JwtPayload = {
      sub: userId,
      email,
    };

    // Generar access token
    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.get('jwt.secret'),
      expiresIn: this.config.get('jwt.expiresIn'),
    });

    // Generar refresh token
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get('jwt.refreshSecret'),
      expiresIn: this.config.get('jwt.refreshExpiresIn'),
    });

    // Guardar refresh token en BD
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 días

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId,
        expiresAt,
      },
    });

    // Housekeeping: elimina tokens caducados o revocados del usuario para
    // que la tabla no crezca de forma indefinida.
    await this.prisma.refreshToken.deleteMany({
      where: {
        userId,
        OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }],
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }
}
