/**
 * Seed de DEMO rico — escenario realista de la Alcaldía con trazabilidad completa.
 *
 * Genera proyectos, actividades con historial de etapas, reasignaciones
 * (una tarea que cambia de manos), solicitudes de cambio aprobadas/rechazadas/
 * canceladas/pendientes, comentarios y una línea de tiempo inmutable
 * (ActivityEvent) coherente con marcas de tiempo creíbles.
 *
 * Es IDEMPOTENTE para los datos de demo: borra y recrea todo lo marcado con
 * el prefijo "[DEMO]" antes de poblar. No toca datos reales.
 *
 *   npm run db:seed            (estructura base: permisos, roles, etapas…)
 *   npm run seed:demo-data     (este archivo: datos de ejemplo)
 */
import { PrismaClient, StageChangeStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_PREFIX = '[DEMO]';
const now = new Date();
/** Devuelve una fecha `d` días atrás (con offset opcional de horas). */
const ago = (d: number, h = 0) =>
  new Date(now.getTime() - d * 86_400_000 + h * 3_600_000);

// ── Usuarios de demo (trabajadores adicionales para repartir las tareas) ──
const DEMO_WORKERS = [
  { email: 'ana@trazapp.com', name: 'Ana Gómez', phone: '+57 310 555 0101' },
  {
    email: 'carlos@trazapp.com',
    name: 'Carlos Ruiz',
    phone: '+57 310 555 0102',
  },
  {
    email: 'lucia@trazapp.com',
    name: 'Lucía Martínez',
    phone: '+57 310 555 0103',
  },
];

async function getRoleId(name: string) {
  const role = await prisma.appRole.findUnique({
    where: { name },
    select: { id: true },
  });
  if (!role) throw new Error(`Rol "${name}" no existe. Corre antes: npm run db:seed`);
  return role.id;
}

async function getStageMap() {
  const stages = await prisma.stage.findMany({
    select: { id: true, name: true, order: true },
  });
  const byName = new Map(stages.map((s) => [s.name, s]));
  for (const n of ['Pendiente', 'En Progreso', 'En Revisión', 'Completado']) {
    if (!byName.has(n)) throw new Error(`Falta la etapa "${n}". Corre: npm run db:seed`);
  }
  return byName;
}

async function getTagMap() {
  const tags = await prisma.tag.findMany({ select: { id: true, name: true } });
  return new Map(tags.map((t) => [t.name, t.id]));
}

/** Borra todo lo marcado [DEMO] (cascada limpia actividades, eventos, etc.). */
async function wipeDemo() {
  const deleted = await prisma.project.deleteMany({
    where: { name: { startsWith: DEMO_PREFIX } },
  });
  // Notificaciones de demo no cuelgan de proyecto: limpiarlas por marca.
  await prisma.notification.deleteMany({
    where: { metadata: { path: ['demo'], equals: true } },
  });
  console.log(`Limpieza: ${deleted.count} proyecto(s) [DEMO] eliminados.`);
}

async function upsertWorkers(trabajadorRoleId: string) {
  const ids: Record<string, string> = {};
  const password = await bcrypt.hash('demo1234', 10);
  for (const w of DEMO_WORKERS) {
    const user = await prisma.user.upsert({
      where: { email: w.email },
      update: { name: w.name, phone: w.phone, isActive: true },
      create: {
        email: w.email,
        name: w.name,
        phone: w.phone,
        password,
        isActive: true,
        appRoleId: trabajadorRoleId,
      },
      select: { id: true },
    });
    ids[w.email] = user.id;
  }
  return ids;
}

// ── Helper de ciclo de vida de una actividad (mantiene el estado local) ──
class ActivityFlow {
  private currentStageId: string;
  private historyOpenId!: string;

  private constructor(
    public readonly activityId: string,
    initialStageId: string,
  ) {
    this.currentStageId = initialStageId;
  }

  /** Crea la actividad + 1ª entrada de historial + evento CREATED. */
  static async create(opts: {
    projectId: string;
    title: string;
    description: string;
    priority: 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE';
    stageId: string;
    creatorId: string;
    createdAt: Date;
    dueDate?: Date;
    tagIds?: string[];
  }) {
    const activity = await prisma.activity.create({
      data: {
        title: opts.title,
        description: opts.description,
        priority: opts.priority,
        dueDate: opts.dueDate,
        projectId: opts.projectId,
        currentStageId: opts.stageId,
        createdAt: opts.createdAt,
        tags: opts.tagIds?.length
          ? { create: opts.tagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
    });
    const history = await prisma.activityStageHistory.create({
      data: {
        activityId: activity.id,
        stageId: opts.stageId,
        enteredAt: opts.createdAt,
        notes: 'Etapa inicial',
      },
    });
    const flow = new ActivityFlow(activity.id, opts.stageId);
    flow.historyOpenId = history.id;
    await prisma.activityEvent.create({
      data: {
        activityId: activity.id,
        type: 'CREATED',
        actorId: opts.creatorId,
        createdAt: opts.createdAt,
        note: 'Actividad creada',
      },
    });
    return flow;
  }

  async assign(userId: string, actorId: string, when: Date) {
    await prisma.activityAssignment.create({
      data: { userId, activityId: this.activityId, assignedAt: when },
    });
    await prisma.activityEvent.create({
      data: {
        activityId: this.activityId,
        type: 'ASSIGNED',
        actorId,
        targetUserId: userId,
        createdAt: when,
      },
    });
  }

  async unassign(userId: string, actorId: string, when: Date, reason: string) {
    await prisma.activityAssignment.deleteMany({
      where: { userId, activityId: this.activityId },
    });
    await prisma.activityEvent.create({
      data: {
        activityId: this.activityId,
        type: 'UNASSIGNED',
        actorId,
        targetUserId: userId,
        createdAt: when,
        note: reason,
      },
    });
  }

  async comment(userId: string, content: string, when: Date) {
    const comment = await prisma.comment.create({
      data: { content, userId, activityId: this.activityId, createdAt: when },
    });
    await prisma.activityEvent.create({
      data: {
        activityId: this.activityId,
        type: 'COMMENT_ADDED',
        actorId: userId,
        commentId: comment.id,
        createdAt: when,
        note: content.slice(0, 120),
      },
    });
  }

  /** Solicitud de cambio de etapa + revisión (aprobada/rechazada). */
  async requestChange(opts: {
    toStageId: string;
    requesterId: string;
    requestedAt: Date;
    description: string;
    review: 'APROBADO' | 'RECHAZADO' | 'PENDIENTE' | 'CANCELADO';
    reviewerId?: string;
    reviewedAt?: Date;
    reviewComment?: string;
  }) {
    const fromStageId = this.currentStageId;
    const statusMap = {
      APROBADO: StageChangeStatus.APROBADO,
      RECHAZADO: StageChangeStatus.RECHAZADO,
      PENDIENTE: StageChangeStatus.PENDIENTE,
      CANCELADO: StageChangeStatus.CANCELADO,
    };
    const request = await prisma.stageChangeRequest.create({
      data: {
        description: opts.description,
        status: statusMap[opts.review],
        activityId: this.activityId,
        fromStageId,
        toStageId: opts.toStageId,
        requestedById: opts.requesterId,
        reviewedById: opts.reviewerId,
        reviewedAt: opts.reviewedAt,
        reviewComment: opts.reviewComment,
        createdAt: opts.requestedAt,
      },
    });
    await prisma.activityEvent.create({
      data: {
        activityId: this.activityId,
        type: 'STAGE_CHANGE_REQUESTED',
        actorId: opts.requesterId,
        fromStageId,
        toStageId: opts.toStageId,
        stageChangeRequestId: request.id,
        createdAt: opts.requestedAt,
        note: opts.description.slice(0, 160),
      },
    });

    if (opts.review === 'APROBADO' && opts.reviewerId && opts.reviewedAt) {
      // Cerrar historial actual, abrir el nuevo y mover la actividad
      await prisma.activityStageHistory.update({
        where: { id: this.historyOpenId },
        data: { exitedAt: opts.reviewedAt },
      });
      const newHistory = await prisma.activityStageHistory.create({
        data: {
          activityId: this.activityId,
          stageId: opts.toStageId,
          enteredAt: opts.reviewedAt,
          notes: `Cambio aprobado: ${opts.reviewComment ?? 'Sin comentarios'}`,
        },
      });
      this.historyOpenId = newHistory.id;
      this.currentStageId = opts.toStageId;
      await prisma.activity.update({
        where: { id: this.activityId },
        data: { currentStageId: opts.toStageId, updatedAt: opts.reviewedAt },
      });
      await prisma.activityEvent.createMany({
        data: [
          {
            activityId: this.activityId,
            type: 'STAGE_CHANGE_APPROVED',
            actorId: opts.reviewerId,
            fromStageId,
            toStageId: opts.toStageId,
            stageChangeRequestId: request.id,
            createdAt: opts.reviewedAt,
            note: opts.reviewComment,
          },
          {
            activityId: this.activityId,
            type: 'STAGE_CHANGED',
            actorId: opts.reviewerId,
            fromStageId,
            toStageId: opts.toStageId,
            createdAt: opts.reviewedAt,
          },
        ],
      });
    } else if (opts.review === 'RECHAZADO' && opts.reviewerId && opts.reviewedAt) {
      await prisma.activityEvent.create({
        data: {
          activityId: this.activityId,
          type: 'STAGE_CHANGE_REJECTED',
          actorId: opts.reviewerId,
          fromStageId,
          toStageId: opts.toStageId,
          stageChangeRequestId: request.id,
          createdAt: opts.reviewedAt,
          note: opts.reviewComment,
        },
      });
    } else if (opts.review === 'CANCELADO') {
      await prisma.activityEvent.create({
        data: {
          activityId: this.activityId,
          type: 'STAGE_CHANGE_CANCELLED',
          actorId: opts.requesterId,
          fromStageId,
          toStageId: opts.toStageId,
          stageChangeRequestId: request.id,
          createdAt: opts.reviewedAt ?? opts.requestedAt,
        },
      });
    }
    return request;
  }
}

async function main() {
  console.log('Sembrando datos de DEMO…\n');

  const [adminRoleId, supervisorRoleId, trabajadorRoleId] = await Promise.all([
    getRoleId('Administrador'),
    getRoleId('Supervisor'),
    getRoleId('Trabajador'),
  ]);

  const admin = await prisma.user.findUnique({
    where: { email: 'admin@trazapp.com' },
    select: { id: true },
  });
  if (!admin) throw new Error('Falta admin@trazapp.com. Corre: npm run db:seed');

  // Supervisor demo (revisor de las solicitudes)
  const supervisor = await prisma.user.upsert({
    where: { email: 'supervisor@trazapp.com' },
    update: { isActive: true, appRoleId: supervisorRoleId },
    create: {
      email: 'supervisor@trazapp.com',
      name: 'Supervisor Demo',
      password: await bcrypt.hash('supervisor123', 10),
      isActive: true,
      appRoleId: supervisorRoleId,
    },
    select: { id: true },
  });

  await wipeDemo();
  const workers = await upsertWorkers(trabajadorRoleId);
  const stages = await getStageMap();
  const tags = await getTagMap();

  const sPend = stages.get('Pendiente')!.id;
  const sProg = stages.get('En Progreso')!.id;
  const sRev = stages.get('En Revisión')!.id;
  const sDone = stages.get('Completado')!.id;

  // ── Tipos de proyecto ──
  const tipos = [
    { name: 'Obras Públicas', color: '#F97316', description: 'Infraestructura y obra civil' },
    { name: 'Salud', color: '#10B981', description: 'Programas y campañas de salud' },
    { name: 'Tecnología', color: '#6366F1', description: 'Transformación digital' },
  ];
  const tipoIds: Record<string, string> = {};
  for (const t of tipos) {
    const pt = await prisma.projectType.upsert({
      where: { name: t.name },
      update: { color: t.color, description: t.description, isActive: true },
      create: t,
      select: { id: true },
    });
    tipoIds[t.name] = pt.id;
  }

  // ── Proyecto 1: Obra con la historia de reasignación (el "core") ──
  const proyObra = await prisma.project.create({
    data: {
      name: `${DEMO_PREFIX} Pavimentación Avenida Principal`,
      description:
        'Repavimentación de 2.3 km de la avenida principal del casco urbano, incluye estudios técnicos, ejecución e interventoría.',
      status: 'EN_PROGRESO',
      startDate: ago(25),
      endDate: ago(-40),
      projectTypeId: tipoIds['Obras Públicas'],
      createdAt: ago(25),
    },
  });

  // ACTIVIDAD ESTRELLA: cambia de manos (Carlos → Ana), pasa etapas y la
  // devuelven una vez. Demuestra trazabilidad completa de un traspaso.
  const estudio = await ActivityFlow.create({
    projectId: proyObra.id,
    title: 'Estudio de suelos — Tramo 1',
    description:
      'Calicatas y ensayos de laboratorio para caracterizar el suelo del primer tramo antes de diseñar el pavimento.',
    priority: 'ALTA',
    stageId: sPend,
    creatorId: admin.id,
    createdAt: ago(22),
    dueDate: ago(-5),
    tagIds: [tags.get('Urgente')].filter(Boolean) as string[],
  });
  await estudio.assign(workers['carlos@trazapp.com'], admin.id, ago(22, 1));
  await estudio.comment(
    workers['carlos@trazapp.com'],
    'Recibido. Coordino con laboratorio para iniciar calicatas esta semana.',
    ago(21),
  );
  await estudio.requestChange({
    toStageId: sProg,
    requesterId: workers['carlos@trazapp.com'],
    requestedAt: ago(21, 2),
    description: 'Inicio de trabajos de campo, ya en sitio.',
    review: 'APROBADO',
    reviewerId: supervisor.id,
    reviewedAt: ago(20),
    reviewComment: 'Adelante, registra avances con fotos.',
  });
  await estudio.comment(
    workers['carlos@trazapp.com'],
    'Tres calicatas completadas. Muestras enviadas a laboratorio.',
    ago(17),
  );
  await estudio.requestChange({
    toStageId: sRev,
    requesterId: workers['carlos@trazapp.com'],
    requestedAt: ago(15),
    description: 'Informe preliminar listo para revisión técnica.',
    review: 'APROBADO',
    reviewerId: supervisor.id,
    reviewedAt: ago(14),
    reviewComment: 'Recibido, lo reviso.',
  });
  // ── Traspaso: a Carlos lo reasignan a otra obra; entra Ana ──
  await estudio.unassign(
    workers['carlos@trazapp.com'],
    admin.id,
    ago(12),
    'Reasignado a la obra del puente; releva Ana Gómez.',
  );
  await estudio.assign(workers['ana@trazapp.com'], admin.id, ago(12, 1));
  await estudio.comment(
    workers['ana@trazapp.com'],
    'Tomo la actividad. Revisando el historial y el informe que dejó Carlos.',
    ago(11),
  );
  // ── La DEVUELVEN: faltan ensayos, vuelve a En Progreso ──
  await estudio.requestChange({
    toStageId: sProg,
    requesterId: supervisor.id,
    requestedAt: ago(10),
    description:
      'Faltan los ensayos de compactación Proctor. Devuelvo a En Progreso para completarlos.',
    review: 'APROBADO',
    reviewerId: supervisor.id,
    reviewedAt: ago(10),
    reviewComment: 'Completar ensayos pendientes.',
  });
  await estudio.comment(
    workers['ana@trazapp.com'],
    'Ensayos Proctor completados y adjuntados al informe final.',
    ago(6),
  );
  await estudio.requestChange({
    toStageId: sRev,
    requesterId: workers['ana@trazapp.com'],
    requestedAt: ago(5),
    description: 'Informe final completo con todos los ensayos.',
    review: 'APROBADO',
    reviewerId: supervisor.id,
    reviewedAt: ago(4),
    reviewComment: 'Excelente, queda en revisión final.',
  });
  // Solicitud PENDIENTE: cerrar la actividad, esperando aprobación
  await estudio.requestChange({
    toStageId: sDone,
    requesterId: workers['ana@trazapp.com'],
    requestedAt: ago(1),
    description: 'Informe aprobado por interventoría. Solicito marcar como completado.',
    review: 'PENDIENTE',
  });

  // Actividad 2: en progreso normal, dos asignados
  const senal = await ActivityFlow.create({
    projectId: proyObra.id,
    title: 'Señalización horizontal y vertical',
    description: 'Demarcación de carriles, pasos peatonales y señales reglamentarias.',
    priority: 'MEDIA',
    stageId: sPend,
    creatorId: admin.id,
    createdAt: ago(18),
    dueDate: ago(-15),
    tagIds: [tags.get('Mejora')].filter(Boolean) as string[],
  });
  await senal.assign(workers['lucia@trazapp.com'], admin.id, ago(18, 1));
  await senal.requestChange({
    toStageId: sProg,
    requesterId: workers['lucia@trazapp.com'],
    requestedAt: ago(8),
    description: 'Levantamiento de campo iniciado.',
    review: 'APROBADO',
    reviewerId: supervisor.id,
    reviewedAt: ago(7),
  });

  // Actividad 3: solicitud RECHAZADA (queda en su etapa)
  const drenaje = await ActivityFlow.create({
    projectId: proyObra.id,
    title: 'Diseño de drenaje pluvial',
    description: 'Cálculo hidráulico y diseño de sumideros y colectores.',
    priority: 'ALTA',
    stageId: sProg,
    creatorId: admin.id,
    createdAt: ago(16),
    dueDate: ago(-2),
  });
  await drenaje.assign(workers['carlos@trazapp.com'], admin.id, ago(16, 1));
  await drenaje.requestChange({
    toStageId: sRev,
    requesterId: workers['carlos@trazapp.com'],
    requestedAt: ago(5),
    description: 'Diseño listo para revisión.',
    review: 'RECHAZADO',
    reviewerId: supervisor.id,
    reviewedAt: ago(4),
    reviewComment:
      'Falta el análisis para período de retorno de 25 años. Completar antes de revisar.',
  });
  await drenaje.comment(
    workers['carlos@trazapp.com'],
    'Entendido, ajusto el período de retorno y reenvío.',
    ago(3),
  );

  // ── Proyecto 2: Salud ──
  const proySalud = await prisma.project.create({
    data: {
      name: `${DEMO_PREFIX} Campaña de Vacunación 2026`,
      description: 'Jornada municipal de vacunación con cobertura en 12 barrios.',
      status: 'EN_PROGRESO',
      startDate: ago(14),
      endDate: ago(-30),
      projectTypeId: tipoIds['Salud'],
      createdAt: ago(14),
    },
  });
  const logistica = await ActivityFlow.create({
    projectId: proySalud.id,
    title: 'Logística de cadena de frío',
    description: 'Asegurar refrigeración y transporte de biológicos a los puntos de vacunación.',
    priority: 'URGENTE',
    stageId: sPend,
    creatorId: admin.id,
    createdAt: ago(12),
    dueDate: ago(-3),
    tagIds: [tags.get('Urgente')].filter(Boolean) as string[],
  });
  await logistica.assign(workers['ana@trazapp.com'], admin.id, ago(12, 1));
  // Solicitud CANCELADA por el propio solicitante
  await logistica.requestChange({
    toStageId: sProg,
    requesterId: workers['ana@trazapp.com'],
    requestedAt: ago(9),
    description: 'Inicio de gestión con proveedor de neveras.',
    review: 'CANCELADO',
    reviewedAt: ago(9, 1),
  });
  await logistica.comment(
    workers['ana@trazapp.com'],
    'Cancelé la solicitud anterior, el proveedor cambió. Vuelvo a gestionar.',
    ago(9, 2),
  );
  await logistica.requestChange({
    toStageId: sProg,
    requesterId: workers['ana@trazapp.com'],
    requestedAt: ago(8),
    description: 'Proveedor confirmado, iniciamos.',
    review: 'APROBADO',
    reviewerId: supervisor.id,
    reviewedAt: ago(7),
  });

  // ── Proyecto 3: Tecnología (uno completado de punta a punta) ──
  const proyTec = await prisma.project.create({
    data: {
      name: `${DEMO_PREFIX} Portal de Trámites en Línea`,
      description: 'Plataforma para realizar trámites municipales sin presencialidad.',
      status: 'EN_PROGRESO',
      startDate: ago(30),
      endDate: ago(-60),
      projectTypeId: tipoIds['Tecnología'],
      createdAt: ago(30),
    },
  });
  const mockups = await ActivityFlow.create({
    projectId: proyTec.id,
    title: 'Diseño de interfaz (mockups)',
    description: 'Prototipos de alta fidelidad de las pantallas principales del portal.',
    priority: 'MEDIA',
    stageId: sPend,
    creatorId: admin.id,
    createdAt: ago(28),
    dueDate: ago(10),
    tagIds: [tags.get('Feature')].filter(Boolean) as string[],
  });
  await mockups.assign(workers['lucia@trazapp.com'], admin.id, ago(28, 1));
  await mockups.requestChange({
    toStageId: sProg,
    requesterId: workers['lucia@trazapp.com'],
    requestedAt: ago(26),
    description: 'Comienzo con wireframes.',
    review: 'APROBADO',
    reviewerId: supervisor.id,
    reviewedAt: ago(25),
  });
  await mockups.requestChange({
    toStageId: sRev,
    requesterId: workers['lucia@trazapp.com'],
    requestedAt: ago(20),
    description: 'Mockups listos para revisión.',
    review: 'APROBADO',
    reviewerId: supervisor.id,
    reviewedAt: ago(19),
  });
  await mockups.requestChange({
    toStageId: sDone,
    requesterId: workers['lucia@trazapp.com'],
    requestedAt: ago(18),
    description: 'Aprobados por el área de comunicaciones.',
    review: 'APROBADO',
    reviewerId: supervisor.id,
    reviewedAt: ago(17),
    reviewComment: 'Excelente trabajo.',
  });

  // Una tarea sin asignar (para mostrar el caso "el admin la creó y no se asignó a nadie")
  await ActivityFlow.create({
    projectId: proyTec.id,
    title: 'Integración pasarela de pagos',
    description: 'Conectar el portal con la pasarela de pagos del banco recaudador. Sin responsable aún.',
    priority: 'ALTA',
    stageId: sPend,
    creatorId: admin.id,
    createdAt: ago(2),
    dueDate: ago(-20),
  });

  // ── Notificaciones de ejemplo (no leídas) para el supervisor ──
  await prisma.notification.createMany({
    data: [
      {
        userId: supervisor.id,
        type: 'SOLICITUD_CAMBIO_ETAPA',
        title: 'Nueva solicitud de cambio',
        message: 'Ana Gómez solicita marcar "Estudio de suelos — Tramo 1" como completado.',
        isRead: false,
        metadata: { demo: true, activityId: estudio.activityId },
        createdAt: ago(1),
      },
      {
        userId: workers['carlos@trazapp.com'],
        type: 'CAMBIO_ETAPA_RECHAZADO',
        title: 'Solicitud rechazada',
        message: 'Tu cambio en "Diseño de drenaje pluvial" fue rechazado.',
        isRead: false,
        metadata: { demo: true, activityId: drenaje.activityId },
        createdAt: ago(4),
      },
    ],
  });

  // ── Resumen ──
  const counts = await prisma.$transaction([
    prisma.project.count({ where: { name: { startsWith: DEMO_PREFIX } } }),
    prisma.activity.count({ where: { project: { name: { startsWith: DEMO_PREFIX } } } }),
    prisma.activityEvent.count({
      where: { activity: { project: { name: { startsWith: DEMO_PREFIX } } } },
    }),
    prisma.stageChangeRequest.count({
      where: { activity: { project: { name: { startsWith: DEMO_PREFIX } } } },
    }),
  ]);
  console.log('\nDatos de demo creados:');
  console.log(`  Proyectos:            ${counts[0]}`);
  console.log(`  Actividades:          ${counts[1]}`);
  console.log(`  Eventos (timeline):   ${counts[2]}`);
  console.log(`  Solicitudes de cambio:${counts[3]}`);
  console.log('\nUsuarios trabajadores demo (contraseña: demo1234):');
  for (const w of DEMO_WORKERS) console.log(`  ${w.email}`);
  console.log('\nListo. Inicia sesión como supervisor@trazapp.com para ver la cola de solicitudes.');
}

main()
  .catch((e) => {
    console.error('Error en seed de demo:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
