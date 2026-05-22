import { Test, TestingModule } from '@nestjs/testing';
import { RolesService } from './roles.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('RolesService', () => {
  let service: RolesService;

  const mockPrisma = {
    appRole: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    permission: { findMany: jest.fn() },
    rolePermission: { deleteMany: jest.fn(), createMany: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn((arg: any): any =>
      typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg),
    ),
  };

  const mockRole = {
    id: 'r1',
    name: 'Supervisor',
    description: null,
    isSystem: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    permissions: [{ permission: { key: 'project:create' } }],
    _count: { users: 0 },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<RolesService>(RolesService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('returns paginated roles serialized', async () => {
      mockPrisma.appRole.findMany.mockResolvedValue([mockRole]);
      mockPrisma.appRole.count.mockResolvedValue(1);

      const result = await service.findAll();

      expect(result.meta.total).toBe(1);
      expect(result.data[0].permissionKeys).toEqual(['project:create']);
    });
  });

  describe('create', () => {
    it('rejects unknown permission keys', async () => {
      mockPrisma.appRole.findUnique.mockResolvedValue(null);
      mockPrisma.permission.findMany.mockResolvedValue([]); // ninguno encontrado

      await expect(
        service.create({ name: 'X', permissionKeys: ['nope:bad'] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('blocks deleting a system role', async () => {
      mockPrisma.appRole.findUnique.mockResolvedValue({
        ...mockRole,
        isSystem: true,
        _count: { users: 0 },
      });

      await expect(service.remove('r1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('assignToUser', () => {
    it('throws if user missing', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.assignToUser('u1', 'r1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('assigns role to user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      mockPrisma.appRole.findUnique.mockResolvedValue({
        id: 'r1',
        name: 'Administrador',
      });
      mockPrisma.user.update.mockResolvedValue({});

      const res = await service.assignToUser('u1', 'r1');

      expect(res.message).toBe('Rol asignado correctamente');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { appRoleId: 'r1' },
      });
    });
  });
});
