import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { ProjectStatus } from '@prisma/client';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    project: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    projectType: {
      findUnique: jest.fn(),
    },
    projectTag: {
      deleteMany: jest.fn(),
    },
    tag: {
      findMany: jest.fn(),
    },
    activity: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const mockProject = {
    id: '1',
    name: 'Test Project',
    description: 'Test description',
    status: ProjectStatus.EN_PROGRESO,
    projectTypeId: 'type1',
    startDate: new Date(),
    endDate: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a project with tags', async () => {
      const createDto = {
        name: 'New Project',
        description: 'New description',
        projectTypeId: 'type1',
        tagIds: ['tag1', 'tag2'],
      };

      mockPrismaService.projectType.findUnique.mockResolvedValue({ id: 'type1' });
      mockPrismaService.tag.findMany.mockResolvedValue([
        { id: 'tag1' },
        { id: 'tag2' },
      ]);
      mockPrismaService.project.create.mockResolvedValue({
        ...mockProject,
        ...createDto,
        tags: [{ id: '1', tagId: 'tag1' }, { id: '2', tagId: 'tag2' }],
      });

      const result = await service.create(createDto);

      expect(result).toBeDefined();
      expect(mockPrismaService.project.create).toHaveBeenCalled();
    });

    it('should create project without optional fields', async () => {
      const createDto = {
        name: 'Simple Project',
      };

      mockPrismaService.project.create.mockResolvedValue({
        ...mockProject,
        ...createDto,
      });

      const result = await service.create(createDto);

      expect(result).toBeDefined();
      expect(mockPrismaService.project.create).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all projects', async () => {
      const projects = [mockProject];
      mockPrismaService.project.findMany.mockResolvedValue(projects);

      const result = await service.findAll();

      expect(result).toEqual(projects);
      expect(mockPrismaService.project.findMany).toHaveBeenCalled();
    });

    it('should include inactive projects when requested', async () => {
      mockPrismaService.project.findMany.mockResolvedValue([mockProject]);

      await service.findAll(true);

      expect(mockPrismaService.project.findMany).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a project by id', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);

      const result = await service.findOne('1');

      expect(result).toEqual(mockProject);
      expect(mockPrismaService.project.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
        include: expect.any(Object),
      });
    });

    it('should throw NotFoundException if project not found', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update project data', async () => {
      const updateDto = {
        name: 'Updated Project',
        status: ProjectStatus.COMPLETADO,
      };

      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.project.update.mockResolvedValue({
        ...mockProject,
        ...updateDto,
      });

      const result = await service.update('1', updateDto);

      expect(result.name).toBe(updateDto.name);
      expect(result.status).toBe(updateDto.status);
    });

    it('should update tags', async () => {
      const updateDto = {
        tagIds: ['tag3', 'tag4'],
      };

      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.projectTag.deleteMany.mockResolvedValue({ count: 2 });
      mockPrismaService.project.update.mockResolvedValue(mockProject);

      await service.update('1', updateDto);

      expect(mockPrismaService.projectTag.deleteMany).toHaveBeenCalled();
      expect(mockPrismaService.project.update).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete a project', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.project.delete.mockResolvedValue(mockProject);

      await service.remove('1');

      expect(mockPrismaService.project.delete).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });
  });

  describe('getProjectStats', () => {
    it('should return project statistics', async () => {
      const projectWithActivities = {
        ...mockProject,
        activities: [
          { id: '1', priority: 'ALTA', currentStage: { name: 'En Proceso' } },
          { id: '2', priority: 'MEDIA', currentStage: { name: 'En Proceso' } },
          { id: '3', priority: 'BAJA', currentStage: { name: 'Completado' } },
        ],
      };

      mockPrismaService.project.findUnique.mockResolvedValue(projectWithActivities);

      const result = await service.getProjectStats('1');

      expect(result).toHaveProperty('totalActivities');
      expect(result).toHaveProperty('activitiesByStage');
      expect(result).toHaveProperty('activitiesByPriority');
    });
  });
});
