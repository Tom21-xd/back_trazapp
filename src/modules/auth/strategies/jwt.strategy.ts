import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('jwt.secret'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        appRole: {
          include: { permissions: { include: { permission: true } } },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario no autorizado');
    }

    // Permisos efectivos = los del rol configurable asignado.
    const permissions: string[] = user.appRole
      ? user.appRole.permissions.map((rp) => rp.permission.key)
      : [];

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      appRoleId: user.appRoleId,
      appRoleName: user.appRole?.name ?? null,
      permissions,
    };
  }
}
