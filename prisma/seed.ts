import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando seed de la base de datos...');

  // Crear usuario admin
  const hashedPassword = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@trazapp.com' },
    update: {},
    create: {
      email: 'admin@trazapp.com',
      password: hashedPassword,
      name: 'Administrador',
      role: Role.ADMIN,
      isActive: true,
    },
  });

  console.log(`Usuario admin creado: ${admin.email}`);

  // Crear etapas por defecto
  const stages = [
    { name: 'Pendiente', description: 'Tareas pendientes de inicio', order: 0, color: '#9CA3AF' },
    { name: 'En Progreso', description: 'Tareas en desarrollo', order: 1, color: '#3B82F6' },
    { name: 'En Revisión', description: 'Tareas esperando aprobación', order: 2, color: '#F59E0B' },
    { name: 'Completado', description: 'Tareas finalizadas', order: 3, color: '#10B981' },
  ];

  for (const stage of stages) {
    await prisma.stage.upsert({
      where: { name: stage.name },
      update: {},
      create: stage,
    });
    console.log(`Etapa creada: ${stage.name}`);
  }

  // Crear etiquetas por defecto
  const tags = [
    { name: 'Urgente', color: '#EF4444' },
    { name: 'Bug', color: '#DC2626' },
    { name: 'Feature', color: '#8B5CF6' },
    { name: 'Mejora', color: '#06B6D4' },
    { name: 'Documentación', color: '#6366F1' },
  ];

  for (const tag of tags) {
    await prisma.tag.upsert({
      where: { name: tag.name },
      update: {},
      create: tag,
    });
    console.log(`Etiqueta creada: ${tag.name}`);
  }

  console.log('\nSeed completado exitosamente!');
  console.log('\nCredenciales del administrador:');
  console.log('  Email: admin@trazapp.com');
  console.log('  Password: admin123');
}

main()
  .catch((e) => {
    console.error('Error durante el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
