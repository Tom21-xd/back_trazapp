import { Test, TestingModule } from '@nestjs/testing';
import { StageChangesService } from './stage-changes.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { StageChangeStatus } from '@prisma/client';

describe('StageChangesService', () => {
  let service: StageChangesService;
  let prisma: PrismaService;

  const mockPrismaService = {
    stageChangeRequest: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    activity: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    stage: {
      findUnique: jest.fn(),
    },
    activityStageHistory: {
      updateMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    stageChangeComment: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockStageChangeRequest = {
    id: '1',
    description: 'Request to change stage',
    status: StageChangeStatus.PENDIENTE,
    activityId: 'activity1',
    fromStageId: 'stage1',
    toStageId: 'stage2',
    requestedById: 'user1',
    reviewedById: null,
    reviewComment: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StageChangesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<StageChangesService>(StageChangesService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createRequest', () => {
    it('should create a stage change request', async () => {
      const createDto = {
        description: 'Need to move to next stage',
        activityId: 'activity1',
        toStageId: 'stage2',
      };

      const mockActivity = {
        id: 'activity1',
        currentStageId: 'stage1',
      };

      mockPrismaService.activity.findUnique.mockResolvedValue(mockActivity);
      mockPrismaService.stage.findUnique.mockResolvedValue({ id: 'stage2' });
      mockPrismaService.stageChangeRequest.create.mockResolvedValue(
        mockStageChangeRequest,
      );

      const result = await service.createRequest(createDto, 'user1');

      expect(result).toBeDefined();
      expect(mockPrismaService.stageChangeRequest.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException if activity not found', async () => {
      const createDto = {
        description: 'Request',
        activityId: 'invalid',
        toStageId: 'stage2',
      };

      mockPrismaService.activity.findUnique.mockResolvedValue(null);

      await expect(service.createRequest(createDto, 'user1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if same stage', async () => {
      const createDto = {
        description: 'Request',
        activityId: 'activity1',
        toStageId: 'stage1',
      };

      const mockActivity = {
        id: 'activity1',
        currentStageId: 'stage1',
      };

      mockPrismaService.activity.findUnique.mockResolvedValue(mockActivity);
      mockPrismaService.stage.findUnique.mockResolvedValue({ id: 'stage1' });

      await expect(service.createRequest(createDto, 'user1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findAll', () => {
    it('should return all stage change requests', async () => {
      const requests = [mockStageChangeRequest];
      mockPrismaService.stageChangeRequest.findMany.mockResolvedValue(requests);

      const result = await service.findAll();

      expect(result).toEqual(requests);
    });

    it('should filter by status', async () => {
      mockPrismaService.stageChangeRequest.findMany.mockResolvedValue([
        mockStageChangeRequest,
      ]);

      await service.findAll({ status: StageChangeStatus.PENDIENTE });

      expect(mockPrismaService.stageChangeRequest.findMany).toHaveBeenCalled();
    });
  });

  describe('reviewRequest', () => {
    it('should approve request and update activity stage', async () => {
      const reviewDto = {
        status: StageChangeStatus.APROBADO,
        reviewComment: 'Approved',
      };

      mockPrismaService.stageChangeRequest.findUnique.mockResolvedValue(
        mockStageChangeRequest,
      );
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback(mockPrismaService);
      });
      mockPrismaService.activityStageHistory.findFirst.mockResolvedValue({
        id: 'history1',
        activityId: 'activity1',
        stageId: 'stage1',
        exitedAt: null,
      });
      mockPrismaService.activityStageHistory.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.activity.update.mockResolvedValue({
        id: 'activity1',
        currentStageId: 'stage2',
      });
      mockPrismaService.activityStageHistory.create.mockResolvedValue({});
      mockPrismaService.stageChangeRequest.update.mockResolvedValue({
        ...mockStageChangeRequest,
        status: StageChangeStatus.APROBADO,
        reviewComment: 'Approved',
      });

      const result = await service.reviewRequest('1', reviewDto, 'admin1');

      expect(result.status).toBe(StageChangeStatus.APROBADO);
      expect(mockPrismaService.activity.update).toHaveBeenCalled();
    });

    it('should reject request without updating activity', async () => {
      const reviewDto = {
        status: StageChangeStatus.RECHAZADO,
        reviewComment: 'Rejected',
      };

      mockPrismaService.stageChangeRequest.findUnique.mockResolvedValue(
        mockStageChangeRequest,
      );
      mockPrismaService.stageChangeRequest.update.mockResolvedValue({
        ...mockStageChangeRequest,
        status: StageChangeStatus.RECHAZADO,
        reviewComment: 'Rejected',
      });

      const result = await service.reviewRequest('1', reviewDto, 'admin1');

      expect(result.status).toBe(StageChangeStatus.RECHAZADO);
      expect(mockPrismaService.activity.update).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if already reviewed', async () => {
      const reviewDto = {
        status: StageChangeStatus.APROBADO,
      };

      const reviewedRequest = {
        ...mockStageChangeRequest,
        status: StageChangeStatus.APROBADO,
      };

      mockPrismaService.stageChangeRequest.findUnique.mockResolvedValue(
        reviewedRequest,
      );

      await expect(
        service.reviewRequest('1', reviewDto, 'admin1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('addComment', () => {
    it('should add comment to stage change request', async () => {
      const commentDto = {
        content: 'Additional information',
      };

      mockPrismaService.stageChangeRequest.findUnique.mockResolvedValue(
        mockStageChangeRequest,
      );
      mockPrismaService.stageChangeComment.create.mockResolvedValue({
        id: '1',
        content: commentDto.content,
        userId: 'user1',
        stageChangeRequestId: '1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.addComment('1', commentDto, 'user1');

      expect(result).toBeDefined();
      expect(result.content).toBe(commentDto.content);
    });

    it('should throw NotFoundException if request not found', async () => {
      const commentDto = {
        content: 'Comment',
      };

      mockPrismaService.stageChangeRequest.findUnique.mockResolvedValue(null);

      await expect(service.addComment('999', commentDto, 'user1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getMyRequests', () => {
    it('should return requests created by user', async () => {
      const userId = 'user1';
      mockPrismaService.stageChangeRequest.findMany.mockResolvedValue([
        mockStageChangeRequest,
      ]);

      const result = await service.getMyRequests(userId);

      expect(result).toBeDefined();
      expect(mockPrismaService.stageChangeRequest.findMany).toHaveBeenCalledWith({
        where: { requestedById: userId },
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
