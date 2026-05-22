import { Test, TestingModule } from '@nestjs/testing';
import { StagesService } from './stages.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('StagesService', () => {
  let service: StagesService;

  const mockPrismaService = {
    stage: {
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

  const mockStage = {
    id: '1',
    name: 'En Proceso',
    description: 'Stage description',
    order: 1,
    color: '#FF5733',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StagesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<StagesService>(StagesService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new stage', async () => {
      const createDto = {
        name: 'Nueva Etapa',
        description: 'Descripción',
        color: '#FF5733',
        order: 1,
      };

      mockPrismaService.stage.findUnique.mockResolvedValue(null);
      mockPrismaService.stage.create.mockResolvedValue({
        ...mockStage,
        ...createDto,
      });

      const result = await service.create(createDto);

      expect(result).toBeDefined();
      expect(mockPrismaService.stage.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if name already exists', async () => {
      const createDto = {
        name: 'En Proceso',
        description: 'Descripción',
        color: '#FF5733',
        order: 1,
      };

      mockPrismaService.stage.findUnique.mockResolvedValue(mockStage);

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAll', () => {
    it('should return all stages ordered by order', async () => {
      const stages = [mockStage, { ...mockStage, id: '2', order: 2 }];
      mockPrismaService.stage.findMany.mockResolvedValue(stages);
      mockPrismaService.stage.count.mockResolvedValue(2);

      const result = await service.findAll();

      expect(result.data).toEqual(stages);
      expect(result.meta.total).toBe(2);
      expect(mockPrismaService.stage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { order: 'asc' },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a stage by id', async () => {
      mockPrismaService.stage.findUnique.mockResolvedValue(mockStage);

      const result = await service.findOne('1');

      expect(result).toEqual(mockStage);
    });

    it('should throw NotFoundException if stage not found', async () => {
      mockPrismaService.stage.findUnique.mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update stage data', async () => {
      const updateDto = {
        name: 'Updated Stage',
        color: '#0000FF',
      };

      mockPrismaService.stage.findUnique.mockResolvedValue(mockStage);
      mockPrismaService.stage.update.mockResolvedValue({
        ...mockStage,
        ...updateDto,
      });

      const result = await service.update('1', updateDto);

      expect(result.name).toBe(updateDto.name);
      expect(result.color).toBe(updateDto.color);
    });

    it('should throw ConflictException if name already exists', async () => {
      const updateDto = {
        name: 'Existing Stage',
      };

      mockPrismaService.stage.findUnique
        .mockResolvedValueOnce(mockStage) // Primera llamada en findOne
        .mockResolvedValueOnce({ id: '2', name: 'Existing Stage' }); // Verificar nombre existente

      await expect(service.update('1', updateDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('should delete a stage', async () => {
      const stageWith0Activities = {
        ...mockStage,
        _count: { activitiesCurrent: 0, stageHistory: 0 },
      };

      mockPrismaService.stage.findUnique.mockResolvedValue(
        stageWith0Activities,
      );
      mockPrismaService.stage.delete.mockResolvedValue(mockStage);

      await service.remove('1');

      expect(mockPrismaService.stage.delete).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });
  });

  describe('reorder', () => {
    it('should reorder stages', async () => {
      const stages = [
        { id: '1', order: 2 },
        { id: '2', order: 1 },
      ];

      mockPrismaService.$transaction.mockResolvedValue([
        { ...mockStage, order: 2 },
        { ...mockStage, id: '2', order: 1 },
      ]);

      await service.reorder(stages);

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });
  });
});
