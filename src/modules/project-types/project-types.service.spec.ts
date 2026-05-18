import { Test, TestingModule } from '@nestjs/testing';
import { ProjectTypesService } from './project-types.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';

describe('ProjectTypesService', () => {
  let service: ProjectTypesService;

  const mockPrisma = {
    projectType: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((ops: any): any =>
      Array.isArray(ops) ? Promise.all(ops) : ops,
    ),
  };

  const mockType = {
    id: '1',
    name: 'Obra pública',
    description: null,
    color: '#00923f',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { projects: 0 },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectTypesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ProjectTypesService>(ProjectTypesService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates a type', async () => {
      mockPrisma.projectType.findUnique.mockResolvedValue(null);
      mockPrisma.projectType.create.mockResolvedValue(mockType);

      const result = await service.create({ name: 'Obra pública' });

      expect(result).toBeDefined();
      expect(mockPrisma.projectType.create).toHaveBeenCalled();
    });

    it('throws ConflictException on duplicate name', async () => {
      mockPrisma.projectType.findUnique.mockResolvedValue(mockType);

      await expect(service.create({ name: 'Obra pública' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAll', () => {
    it('returns paginated types', async () => {
      mockPrisma.projectType.findMany.mockResolvedValue([mockType]);
      mockPrisma.projectType.count.mockResolvedValue(1);

      const result = await service.findAll();

      expect(result.data).toEqual([mockType]);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException if missing', async () => {
      mockPrisma.projectType.findUnique.mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('blocks delete when projects associated', async () => {
      mockPrisma.projectType.findUnique.mockResolvedValue({
        ...mockType,
        _count: { projects: 3 },
      });

      await expect(service.remove('1')).rejects.toThrow(BadRequestException);
    });

    it('deletes when no projects', async () => {
      mockPrisma.projectType.findUnique.mockResolvedValue(mockType);
      mockPrisma.projectType.delete.mockResolvedValue(mockType);

      const result = await service.remove('1');

      expect(result.message).toBe('Tipo de proyecto eliminado exitosamente');
    });
  });
});
