import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';

const HOUR = 60 * 60 * 1000;

describe('ReportsService', () => {
  let service: ReportsService;

  const mockPrisma = {
    project: { findUnique: jest.fn() },
    activityStageHistory: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<ReportsService>(ReportsService);
    jest.clearAllMocks();
  });

  it('promedia la duración de tramos cerrados por etapa', async () => {
    const base = new Date('2026-01-01T00:00:00Z');
    const stage = { name: 'En Progreso', color: '#3B82F6', order: 1 };
    mockPrisma.activityStageHistory.findMany.mockResolvedValue([
      {
        stageId: 's1',
        activityId: 'a1',
        enteredAt: base,
        exitedAt: new Date(base.getTime() + 2 * HOUR), // 2h
        stage,
      },
      {
        stageId: 's1',
        activityId: 'a2',
        enteredAt: base,
        exitedAt: new Date(base.getTime() + 4 * HOUR), // 4h
        stage,
      },
    ]);

    const report = await service.stageMetrics();
    expect(report.stages).toHaveLength(1);
    const s = report.stages[0];
    expect(s.completedSegments).toBe(2);
    expect(s.avgDurationMs).toBe(3 * HOUR); // (2h + 4h) / 2
    expect(s.totalDurationMs).toBe(6 * HOUR);
    expect(s.currentlyInStage).toBe(0);
    expect(report.totalActivities).toBe(2);
  });

  it('cuenta tramos abiertos como "actualmente en etapa"', async () => {
    const tenHoursAgo = new Date(Date.now() - 10 * HOUR);
    mockPrisma.activityStageHistory.findMany.mockResolvedValue([
      {
        stageId: 's2',
        activityId: 'a3',
        enteredAt: tenHoursAgo,
        exitedAt: null,
        stage: { name: 'En Revisión', color: null, order: 2 },
      },
    ]);

    const report = await service.stageMetrics();
    const s = report.stages[0];
    expect(s.completedSegments).toBe(0);
    expect(s.avgDurationMs).toBe(0);
    expect(s.currentlyInStage).toBe(1);
    // Antigüedad ~10h (con tolerancia por el tiempo de ejecución)
    expect(s.avgCurrentAgeMs).toBeGreaterThanOrEqual(10 * HOUR - 5000);
    expect(s.avgCurrentAgeMs).toBeLessThanOrEqual(10 * HOUR + 5000);
  });

  it('ordena las etapas por su "order" y resuelve el nombre del proyecto', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ name: 'Proyecto X' });
    mockPrisma.activityStageHistory.findMany.mockResolvedValue([
      {
        stageId: 'b',
        activityId: 'a1',
        enteredAt: new Date(),
        exitedAt: new Date(),
        stage: { name: 'Completado', color: null, order: 3 },
      },
      {
        stageId: 'a',
        activityId: 'a1',
        enteredAt: new Date(),
        exitedAt: new Date(),
        stage: { name: 'Pendiente', color: null, order: 0 },
      },
    ]);

    const report = await service.stageMetrics('proj-1');
    expect(report.projectName).toBe('Proyecto X');
    expect(report.projectId).toBe('proj-1');
    expect(report.stages.map((s) => s.order)).toEqual([0, 3]);
    expect(mockPrisma.activityStageHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { activity: { projectId: 'proj-1' } },
      }),
    );
  });

  it('devuelve un informe vacío cuando no hay historial', async () => {
    mockPrisma.activityStageHistory.findMany.mockResolvedValue([]);
    const report = await service.stageMetrics();
    expect(report.stages).toEqual([]);
    expect(report.totalActivities).toBe(0);
  });
});
