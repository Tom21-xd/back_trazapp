import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwt: JwtService;
  let config: ConfigService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn(),
    signAsync: jest.fn(),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        'jwt.secret': 'test-secret',
        'jwt.expiresIn': '1h',
        'jwt.refreshSecret': 'test-refresh-secret',
        'jwt.refreshExpiresIn': '7d',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwt = module.get<JwtService>(JwtService);
    config = module.get<ConfigService>(ConfigService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('should create a new user and return tokens', async () => {
      const dto = {
        email: 'test@test.com',
        password: 'password123',
        name: 'Test User',
      };

      const hashedPassword = 'hashedPassword';
      jest.spyOn(bcrypt, 'hash').mockImplementation(() => Promise.resolve(hashedPassword as never));

      const mockUser = {
        id: '1',
        email: dto.email,
        name: dto.name,
        role: Role.EMPLEADO,
        password: hashedPassword,
        phone: null,
        avatar: null,
        isActive: true,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('mock-access-token');
      mockJwtService.signAsync.mockResolvedValue('mock-token');
      mockPrismaService.refreshToken.create.mockResolvedValue({
        id: '1',
        token: 'refresh-token',
        userId: '1',
        expiresAt: new Date(),
        createdAt: new Date(),
        revokedAt: null,
      });

      const result = await service.register(dto);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user).not.toHaveProperty('password');
      expect(mockPrismaService.user.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if email already exists', async () => {
      const dto = {
        email: 'existing@test.com',
        password: 'password123',
        name: 'Test User',
      };

      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '1',
        email: dto.email,
      });

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should login with valid credentials', async () => {
      const dto = {
        email: 'test@test.com',
        password: 'password123',
      };

      const mockUser = {
        id: '1',
        email: dto.email,
        password: await bcrypt.hash(dto.password, 10),
        name: 'Test User',
        role: Role.EMPLEADO,
        isActive: true,
        phone: null,
        avatar: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true as never));
      mockPrismaService.user.update.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('mock-access-token');
      mockJwtService.signAsync.mockResolvedValue('mock-token');
      mockPrismaService.refreshToken.create.mockResolvedValue({
        id: '1',
        token: 'refresh-token',
        userId: '1',
        expiresAt: new Date(),
        createdAt: new Date(),
        revokedAt: null,
      });

      const result = await service.login(dto);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(mockPrismaService.user.update).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException with invalid credentials', async () => {
      const dto = {
        email: 'test@test.com',
        password: 'wrongpassword',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user is inactive', async () => {
      const dto = {
        email: 'test@test.com',
        password: 'password123',
      };

      const mockUser = {
        id: '1',
        email: dto.email,
        password: await bcrypt.hash(dto.password, 10),
        isActive: false,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshToken', () => {
    it('should refresh tokens with valid refresh token', async () => {
      const dto = {
        refreshToken: 'valid-refresh-token',
      };

      const mockRefreshToken = {
        id: '1',
        token: dto.refreshToken,
        userId: '1',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        revokedAt: null,
      };

      const mockUser = {
        id: '1',
        email: 'test@test.com',
        role: Role.EMPLEADO,
      };

      mockJwtService.verify.mockReturnValue({ sub: '1' });
      mockPrismaService.refreshToken.findUnique.mockResolvedValue(mockRefreshToken);
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.refreshToken.update.mockResolvedValue(mockRefreshToken);
      mockJwtService.sign.mockReturnValue('new-access-token');
      mockJwtService.signAsync.mockResolvedValue('new-token');
      mockPrismaService.refreshToken.create.mockResolvedValue({
        id: '2',
        token: 'new-refresh-token',
        userId: '1',
        expiresAt: new Date(),
        createdAt: new Date(),
        revokedAt: null,
      });

      const result = await service.refreshToken(dto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(mockPrismaService.refreshToken.update).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException with invalid token', async () => {
      const dto = {
        refreshToken: 'invalid-token',
      };

      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.refreshToken(dto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('should revoke refresh token', async () => {
      const userId = '1';
      const refreshToken = 'token-to-revoke';

      const mockRefreshToken = {
        id: '1',
        token: refreshToken,
        userId,
        expiresAt: new Date(),
        createdAt: new Date(),
        revokedAt: null,
      };

      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.logout(userId, refreshToken);

      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          userId,
          token: refreshToken,
        },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});
