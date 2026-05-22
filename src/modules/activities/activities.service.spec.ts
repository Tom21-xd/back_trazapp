import { Test, TestingModule } from '@nestjs/testing';
import { ActivitiesService } from './activities.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityEventsService } from '../activity-events/activity-events.service';
import { NotFoundException } from '@nestjs/common';
import { Priority } from '@prisma/client';

describe('ActivitiesService', () => {
  let service: ActivitiesService;
  const mockEvents = { record: jest.fn(), list: jest.fn() };

  const mockPrisma = {
    activity: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    project: { findUnique: jest.fn() },
    stage: { findUnique: jest.fn() },
    activityAssignment: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      delete: jest.fn(),
    },
    activityTag: { deleteMany: jest.fn(), createMany: jest.fn() },
    activityDependency: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      count: jest.fn(),
    },
    activityStageHistory: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
    user: { count: jest.fn() },
    tag: { count: jest.fn() },
    $transaction: jest.fn(async (arg: any) =>
      typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg),
    ),
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
        {
          provide: NotificationsService,
          useValue: {
            activityAssigned: jest.fn(),
            activityUnassigned: jest.fn(),
            stageChanged: jest.fn(),
            stageChangeRequested: jest.fn(),
            stageChangeReviewed: jest.fn(),
            newComment: jest.fn(),
          },
        },
        { provide: ActivityEventsService, useValue: mockEvents },
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
    it('should return paginated activities', async () => {
      mockPrisma.activity.findMany.mockResolvedValue([mockActivity]);
      mockPrisma.activity.count.mockResolvedValue(1);

      const result = await service.findAll();

      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toEqual([mockActivity]);
      expect(result.meta.total).toBe(1);
      expect(mockPrisma.activity.findMany).toHaveBeenCalled();
    });

    it('should filter by projectId', async () => {
      mockPrisma.activity.findMany.mockResolvedValue([mockActivity]);
      mockPrisma.activity.count.mockResolvedValue(1);

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
      // update() ahora reconsulta con findOne() al final (devuelve historial completo)
      mockPrisma.activity.findUnique.mockResolvedValue({
        ...mockActivity,
        title: 'Updated',
      });
      mockPrisma.activity.update.mockResolvedValue({
        ...mockActivity,
        title: 'Updated',
      });

      const result = await service.update('1', { title: 'Updated' }, 'admin1');

      expect(result.title).toBe('Updated');
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.activity.update).toHaveBeenCalled();
    });

    it('should change stage and record history atomically', async () => {
      mockPrisma.activity.findUnique.mockResolvedValue({
        ...mockActivity,
        currentStageId: 'stage1',
      });
      mockPrisma.stage.findUnique.mockResolvedValue({ id: 'stage2' });
      mockPrisma.activityStageHistory.findFirst.mockResolvedValue({
        id: 'h1',
        activityId: '1',
        exitedAt: null,
      });
      mockPrisma.activityStageHistory.update.mockResolvedValue({});
      mockPrisma.activityStageHistory.create.mockResolvedValue({});
      mockPrisma.activity.update.mockResolvedValue({
        ...mockActivity,
        currentStageId: 'stage2',
      });

      await service.update('1', { currentStageId: 'stage2' }, 'admin1');

      expect(mockPrisma.activityStageHistory.update).toHaveBeenCalledWith({
        where: { id: 'h1' },
        data: { exitedAt: expect.any(Date) },
      });
      expect(mockPrisma.activityStageHistory.create).toHaveBeenCalled();
    });
  });

  describe('remove (soft-delete)', () => {
    it('archiva la actividad (isActive=false) y registra evento DELETED', async () => {
      mockPrisma.activity.findUnique.mockResolvedValue({
        ...mockActivity,
        isActive: true,
      });
      mockPrisma.activityDependency.count.mockResolvedValue(0);
      mockPrisma.activity.update.mockResolvedValue({
        ...mockActivity,
        isActive: false,
      });

      const result = await service.remove('1', 'admin1');

      expect(result.message).toBe('Actividad archivada exitosamente');
      expect(mockPrisma.activity.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { isActive: false },
      });
      expect(mockEvents.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DELETED',
          activityId: '1',
          actorId: 'admin1',
        }),
      );
    });

    it('rechaza archivar una actividad ya archivada', async () => {
      mockPrisma.activity.findUnique.mockResolvedValue({
        ...mockActivity,
        isActive: false,
      });
      await expect(service.remove('1', 'admin1')).rejects.toThrow(
        'ya está archivada',
      );
    });

    it('rechaza archivar si tiene dependencias activas', async () => {
      mockPrisma.activity.findUnique.mockResolvedValue({
        ...mockActivity,
        isActive: true,
      });
      mockPrisma.activityDependency.count.mockResolvedValue(3);
      await expect(service.remove('1', 'admin1')).rejects.toThrow(
        'dependen otras activas',
      );
    });
  });

  describe('guards de archivada', () => {
    it('update rechaza cuando la actividad está archivada', async () => {
      mockPrisma.activity.findUnique.mockResolvedValue({
        ...mockActivity,
        isActive: false,
      });
      await expect(
        service.update('1', { title: 'X' }, 'admin1'),
      ).rejects.toThrow('archivada');
    });

    it('assignUsers rechaza cuando la actividad está archivada', async () => {
      mockPrisma.activity.findUnique.mockResolvedValue({
        ...mockActivity,
        isActive: false,
        assignments: [],
      });
      await expect(
        service.assignUsers('1', { userIds: ['u1'] }, 'admin1'),
      ).rejects.toThrow('archivada');
    });

    it('unassignUser rechaza cuando la actividad está archivada', async () => {
      mockPrisma.activity.findUnique.mockResolvedValue({
        ...mockActivity,
        isActive: false,
      });
      await expect(service.unassignUser('1', 'u1', 'admin1')).rejects.toThrow(
        'archivada',
      );
    });
  });

  describe('timeline events', () => {
    it('registra CREATED + ASSIGNED en create', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'project1' });
      mockPrisma.stage.findUnique.mockResolvedValue({ id: 'stage1' });
      mockPrisma.user.count.mockResolvedValue(2);
      mockPrisma.activity.create.mockResolvedValue({
        ...mockActivity,
        id: 'a-new',
      });

      await service.create(
        {
          title: 'New',
          projectId: 'project1',
          currentStageId: 'stage1',
          assignedUserIds: ['u1', 'u2'],
        },
        'admin1',
      );

      const types = mockEvents.record.mock.calls.map((c) => c[0].type);
      expect(types).toContain('CREATED');
      expect(
        mockEvents.record.mock.calls.filter((c) => c[0].type === 'ASSIGNED'),
      ).toHaveLength(2);
    });

    it('registra STAGE_CHANGED en update cuando cambia la etapa', async () => {
      mockPrisma.activity.findUnique.mockResolvedValue({
        ...mockActivity,
        currentStageId: 'stage1',
        assignments: [],
      });
      mockPrisma.stage.findUnique.mockResolvedValue({ id: 'stage2' });
      mockPrisma.activityStageHistory.findFirst.mockResolvedValue(null);
      mockPrisma.activity.update.mockResolvedValue({});

      await service.update('1', { currentStageId: 'stage2' }, 'admin1');

      expect(mockEvents.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'STAGE_CHANGED',
          fromStageId: 'stage1',
          toStageId: 'stage2',
          actorId: 'admin1',
        }),
      );
    });

    it('registra UPDATED con diff cuando cambia título', async () => {
      mockPrisma.activity.findUnique.mockResolvedValue({
        ...mockActivity,
        assignments: [],
      });
      mockPrisma.activity.update.mockResolvedValue({});

      await service.update('1', { title: 'Nuevo título' }, 'admin1');

      const updatedCall = mockEvents.record.mock.calls.find(
        (c) => c[0].type === 'UPDATED',
      );
      expect(updatedCall).toBeDefined();
      expect(updatedCall![0].metadata).toMatchObject({
        fields: {
          title: { from: mockActivity.title, to: 'Nuevo título' },
        },
      });
    });

    it('registra ASSIGNED/UNASSIGNED en assignUsers con diff', async () => {
      mockPrisma.activity.findUnique.mockResolvedValue({
        ...mockActivity,
        assignments: [{ userId: 'u1' }, { userId: 'u2' }],
      });
      mockPrisma.user.count.mockResolvedValue(2);
      mockPrisma.activityAssignment.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.activityAssignment.createMany.mockResolvedValue({ count: 0 });

      await service.assignUsers('1', { userIds: ['u2', 'u3'] }, 'admin1');

      const assigned = mockEvents.record.mock.calls.filter(
        (c) => c[0].type === 'ASSIGNED',
      );
      const unassigned = mockEvents.record.mock.calls.filter(
        (c) => c[0].type === 'UNASSIGNED',
      );
      expect(assigned).toHaveLength(1);
      expect(assigned[0][0].targetUserId).toBe('u3');
      expect(unassigned).toHaveLength(1);
      expect(unassigned[0][0].targetUserId).toBe('u1');
    });

    it('registra UNASSIGNED en unassignUser cuando había asignación', async () => {
      mockPrisma.activity.findUnique.mockResolvedValue(mockActivity);
      mockPrisma.activityAssignment.deleteMany.mockResolvedValue({ count: 1 });

      await service.unassignUser('1', 'u1', 'admin1');

      expect(mockEvents.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'UNASSIGNED',
          targetUserId: 'u1',
          actorId: 'admin1',
        }),
      );
    });
  });

  describe('listEvents', () => {
    it('delega en ActivityEventsService.list tras pasar el scoping', async () => {
      mockPrisma.activity.findUnique.mockResolvedValue({
        ...mockActivity,
        assignments: [],
      });
      mockEvents.list.mockResolvedValue({ data: [], meta: { total: 0 } });

      await service.listEvents(
        '1',
        { id: 'admin1', permissions: ['activity:read:any'] },
        {},
      );

      expect(mockEvents.list).toHaveBeenCalledWith('1', {});
    });
  });

  describe('getMyActivities', () => {
    it('should return paginated activities assigned to user', async () => {
      mockPrisma.activity.findMany.mockResolvedValue([mockActivity]);
      mockPrisma.activity.count.mockResolvedValue(1);

      const result = await service.getMyActivities('user1');

      expect(Array.isArray(result.data)).toBe(true);
      expect(result.meta.total).toBe(1);
      expect(mockPrisma.activity.findMany).toHaveBeenCalled();
    });
  });
});
