import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let employeeToken: string;
  let adminId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    prisma = app.get<PrismaService>(PrismaService);

    await app.init();

    // Crear usuario ADMIN directamente en la BD
    const hashedPassword = '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'; // password123
    const admin = await prisma.user.create({
      data: {
        email: 'admin@test.com',
        password: hashedPassword,
        name: 'Admin User',
        role: 'ADMIN',
      },
    });
    adminId = admin.id;

    // Login como admin
    const adminLoginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'admin@test.com',
        password: 'password123',
      });
    adminToken = adminLoginResponse.body.accessToken;

    // Crear empleado para tests
    const employeeResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'employee@test.com',
        password: 'Password123!',
        name: 'Employee User',
      });
    employeeToken = employeeResponse.body.accessToken;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  describe('/users (GET)', () => {
    it('should return all users for admin', () => {
      return request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);
          expect(res.body[0]).not.toHaveProperty('password');
        });
    });

    it('should filter users by role', () => {
      return request(app.getHttpServer())
        .get('/api/users?role=ADMIN')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          res.body.forEach((user) => {
            expect(user.role).toBe('ADMIN');
          });
        });
    });

    it('should fail without admin role', () => {
      return request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });

  describe('/users/:id (GET)', () => {
    it('should return a specific user for admin', () => {
      return request(app.getHttpServer())
        .get(`/api/users/${adminId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(adminId);
          expect(res.body).not.toHaveProperty('password');
        });
    });

    it('should return 404 for non-existent user', () => {
      return request(app.getHttpServer())
        .get('/api/users/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('should fail without admin role', () => {
      return request(app.getHttpServer())
        .get(`/api/users/${adminId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });

  describe('/users/:id (PATCH)', () => {
    it('should update user data for admin', async () => {
      const updateData = {
        name: 'Updated Admin Name',
        phone: '123456789',
      };

      return request(app.getHttpServer())
        .patch(`/api/users/${adminId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200)
        .expect((res) => {
          expect(res.body.name).toBe(updateData.name);
          expect(res.body.phone).toBe(updateData.phone);
        });
    });

    it('should fail to update with duplicate email', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'unique@test.com',
          password: 'hashedpass',
          name: 'Unique User',
        },
      });

      return request(app.getHttpServer())
        .patch(`/api/users/${adminId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'unique@test.com',
        })
        .expect(409);
    });

    it('should fail without admin role', () => {
      return request(app.getHttpServer())
        .patch(`/api/users/${adminId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ name: 'Hacked Name' })
        .expect(403);
    });
  });

  describe('/users/:id (DELETE)', () => {
    it('should soft delete a user for admin', async () => {
      const userToDelete = await prisma.user.create({
        data: {
          email: 'todelete@test.com',
          password: 'hashedpass',
          name: 'To Delete',
        },
      });

      await request(app.getHttpServer())
        .delete(`/api/users/${userToDelete.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      const deletedUser = await prisma.user.findUnique({
        where: { id: userToDelete.id },
      });
      expect(deletedUser.isActive).toBe(false);
    });

    it('should fail without admin role', () => {
      return request(app.getHttpServer())
        .delete(`/api/users/${adminId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });

  describe('/users/:id/activate (PATCH)', () => {
    it('should activate an inactive user', async () => {
      const inactiveUser = await prisma.user.create({
        data: {
          email: 'inactive@test.com',
          password: 'hashedpass',
          name: 'Inactive User',
          isActive: false,
        },
      });

      return request(app.getHttpServer())
        .patch(`/api/users/${inactiveUser.id}/activate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.isActive).toBe(true);
        });
    });
  });

  describe('/users/:id/deactivate (PATCH)', () => {
    it('should deactivate an active user', async () => {
      const activeUser = await prisma.user.create({
        data: {
          email: 'active@test.com',
          password: 'hashedpass',
          name: 'Active User',
          isActive: true,
        },
      });

      return request(app.getHttpServer())
        .patch(`/api/users/${activeUser.id}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.isActive).toBe(false);
        });
    });
  });
});
