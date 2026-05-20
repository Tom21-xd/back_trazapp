import { Test, TestingModule } from '@nestjs/testing';
import { CommentsService } from './comments.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityEventsService } from '../activity-events/activity-events.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

const owner = {
  id: 'user1',
  permissions: ['comment:update:own', 'comment:delete:own'],
};
const moderator = {
  id: 'admin1',
  permissions: ['comment:update:any', 'comment:delete:any'],
};
const stranger = { id: 'user2', permissions: [] as string[] };

describe('CommentsService', () => {
  let service: CommentsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    comment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    activity: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops) : ops,
    ),
  };

  const mockComment = {
    id: '1',
    content: 'Test comment',
    activityId: 'activity1',
    userId: 'user1',
    createdAt: new Date(),
    updatedAt: new Date(),
    user: {
      id: 'user1',
      name: 'Test User',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: NotificationsService,
          useValue: { newComment: jest.fn() },
        },
        {
          provide: ActivityEventsService,
          useValue: { record: jest.fn(), list: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new comment', async () => {
      const createDto = {
        content: 'New comment',
        activityId: 'activity1',
      };

      mockPrismaService.activity.findUnique.mockResolvedValue({ id: 'activity1' });
      mockPrismaService.comment.create.mockResolvedValue({
        ...mockComment,
        content: createDto.content,
      });

      const result = await service.create(createDto, 'user1');

      expect(result).toBeDefined();
      expect(result.content).toBe(createDto.content);
      expect(mockPrismaService.comment.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException if activity not found', async () => {
      const createDto = {
        content: 'New comment',
        activityId: 'invalid',
      };

      mockPrismaService.activity.findUnique.mockResolvedValue(null);

      await expect(service.create(createDto, 'user1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByActivity', () => {
    it('should return comments for an activity', async () => {
      const comments = [mockComment];
      mockPrismaService.comment.findMany.mockResolvedValue(comments);
      mockPrismaService.comment.count.mockResolvedValue(1);

      const result = await service.findByActivity('activity1');

      expect(result.data).toEqual(comments);
      expect(result.meta.total).toBe(1);
      expect(mockPrismaService.comment.findMany).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update comment if user is owner', async () => {
      const updateDto = {
        content: 'Updated comment',
      };

      mockPrismaService.comment.findUnique.mockResolvedValue(mockComment);
      mockPrismaService.comment.update.mockResolvedValue({
        ...mockComment,
        content: updateDto.content,
      });

      const result = await service.update('1', updateDto, owner);

      expect(result.content).toBe(updateDto.content);
    });

    it('should allow admin to update any comment', async () => {
      const updateDto = {
        content: 'Admin updated comment',
      };

      mockPrismaService.comment.findUnique.mockResolvedValue(mockComment);
      mockPrismaService.comment.update.mockResolvedValue({
        ...mockComment,
        content: updateDto.content,
      });

      const result = await service.update('1', updateDto, moderator);

      expect(result.content).toBe(updateDto.content);
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      const updateDto = {
        content: 'Hacked comment',
      };

      mockPrismaService.comment.findUnique.mockResolvedValue(mockComment);

      await expect(
        service.update('1', updateDto, stranger),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if comment not found', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue(null);

      await expect(
        service.update('999', { content: 'Test' }, owner),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete comment if user is owner', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue(mockComment);
      mockPrismaService.comment.delete.mockResolvedValue(mockComment);

      await service.remove('1', owner);

      expect(mockPrismaService.comment.delete).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });

    it('should allow admin to delete any comment', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue(mockComment);
      mockPrismaService.comment.delete.mockResolvedValue(mockComment);

      await service.remove('1', moderator);

      expect(mockPrismaService.comment.delete).toHaveBeenCalled();
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue(mockComment);

      await expect(service.remove('1', stranger)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
