import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Catálogo de permisos (espejo de src/common/permissions.ts; autocontenido).
// Modelo ATÓMICO: 1 acción = 1 permiso. Alcance :own / :any donde aplica.
const PERMISSIONS = [
  { key: 'project:read', group: 'Proyectos', description: 'Ver proyectos' },
  { key: 'project:create', group: 'Proyectos', description: 'Crear proyectos' },
  { key: 'project:update', group: 'Proyectos', description: 'Editar proyectos' },
  { key: 'project:delete', group: 'Proyectos', description: 'Eliminar proyectos' },
  { key: 'activity:read:own', group: 'Actividades', description: 'Ver mis actividades asignadas' },
  { key: 'activity:read:any', group: 'Actividades', description: 'Ver todas las actividades' },
  { key: 'activity:create', group: 'Actividades', description: 'Crear actividades' },
  { key: 'activity:update', group: 'Actividades', description: 'Editar actividades' },
  { key: 'activity:delete', group: 'Actividades', description: 'Eliminar actividades' },
  { key: 'activity:assign', group: 'Actividades', description: 'Asignar/desasignar usuarios' },
  { key: 'stage:create', group: 'Etapas', description: 'Crear etapas' },
  { key: 'stage:update', group: 'Etapas', description: 'Editar etapas' },
  { key: 'stage:reorder', group: 'Etapas', description: 'Reordenar etapas' },
  { key: 'stage:delete', group: 'Etapas', description: 'Eliminar etapas' },
  { key: 'tag:create', group: 'Etiquetas', description: 'Crear etiquetas' },
  { key: 'tag:update', group: 'Etiquetas', description: 'Editar etiquetas' },
  { key: 'tag:delete', group: 'Etiquetas', description: 'Eliminar etiquetas' },
  { key: 'projectType:create', group: 'Tipos de proyecto', description: 'Crear tipos de proyecto' },
  { key: 'projectType:update', group: 'Tipos de proyecto', description: 'Editar tipos de proyecto' },
  { key: 'projectType:delete', group: 'Tipos de proyecto', description: 'Eliminar tipos de proyecto' },
  { key: 'user:read', group: 'Usuarios', description: 'Ver el listado de usuarios' },
  { key: 'user:create', group: 'Usuarios', description: 'Crear usuarios' },
  { key: 'user:update', group: 'Usuarios', description: 'Editar datos de usuarios' },
  { key: 'user:activate', group: 'Usuarios', description: 'Activar / desactivar usuarios' },
  { key: 'user:delete', group: 'Usuarios', description: 'Eliminar usuarios' },
  { key: 'comment:create', group: 'Comentarios', description: 'Comentar en actividades' },
  { key: 'comment:update:own', group: 'Comentarios', description: 'Editar mis comentarios' },
  { key: 'comment:delete:own', group: 'Comentarios', description: 'Eliminar mis comentarios' },
  { key: 'comment:update:any', group: 'Comentarios', description: 'Editar comentarios de otros' },
  { key: 'comment:delete:any', group: 'Comentarios', description: 'Eliminar comentarios de otros' },
  { key: 'file:upload', group: 'Archivos', description: 'Subir archivos adjuntos' },
  { key: 'file:delete:own', group: 'Archivos', description: 'Eliminar mis archivos' },
  { key: 'file:delete:any', group: 'Archivos', description: 'Eliminar archivos de otros' },
  { key: 'file:read:any', group: 'Archivos', description: 'Ver/descargar archivos de cualquier actividad' },
  { key: 'stagechange:read:own', group: 'Solicitudes', description: 'Ver mis solicitudes de cambio' },
  { key: 'stagechange:read:any', group: 'Solicitudes', description: 'Ver todas las solicitudes (cola pendientes)' },
  { key: 'stagechange:create', group: 'Solicitudes', description: 'Solicitar cambio de etapa' },
  { key: 'stagechange:comment', group: 'Solicitudes', description: 'Comentar en solicitudes' },
  { key: 'stagechange:review', group: 'Solicitudes', description: 'Aprobar/rechazar solicitudes' },
  { key: 'stagechange:manage:any', group: 'Solicitudes', description: 'Gestionar solicitudes de cualquier actividad (no solo asignadas)' },
  { key: 'audit:read', group: 'Auditoría', description: 'Ver el registro de auditoría' },
  { key: 'role:read', group: 'Roles y permisos', description: 'Ver roles y permisos' },
  { key: 'role:create', group: 'Roles y permisos', description: 'Crear roles' },
  { key: 'role:update', group: 'Roles y permisos', description: 'Editar roles y sus permisos' },
  { key: 'role:delete', group: 'Roles y permisos', description: 'Eliminar roles' },
  { key: 'role:assign', group: 'Roles y permisos', description: 'Asignar un rol a un usuario' },
];

// Supervisor: gestiona el flujo operativo y modera/aprueba; sin usuarios/roles/auditoría.
const SUPERVISOR_KEYS = [
  'project:read', 'project:create', 'project:update', 'project:delete',
  'activity:read:own', 'activity:read:any', 'activity:create', 'activity:update',
  'activity:delete', 'activity:assign',
  'stage:create', 'stage:update', 'stage:reorder', 'stage:delete',
  'tag:create', 'tag:update', 'tag:delete',
  'projectType:create', 'projectType:update', 'projectType:delete',
  'comment:create', 'comment:update:own', 'comment:delete:own',
  'comment:update:any', 'comment:delete:any',
  'file:upload', 'file:delete:own', 'file:delete:any', 'file:read:any',
  'stagechange:read:own', 'stagechange:read:any', 'stagechange:create',
  'stagechange:comment', 'stagechange:review', 'stagechange:manage:any',
];

// Trabajador: opera sobre lo propio/asignado.
const TRABAJADOR_KEYS = [
  'project:read',
  'activity:read:own',
  'comment:create', 'comment:update:own', 'comment:delete:own',
  'file:upload', 'file:delete:own',
  'stagechange:read:own', 'stagechange:create', 'stagechange:comment',
];

async function setRolePermissions(roleId: string, keys: string[]) {
  await prisma.rolePermission.deleteMany({ where: { roleId } });
  if (keys.length === 0) return;
  const perms = await prisma.permission.findMany({
    where: { key: { in: keys } },
    select: { id: true },
  });
  await prisma.rolePermission.createMany({
    data: perms.map((p) => ({ roleId, permissionId: p.id })),
    skipDuplicates: true,
  });
}

async function main() {
  console.log('Iniciando seed...');

  // 1) Permisos
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { description: p.description, group: p.group },
      create: p,
    });
  }
  const allKeys = PERMISSIONS.map((p) => p.key);

  // Pruna permisos retirados del catálogo (RolePermission cae en cascada)
  const removed = await prisma.permission.deleteMany({
    where: { key: { notIn: allKeys } },
  });
  console.log(
    `Permisos: ${PERMISSIONS.length} (${removed.count} obsoletos eliminados)`,
  );

  // 2) Roles del sistema
  const administrador = await prisma.appRole.upsert({
    where: { name: 'Administrador' },
    update: { isSystem: true, description: 'Acceso total al sistema' },
    create: { name: 'Administrador', description: 'Acceso total al sistema', isSystem: true },
  });
  const supervisor = await prisma.appRole.upsert({
    where: { name: 'Supervisor' },
    update: { isSystem: true, description: 'Gestiona proyectos, actividades y aprueba cambios' },
    create: { name: 'Supervisor', description: 'Gestiona proyectos, actividades y aprueba cambios', isSystem: true },
  });
  const trabajador = await prisma.appRole.upsert({
    where: { name: 'Trabajador' },
    update: { isSystem: true, description: 'Opera sobre sus actividades asignadas: comenta, adjunta y solicita cambios' },
    create: { name: 'Trabajador', description: 'Opera sobre sus actividades asignadas: comenta, adjunta y solicita cambios', isSystem: true },
  });

  await setRolePermissions(administrador.id, allKeys);
  await setRolePermissions(supervisor.id, SUPERVISOR_KEYS);
  await setRolePermissions(trabajador.id, TRABAJADOR_KEYS);
  console.log(
    `Roles: Administrador (${allKeys.length}), ` +
      `Supervisor (${SUPERVISOR_KEYS.length}), ` +
      `Trabajador (${TRABAJADOR_KEYS.length})`,
  );

  // 3) Usuario admin
  const hashedPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@trazapp.com' },
    update: { appRoleId: administrador.id },
    create: {
      email: 'admin@trazapp.com',
      password: hashedPassword,
      name: 'Administrador',
      isActive: true,
      appRoleId: administrador.id,
    },
  });
  console.log(`Usuario admin: ${admin.email}`);

  // 4) Backfill: cualquier usuario sin rol -> Trabajador
  await prisma.user.updateMany({
    where: { appRoleId: null },
    data: { appRoleId: trabajador.id },
  });

  // 5) Etapas
  const stages = [
    { name: 'Pendiente', description: 'Tareas pendientes de inicio', order: 0, color: '#9CA3AF' },
    { name: 'En Progreso', description: 'Tareas en desarrollo', order: 1, color: '#3B82F6' },
    { name: 'En Revisión', description: 'Tareas esperando aprobación', order: 2, color: '#F59E0B' },
    { name: 'Completado', description: 'Tareas finalizadas', order: 3, color: '#10B981' },
  ];
  for (const stage of stages) {
    await prisma.stage.upsert({ where: { name: stage.name }, update: {}, create: stage });
  }
  console.log(`Etapas: ${stages.length}`);

  // 6) Etiquetas
  const tags = [
    { name: 'Urgente', color: '#EF4444' },
    { name: 'Bug', color: '#DC2626' },
    { name: 'Feature', color: '#8B5CF6' },
    { name: 'Mejora', color: '#06B6D4' },
    { name: 'Documentación', color: '#6366F1' },
  ];
  for (const tag of tags) {
    await prisma.tag.upsert({ where: { name: tag.name }, update: {}, create: tag });
  }
  console.log(`Etiquetas: ${tags.length}`);

  console.log('\nSeed completado.');
  console.log('Admin: admin@trazapp.com / admin123');
}

main()
  .catch((e) => {
    console.error('Error durante el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
