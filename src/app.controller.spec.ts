import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './modules/prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;
  const mockPrisma = { $queryRaw: jest.fn() };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    appController = app.get<AppController>(AppController);
    jest.clearAllMocks();
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('/health', () => {
    it('reporta ok cuando la BD responde', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      const res = await appController.health();
      expect(res.status).toBe('ok');
      expect(res.database).toBe('up');
    });

    it('lanza 503 con detalle degraded si la BD no responde', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
      await expect(appController.health()).rejects.toMatchObject({
        status: 503,
        response: { status: 'degraded', database: 'down' },
      });
    });
  });
});
