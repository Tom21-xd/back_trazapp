import { Test, TestingModule } from '@nestjs/testing';
import { StageChangesService } from './stage-changes.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityEventsService } from '../activity-events/activity-events.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { StageChangeStatus } from '@prisma/client';

// Usuario que puede gestionar solicitudes de cualquier actividad
const adminUser = { id: 'user1', permissions: ['stagechange:manage:any'] };

describe('StageChangesService', () => {
  let service: StageChangesService;
  let prisma: PrismaService;
  const mockEvents = { record: jest.fn(), list: jest.fn() };

  const mockPrismaService = {
    stageChangeRequest: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
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
      update: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    stageChangeComment: {
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops) : ops,
    ),
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
        {
          provide: NotificationsService,
          useValue: {
            stageChangeRequested: jest.fn(),
            stageChangeReviewed: jest.fn(),
          },
        },
        { provide: ActivityEventsService, useValue: mockEvents },
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

      const result = await service.createRequest(createDto, adminUser);

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

      await expect(service.createRequest(createDto, adminUser)).rejects.toThrow(
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

      await expect(service.createRequest(createDto, adminUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findAll', () => {
    it('should return all stage change requests', async () => {
      const requests = [mockStageChangeRequest];
      mockPrismaService.stageChangeRequest.findMany.mockResolvedValue(requests);
      mockPrismaService.stageChangeRequest.count.mockResolvedValue(1);

      const result = await service.findAll();

      expect(result.data).toEqual(requests);
      expect(result.meta.total).toBe(1);
    });

    it('should filter by status', async () => {
      mockPrismaService.stageChangeRequest.findMany.mockResolvedValue([
        mockStageChangeRequest,
      ]);
      mockPrismaService.stageChangeRequest.count.mockResolvedValue(1);

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
      mockPrismaService.activityStageHistory.findFirst.mockResolvedValue({
        id: 'history1',
        activityId: 'activity1',
        stageId: 'stage1',
        exitedAt: null,
      });
      mockPrismaService.activityStageHistory.update.mockResolvedValue({});
      mockPrismaService.activity.update.mockResolvedValue({
        id: 'activity1',
        currentStageId: 'stage2',
      });
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

      const result = await service.addComment('1', commentDto, adminUser);

      expect(result).toBeDefined();
      expect(result.content).toBe(commentDto.content);
    });

    it('should throw NotFoundException if request not found', async () => {
      const commentDto = {
        content: 'Comment',
      };

      mockPrismaService.stageChangeRequest.findUnique.mockResolvedValue(null);

      await expect(
        service.addComment('999', commentDto, adminUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelRequest', () => {
    const ownerUser = {
      id: 'user1',
      permissions: ['stagechange:create'] as string[],
    };
    const strangerUser = {
      id: 'user99',
      permissions: ['stagechange:create'] as string[],
    };
    const managerUser = {
      id: 'admin1',
      permissions: ['stagechange:manage:any'] as string[],
    };

    it('marca la solicitud como CANCELADO si es del usuario', async () => {
      mockPrismaService.stageChangeRequest.findUnique.mockResolvedValue(
        mockStageChangeRequest,
      );
      mockPrismaService.stageChangeRequest.update.mockResolvedValue({
        ...mockStageChangeRequest,
        status: StageChangeStatus.CANCELADO,
      });

      const result = await service.cancelRequest('1', ownerUser);

      expect(result.status).toBe(StageChangeStatus.CANCELADO);
      expect(mockPrismaService.stageChangeRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: '1' },
          data: { status: StageChangeStatus.CANCELADO },
        }),
      );
      expect(mockEvents.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'STAGE_CHANGE_CANCELLED',
          actorId: ownerUser.id,
          stageChangeRequestId: '1',
        }),
      );
    });

    it('permite a un manager cancelar solicitudes ajenas', async () => {
      mockPrismaService.stageChangeRequest.findUnique.mockResolvedValue(
        mockStageChangeRequest,
      );
      mockPrismaService.stageChangeRequest.update.mockResolvedValue({
        ...mockStageChangeRequest,
        status: StageChangeStatus.CANCELADO,
      });

      const result = await service.cancelRequest('1', managerUser);
      expect(result.status).toBe(StageChangeStatus.CANCELADO);
    });

    it('rechaza si la solicitud ya no está pendiente', async () => {
      mockPrismaService.stageChangeRequest.findUnique.mockResolvedValue({
        ...mockStageChangeRequest,
        status: StageChangeStatus.APROBADO,
      });

      await expect(
        service.cancelRequest('1', ownerUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza si no es el solicitante ni manager', async () => {
      mockPrismaService.stageChangeRequest.findUnique.mockResolvedValue(
        mockStageChangeRequest,
      );

      await expect(
        service.cancelRequest('1', strangerUser),
      ).rejects.toThrow('No puedes cancelar');
    });
  });

  describe('timeline events', () => {
    it('registra STAGE_CHANGE_REQUESTED en createRequest', async () => {
      mockPrismaService.activity.findUnique.mockResolvedValue({
        id: 'activity1',
        title: 'A',
        currentStageId: 'stage1',
      });
      mockPrismaService.stage.findUnique.mockResolvedValue({ id: 'stage2' });
      mockPrismaService.stageChangeRequest.create.mockResolvedValue({
        ...mockStageChangeRequest,
        id: 'req-new',
      });
      mockPrismaService.user.findUnique.mockResolvedValue({ name: 'Pepe' });

      await service.createRequest(
        {
          activityId: 'activity1',
          toStageId: 'stage2',
          description: 'porfis',
        },
        adminUser,
      );

      expect(mockEvents.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'STAGE_CHANGE_REQUESTED',
          activityId: 'activity1',
          actorId: adminUser.id,
          fromStageId: 'stage1',
          toStageId: 'stage2',
          stageChangeRequestId: 'req-new',
        }),
      );
    });

    it('registra STAGE_CHANGE_APPROVED en review approve', async () => {
      mockPrismaService.stageChangeRequest.findUnique.mockResolvedValue(
        mockStageChangeRequest,
      );
      mockPrismaService.activityStageHistory.findFirst.mockResolvedValue(null);
      mockPrismaService.activity.update.mockResolvedValue({});
      mockPrismaService.stageChangeRequest.update.mockResolvedValue({
        ...mockStageChangeRequest,
        status: StageChangeStatus.APROBADO,
      });

      await service.reviewRequest(
        '1',
        { status: StageChangeStatus.APROBADO, reviewComment: 'ok' },
        'reviewer1',
      );

      expect(mockEvents.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'STAGE_CHANGE_APPROVED',
          actorId: 'reviewer1',
          stageChangeRequestId: '1',
        }),
      );
    });

    it('registra STAGE_CHANGE_REJECTED en review reject', async () => {
      mockPrismaService.stageChangeRequest.findUnique.mockResolvedValue(
        mockStageChangeRequest,
      );
      mockPrismaService.stageChangeRequest.update.mockResolvedValue({
        ...mockStageChangeRequest,
        status: StageChangeStatus.RECHAZADO,
      });

      await service.reviewRequest(
        '1',
        { status: StageChangeStatus.RECHAZADO, reviewComment: 'no' },
        'reviewer1',
      );

      expect(mockEvents.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'STAGE_CHANGE_REJECTED',
          actorId: 'reviewer1',
        }),
      );
    });
  });

  describe('getMyRequests', () => {
    it('should return requests created by user', async () => {
      const userId = 'user1';
      mockPrismaService.stageChangeRequest.findMany.mockResolvedValue([
        mockStageChangeRequest,
      ]);
      mockPrismaService.stageChangeRequest.count.mockResolvedValue(1);

      const result = await service.getMyRequests(userId);

      expect(result.data).toBeDefined();
      expect(result.meta.total).toBe(1);
      expect(mockPrismaService.stageChangeRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { requestedById: userId },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });
});
