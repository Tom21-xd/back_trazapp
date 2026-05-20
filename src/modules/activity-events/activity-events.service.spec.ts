import { Test, TestingModule } from '@nestjs/testing';
import { ActivityEventsService } from './activity-events.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ActivityEventsService', () => {
  let service: ActivityEventsService;

  const mockPrisma = {
    activityEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(async (ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops) : ops,
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityEventsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ActivityEventsService>(ActivityEventsService);
    jest.clearAllMocks();
  });

  describe('record', () => {
    it('persiste un evento con los campos enviados', async () => {
      mockPrisma.activityEvent.create.mockResolvedValue({ id: 'e1' });

      await service.record({
        activityId: 'a1',
        type: 'ASSIGNED',
        actorId: 'admin1',
        targetUserId: 'user2',
        note: 'asignó a user2',
      });

      expect(mockPrisma.activityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          activityId: 'a1',
          type: 'ASSIGNED',
          actorId: 'admin1',
          targetUserId: 'user2',
          note: 'asignó a user2',
        }),
      });
    });

    it('nunca propaga errores (best-effort)', async () => {
      mockPrisma.activityEvent.create.mockRejectedValue(new Error('DB down'));

      await expect(
        service.record({
          activityId: 'a1',
          type: 'CREATED',
          actorId: 'admin1',
        }),
      ).resolves.toBeUndefined();
    });

    it('normaliza nullables a null', async () => {
      mockPrisma.activityEvent.create.mockResolvedValue({ id: 'e1' });

      await service.record({
        activityId: 'a1',
        type: 'CREATED',
        actorId: 'admin1',
      });

      expect(mockPrisma.activityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          targetUserId: null,
          fromStageId: null,
          toStageId: null,
          stageChangeRequestId: null,
          commentId: null,
          fileId: null,
        }),
      });
    });
  });

  describe('list', () => {
    it('devuelve los eventos paginados de la actividad', async () => {
      const events = [
        { id: 'e1', type: 'CREATED', actor: { id: 'u1' } },
        { id: 'e2', type: 'COMMENT_ADDED', actor: { id: 'u1' } },
      ];
      mockPrisma.activityEvent.findMany.mockResolvedValue(events);
      mockPrisma.activityEvent.count.mockResolvedValue(2);

      const result = await service.list('a1');

      expect(result.data).toEqual(events);
      expect(result.meta.total).toBe(2);
      expect(mockPrisma.activityEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { activityId: 'a1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('soporta paginación all=true', async () => {
      mockPrisma.activityEvent.findMany.mockResolvedValue([]);
      mockPrisma.activityEvent.count.mockResolvedValue(0);

      await service.list('a1', { all: 'true' });

      const call = mockPrisma.activityEvent.findMany.mock.calls[0][0];
      expect(call).not.toHaveProperty('skip');
      expect(call).not.toHaveProperty('take');
    });
  });
});
