import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  const mockEmail = { sendTo: jest.fn(), sendToUsers: jest.fn() };

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const mockJwt = {
    sign: jest.fn().mockReturnValue('mock-token'),
    verify: jest.fn(),
  };

  const mockConfig = {
    get: jest.fn((key: string) => {
      const map = {
        'jwt.secret': 'secret',
        'jwt.expiresIn': '1h',
        'jwt.refreshSecret': 'refresh-secret',
        'jwt.refreshExpiresIn': '7d',
      };
      return map[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: EmailService, useValue: mockEmail },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    const dto = {
      email: 'test@test.com',
      password: 'password123',
      name: 'Test',
    };

    it('should register a new user and return tokens', async () => {
      jest
        .spyOn(bcrypt, 'hash')
        .mockImplementation(() => Promise.resolve('hashed'));
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: '1',
        email: dto.email,
        name: dto.name,
        createdAt: new Date(),
      });
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.register(dto);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(mockPrisma.user.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if email exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: '1' });
      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    const dto = { email: 'test@test.com', password: 'password123' };

    it('should login with valid credentials', async () => {
      const mockUser = {
        id: '1',
        email: dto.email,
        password: 'hashed',
        name: 'Test',
        isActive: true,
      };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      jest
        .spyOn(bcrypt, 'compare')
        .mockImplementation(() => Promise.resolve(true));
      mockPrisma.user.update.mockResolvedValue(mockUser);
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login(dto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
    });

    it('should throw UnauthorizedException with wrong email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user is inactive', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: '1',
        email: dto.email,
        password: 'hashed',
        isActive: false,
      });
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException with wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: '1',
        email: dto.email,
        password: 'hashed',
        isActive: true,
      });
      jest
        .spyOn(bcrypt, 'compare')
        .mockImplementation(() => Promise.resolve(false));
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshToken', () => {
    it('should throw UnauthorizedException with invalid token', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error();
      });
      await expect(
        service.refreshToken({ refreshToken: 'invalid' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should revoke all active refresh tokens of the user', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.logout('user1');

      expect(result).toEqual({ message: 'Logout exitoso' });
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('updateProfile', () => {
    it('actualiza sólo los campos enviados', async () => {
      mockPrisma.user.update.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        name: 'Nuevo',
        phone: '123',
        avatar: null,
        appRoleId: null,
      });

      const res = await service.updateProfile('u1', { name: 'Nuevo' });

      expect(res.name).toBe('Nuevo');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: { name: 'Nuevo' },
        }),
      );
    });
  });

  describe('changePassword', () => {
    it('cambia la contraseña y revoca sesiones', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        password: 'hash-actual',
      });
      jest
        .spyOn(bcrypt, 'compare')
        .mockImplementation(() => Promise.resolve(true));
      jest
        .spyOn(bcrypt, 'hash')
        .mockImplementation(() => Promise.resolve('hash-nuevo'));
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const res = await service.changePassword('u1', 'actual', 'nueva123');

      expect(res.message).toContain('actualizada');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: { password: 'hash-nuevo' },
        }),
      );
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalled();
    });

    it('rechaza si la contraseña actual es incorrecta', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        password: 'hash-actual',
      });
      jest
        .spyOn(bcrypt, 'compare')
        .mockImplementation(() => Promise.resolve(false));

      await expect(
        service.changePassword('u1', 'mala', 'nueva123'),
      ).rejects.toThrow('actual no es correcta');
    });

    it('rechaza si la nueva contraseña es igual a la actual', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        password: 'hash-actual',
      });
      jest
        .spyOn(bcrypt, 'compare')
        .mockImplementation(() => Promise.resolve(true));

      await expect(
        service.changePassword('u1', 'igual', 'igual'),
      ).rejects.toThrow('distinta');
    });
  });

  describe('requestPasswordReset', () => {
    it('responde uniforme aunque el email no exista (anti-enumeración)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const res = await service.requestPasswordReset('nope@x.com');
      expect(res.message).toContain('te enviamos un correo');
      expect(mockEmail.sendTo).not.toHaveBeenCalled();
    });

    it('genera token, lo persiste y manda email cuando el usuario existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        name: 'Ana',
        isActive: true,
      });
      mockPrisma.user.update.mockResolvedValue({});

      await service.requestPasswordReset('a@b.com');

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: expect.objectContaining({
            passwordResetTokenHash: expect.any(String),
            passwordResetExpiresAt: expect.any(Date),
          }),
        }),
      );
      expect(mockEmail.sendTo).toHaveBeenCalled();
    });

    it('no envía email si el usuario está inactivo', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        name: 'Ana',
        isActive: false,
      });
      await service.requestPasswordReset('a@b.com');
      expect(mockEmail.sendTo).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('rechaza token corto', async () => {
      await expect(service.resetPassword('short', 'newpass1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rechaza contraseña corta', async () => {
      await expect(
        service.resetPassword('a'.repeat(64), 'short'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza token inválido / expirado', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.resetPassword('a'.repeat(64), 'newpass1'),
      ).rejects.toThrow('no es válido');
    });

    it('actualiza la contraseña y revoca sesiones', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        isActive: true,
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });
      jest
        .spyOn(bcrypt, 'hash')
        .mockImplementation(() => Promise.resolve('hashed'));

      const res = await service.resetPassword('a'.repeat(64), 'newpass1');

      expect(res.message).toContain('actualizada');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: expect.objectContaining({
            password: 'hashed',
            passwordResetTokenHash: null,
            passwordResetExpiresAt: null,
          }),
        }),
      );
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});
