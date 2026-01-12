import { Test, TestingModule } from '@nestjs/testing';
import { ActivitiesService } from './activities.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Priority } from '@prisma/client';

describe('ActivitiesService', () => {
  let service: ActivitiesService;
  let prisma: PrismaService;

  const mockPrismaService = {
    activity: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    project: {
      findUnique: jest.fn(),
    },
    stage: {
      findUnique: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    tag: {
      findMany: jest.fn(),
    },
    activityStageHistory: {
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockActivity = {
    id: '1',
    title: 'Test Activity',
    description: 'Test description',
    priority: Priority.MEDIA,
    dueDate: new Date(),
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
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ActivitiesService>(ActivitiesService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an activity with assignments', async () => {
      const createDto = {
        title: 'New Activity',
        description: 'Description',
        projectId: 'project1',
        currentStageId: 'stage1',
        assignedUserIds: ['user1', 'user2'],
      };

      mockPrismaService.project.findUnique.mockResolvedValue({ id: 'project1' });
      mockPrismaService.stage.findUnique.mockResolvedValue({ id: 'stage1' });
      mockPrismaService.user.findMany.mockResolvedValue([
        { id: 'user1' },
        { id: 'user2' },
      ]);
      mockPrismaService.activity.create.mockResolvedValue({
        ...mockActivity,
        ...createDto,
      });

      const result = await service.create(createDto, 'creator1');

      expect(result).toBeDefined();
      expect(mockPrismaService.activity.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException if project not found', async () => {
      const createDto = {
        title: 'New Activity',
        projectId: 'invalid',
        currentStageId: 'stage1',
      };

      mockPrismaService.project.findUnique.mockResolvedValue(null);

      await expect(service.create(createDto, 'creator1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException for circular dependency', async () => {
      const createDto = {
        title: 'New Activity',
        projectId: 'project1',
        currentStageId: 'stage1',
        dependsOnActivityIds: ['activity1'],
      };

      mockPrismaService.project.findUnique.mockResolvedValue({ id: 'project1' });
      mockPrismaService.stage.findUnique.mockResolvedValue({ id: 'stage1' });
      mockPrismaService.activity.findUnique.mockResolvedValue({
        id: 'activity1',
        dependsOn: [{ requiredActivityId: 'activity2' }],
      });

      // Simular dependencia circular
      jest.spyOn(service as any, 'detectCircularDependency').mockReturnValue(true);

      await expect(service.create(createDto, 'creator1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findAll', () => {
    it('should return all activities', async () => {
      const activities = [mockActivity];
      mockPrismaService.activity.findMany.mockResolvedValue(activities);

      const result = await service.findAll();

      expect(result).toEqual(activities);
    });

    it('should filter by projectId', async () => {
      mockPrismaService.activity.findMany.mockResolvedValue([mockActivity]);

      await service.findAll({ projectId: 'project1' });

      expect(mockPrismaService.activity.findMany).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return an activity by id', async () => {
      mockPrismaService.activity.findUnique.mockResolvedValue(mockActivity);

      const result = await service.findOne('1');

      expect(result).toEqual(mockActivity);
    });

    it('should throw NotFoundException if activity not found', async () => {
      mockPrismaService.activity.findUnique.mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update activity and create stage history', async () => {
      const updateDto = {
        title: 'Updated Activity',
        currentStageId: 'stage2',
      };

      mockPrismaService.activity.findUnique.mockResolvedValue(mockActivity);
      mockPrismaService.stage.findUnique.mockResolvedValue({ id: 'stage2' });
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback(mockPrismaService);
      });
      mockPrismaService.activityStageHistory.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.activity.update.mockResolvedValue({
        ...mockActivity,
        ...updateDto,
      });

      const result = await service.update('1', updateDto);

      expect(result.currentStageId).toBe('stage2');
    });

    it('should update assignments', async () => {
      const updateDto = {
        assignedUserIds: ['user3', 'user4'],
      };

      mockPrismaService.activity.findUnique.mockResolvedValue(mockActivity);
      mockPrismaService.user.findMany.mockResolvedValue([
        { id: 'user3' },
        { id: 'user4' },
      ]);
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback(mockPrismaService);
      });
      mockPrismaService.activity.update.mockResolvedValue(mockActivity);

      await service.update('1', updateDto);

      expect(mockPrismaService.activity.update).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should soft delete an activity', async () => {
      mockPrismaService.activity.findUnique.mockResolvedValue(mockActivity);
      mockPrismaService.activity.update.mockResolvedValue({
        ...mockActivity,
        isActive: false,
      });

      await service.remove('1');

      expect(mockPrismaService.activity.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { isActive: false },
      });
    });
  });

  describe('getMyActivities', () => {
    it('should return activities assigned to user', async () => {
      const userId = 'user1';
      mockPrismaService.activity.findMany.mockResolvedValue([mockActivity]);

      const result = await service.getMyActivities(userId);

      expect(result).toBeDefined();
      expect(mockPrismaService.activity.findMany).toHaveBeenCalledWith({
        where: {
          assignments: {
            some: {
              userId,
            },
          },
        },
        include: expect.any(Object),
      });
    });
  });
});
