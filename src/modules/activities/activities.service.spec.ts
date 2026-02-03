import { Test, TestingModule } from '@nestjs/testing';
import { ActivitiesService } from './activities.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { Priority } from '@prisma/client';

describe('ActivitiesService', () => {
  let service: ActivitiesService;

  const mockPrisma = {
    activity: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    project: { findUnique: jest.fn() },
    stage: { findUnique: jest.fn() },
    activityAssignment: { deleteMany: jest.fn(), createMany: jest.fn(), delete: jest.fn() },
    activityTag: { deleteMany: jest.fn() },
    activityDependency: { deleteMany: jest.fn(), count: jest.fn() },
    activityStageHistory: { create: jest.fn(), updateMany: jest.fn() },
  };

  const mockActivity = {
    id: '1',
    title: 'Test Activity',
    description: 'Test description',
    priority: Priority.MEDIA,
    dueDate: null,
    projectId: 'project1',
    currentStageId: 'stage1',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivitiesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ActivitiesService>(ActivitiesService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an activity', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'project1' });
      mockPrisma.stage.findUnique.mockResolvedValue({ id: 'stage1' });
      mockPrisma.activity.create.mockResolvedValue(mockActivity);

      const result = await service.create(
        { title: 'New', projectId: 'project1', currentStageId: 'stage1' },
        'user1',
      );

      expect(result).toBeDefined();
      expect(mockPrisma.activity.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException if project not found', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);

      await expect(
        service.create(
          { title: 'New', projectId: 'invalid', currentStageId: 'stage1' },
          'user1',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return all activities', async () => {
      mockPrisma.activity.findMany.mockResolvedValue([mockActivity]);

      const result = await service.findAll();

      expect(Array.isArray(result)).toBe(true);
      expect(mockPrisma.activity.findMany).toHaveBeenCalled();
    });

    it('should filter by projectId', async () => {
      mockPrisma.activity.findMany.mockResolvedValue([mockActivity]);

      await service.findAll({ projectId: 'project1' });

      expect(mockPrisma.activity.findMany).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return an activity', async () => {
      mockPrisma.activity.findUnique.mockResolvedValue(mockActivity);

      const result = await service.findOne('1');

      expect(result).toBeDefined();
    });

    it('should throw NotFoundException if not found', async () => {
      mockPrisma.activity.findUnique.mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update activity data', async () => {
      mockPrisma.activity.findUnique.mockResolvedValue(mockActivity);
      mockPrisma.activity.update.mockResolvedValue({ ...mockActivity, title: 'Updated' });

      const result = await service.update('1', { title: 'Updated' });

      expect(result.title).toBe('Updated');
    });
  });

  describe('remove', () => {
    it('should delete an activity', async () => {
      mockPrisma.activity.findUnique.mockResolvedValue(mockActivity);
      mockPrisma.activityDependency.count.mockResolvedValue(0);
      mockPrisma.activityAssignment.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.activityTag.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.activityDependency.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.activity.delete.mockResolvedValue(mockActivity);

      const result = await service.remove('1');

      expect(result.message).toBe('Actividad eliminada exitosamente');
    });
  });

  describe('getMyActivities', () => {
    it('should return activities assigned to user', async () => {
      mockPrisma.activity.findMany.mockResolvedValue([mockActivity]);

      const result = await service.getMyActivities('user1');

      expect(Array.isArray(result)).toBe(true);
      expect(mockPrisma.activity.findMany).toHaveBeenCalled();
    });
  });
});
