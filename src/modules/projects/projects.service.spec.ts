import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { ProjectStatus } from '@prisma/client';

describe('ProjectsService', () => {
  let service: ProjectsService;

  const mockPrisma = {
    project: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    projectTag: { deleteMany: jest.fn() },
    $transaction: jest.fn((ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops) : ops,
    ),
  };

  const mockProject = {
    id: '1',
    name: 'Test Project',
    description: 'Test description',
    status: ProjectStatus.EN_PROGRESO,
    projectTypeId: null,
    startDate: null,
    endDate: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    projectType: null,
    tags: [],
    _count: { activities: 0 },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a project', async () => {
      mockPrisma.project.create.mockResolvedValue(mockProject);

      const result = await service.create({ name: 'New Project' });

      expect(result).toBeDefined();
      expect(mockPrisma.project.create).toHaveBeenCalled();
    });

    it('should create a project with tags', async () => {
      mockPrisma.project.create.mockResolvedValue(mockProject);

      const result = await service.create({
        name: 'New Project',
        tagIds: ['tag1', 'tag2'],
      });

      expect(result).toBeDefined();
      expect(mockPrisma.project.create).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated projects', async () => {
      mockPrisma.project.findMany.mockResolvedValue([mockProject]);
      mockPrisma.project.count.mockResolvedValue(1);

      const result = await service.findAll();

      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toEqual([mockProject]);
      expect(result.meta.total).toBe(1);
      expect(mockPrisma.project.findMany).toHaveBeenCalled();
    });

    it('should include inactive when requested', async () => {
      mockPrisma.project.findMany.mockResolvedValue([mockProject]);
      mockPrisma.project.count.mockResolvedValue(1);

      await service.findAll(true);

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a project', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(mockProject);

      const result = await service.findOne('1');

      expect(result).toEqual(mockProject);
    });

    it('should throw NotFoundException if not found', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update project data', async () => {
      const updateDto = { name: 'Updated Name' };
      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
      mockPrisma.project.update.mockResolvedValue({
        ...mockProject,
        ...updateDto,
      });

      const result = await service.update('1', updateDto);

      expect(result.name).toBe(updateDto.name);
    });

    it('should update tags', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
      mockPrisma.projectTag.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.project.update.mockResolvedValue(mockProject);

      await service.update('1', { tagIds: ['tag1'] });

      expect(mockPrisma.projectTag.deleteMany).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete a project', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
      mockPrisma.project.delete.mockResolvedValue(mockProject);

      const result = await service.remove('1');

      expect(result.message).toBe('Proyecto eliminado exitosamente');
      expect(mockPrisma.project.delete).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });
  });

  describe('getProjectStats', () => {
    it('should return project statistics', async () => {
      const projectWithActivities = {
        ...mockProject,
        activities: [
          { priority: 'ALTA', currentStage: { id: '1', name: 'En Proceso' } },
          { priority: 'MEDIA', currentStage: { id: '1', name: 'En Proceso' } },
        ],
      };

      mockPrisma.project.findUnique
        .mockResolvedValueOnce(mockProject)
        .mockResolvedValueOnce(projectWithActivities);

      const result = await service.getProjectStats('1');

      expect(result).toHaveProperty('totalActivities');
      expect(result).toHaveProperty('activitiesByStage');
      expect(result).toHaveProperty('activitiesByPriority');
    });
  });
});
