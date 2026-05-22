import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MaintenanceService } from './maintenance.service';
import { PrismaService } from '../prisma/prisma.service';

describe('MaintenanceService', () => {
  let service: MaintenanceService;

  const mockPrisma = {
    notification: { deleteMany: jest.fn() },
    auditLog: { deleteMany: jest.fn() },
  };

  const config: Record<string, number> = {
    'retention.notificationsReadDays': 60,
    'retention.notificationsAllDays': 180,
    'retention.auditDays': 365,
  };
  const mockConfig = { get: jest.fn((k: string) => config[k]) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get<MaintenanceService>(MaintenanceService);
    jest.clearAllMocks();
    config['retention.notificationsReadDays'] = 60;
    config['retention.notificationsAllDays'] = 180;
    config['retention.auditDays'] = 365;
  });

  it('purga notificaciones leídas, antiguas y auditoría según retención', async () => {
    mockPrisma.notification.deleteMany
      .mockResolvedValueOnce({ count: 5 }) // leídas
      .mockResolvedValueOnce({ count: 2 }); // antiguas
    mockPrisma.auditLog.deleteMany.mockResolvedValue({ count: 7 });

    const summary = await service.purgeExpiredData();

    expect(summary).toEqual({
      notificationsRead: 5,
      notificationsOld: 2,
      auditLogs: 7,
    });
    expect(mockPrisma.notification.deleteMany).toHaveBeenCalledTimes(2);
    expect(mockPrisma.auditLog.deleteMany).toHaveBeenCalledTimes(1);
    // La primera llamada filtra por isRead: true
    expect(
      mockPrisma.notification.deleteMany.mock.calls[0][0].where.isRead,
    ).toBe(true);
  });

  it('omite una categoría cuando su retención es 0', async () => {
    config['retention.notificationsReadDays'] = 0;
    config['retention.auditDays'] = 0;
    mockPrisma.notification.deleteMany.mockResolvedValue({ count: 3 });

    const summary = await service.purgeExpiredData();

    expect(summary.notificationsRead).toBe(0); // desactivado
    expect(summary.auditLogs).toBe(0); // desactivado
    expect(mockPrisma.notification.deleteMany).toHaveBeenCalledTimes(1); // solo "antiguas"
    expect(mockPrisma.auditLog.deleteMany).not.toHaveBeenCalled();
  });
});
