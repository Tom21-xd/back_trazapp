import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_USERS = [
  {
    email: 'admin@trazapp.com',
    password: 'admin123',
    name: 'Administrador',
    roleName: 'Administrador',
  },
  {
    email: 'supervisor@trazapp.com',
    password: 'supervisor123',
    name: 'Supervisor Demo',
    roleName: 'Supervisor',
  },
  {
    email: 'trabajador@trazapp.com',
    password: 'trabajador123',
    name: 'Trabajador Demo',
    roleName: 'Trabajador',
  },
];

async function main() {
  console.log('Creando / actualizando usuarios demo...');

  for (const u of DEMO_USERS) {
    const role = await prisma.appRole.findUnique({
      where: { name: u.roleName },
      select: { id: true, name: true },
    });
    if (!role) {
      console.warn(`Rol "${u.roleName}" no existe; saltando ${u.email}`);
      continue;
    }
    const hashed = await bcrypt.hash(u.password, 10);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { appRoleId: role.id, isActive: true, name: u.name },
      create: {
        email: u.email,
        password: hashed,
        name: u.name,
        isActive: true,
        appRoleId: role.id,
      },
      select: { id: true, email: true, name: true },
    });
    console.log(`  ✓ ${user.email}  ·  rol ${role.name}`);
  }

  console.log('\nCredenciales:');
  for (const u of DEMO_USERS) {
    console.log(`  ${u.roleName.padEnd(13)} ${u.email}  /  ${u.password}`);
  }
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
