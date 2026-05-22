import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface StageMetric {
  stageId: string;
  stageName: string;
  color: string | null;
  order: number;
  /** Tramos ya cerrados (la actividad entró y salió de la etapa). */
  completedSegments: number;
  /** Duración total/promedio de los tramos cerrados, en milisegundos. */
  totalDurationMs: number;
  avgDurationMs: number;
  /** Actividades que están AHORA mismo en esta etapa (tramo abierto). */
  currentlyInStage: number;
  /** Antigüedad promedio de las que están ahora en la etapa, en ms. */
  avgCurrentAgeMs: number;
}

export interface StageMetricsReport {
  generatedAt: string;
  projectId: string | null;
  projectName: string | null;
  totalActivities: number;
  stages: StageMetric[];
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Métricas de tiempo por etapa a partir de `ActivityStageHistory`.
   * Cada fila del historial es un tramo (enteredAt → exitedAt). Los tramos
   * cerrados alimentan los promedios "ya completados"; los abiertos
   * (exitedAt null) cuentan como "actualmente en esta etapa".
   */
  async stageMetrics(projectId?: string): Promise<StageMetricsReport> {
    const now = Date.now();

    let projectName: string | null = null;
    if (projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true },
      });
      projectName = project?.name ?? null;
    }

    const segments = await this.prisma.activityStageHistory.findMany({
      where: projectId ? { activity: { projectId } } : {},
      select: {
        stageId: true,
        enteredAt: true,
        exitedAt: true,
        activityId: true,
        stage: { select: { name: true, color: true, order: true } },
      },
    });

    // Acumulador por etapa
    const map = new Map<
      string,
      {
        name: string;
        color: string | null;
        order: number;
        totalMs: number;
        completed: number;
        currentCount: number;
        currentAgeMs: number;
      }
    >();

    const activityIds = new Set<string>();
    for (const s of segments) {
      activityIds.add(s.activityId);
      const entry = map.get(s.stageId) ?? {
        name: s.stage.name,
        color: s.stage.color,
        order: s.stage.order,
        totalMs: 0,
        completed: 0,
        currentCount: 0,
        currentAgeMs: 0,
      };
      if (s.exitedAt) {
        entry.totalMs += s.exitedAt.getTime() - s.enteredAt.getTime();
        entry.completed += 1;
      } else {
        entry.currentCount += 1;
        entry.currentAgeMs += now - s.enteredAt.getTime();
      }
      map.set(s.stageId, entry);
    }

    const stages: StageMetric[] = Array.from(map.entries())
      .map(([stageId, v]) => ({
        stageId,
        stageName: v.name,
        color: v.color,
        order: v.order,
        completedSegments: v.completed,
        totalDurationMs: v.totalMs,
        avgDurationMs:
          v.completed > 0 ? Math.round(v.totalMs / v.completed) : 0,
        currentlyInStage: v.currentCount,
        avgCurrentAgeMs:
          v.currentCount > 0 ? Math.round(v.currentAgeMs / v.currentCount) : 0,
      }))
      .sort((a, b) => a.order - b.order);

    return {
      generatedAt: new Date(now).toISOString(),
      projectId: projectId ?? null,
      projectName,
      totalActivities: activityIds.size,
      stages,
    };
  }
}
