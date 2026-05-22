import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { PrismaService } from './modules/prisma/prisma.service';
import { Public } from './common/decorators';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('health')
  @ApiTags('health')
  @ApiOperation({
    summary: 'Health check — usado por load balancers / uptime monitors',
  })
  @ApiResponse({
    status: 200,
    description: 'Servicio arriba y BD respondiendo',
  })
  @ApiResponse({ status: 503, description: 'BD no responde' })
  async health() {
    let database: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch {
      database = 'down';
    }

    const mem = process.memoryUsage();
    const toMb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;
    const payload = {
      status: database === 'up' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      version: process.env.npm_package_version ?? '0.0.1',
      database,
      memory: { rssMb: toMb(mem.rss), heapUsedMb: toMb(mem.heapUsed) },
    };

    // Devolver 503 cuando la BD no responde para que los uptime monitors
    // y balanceadores lo detecten como caído (no como 200 "ok").
    if (database === 'down') {
      throw new ServiceUnavailableException(payload);
    }
    return payload;
  }
}
