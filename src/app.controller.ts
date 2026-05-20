import { Controller, Get } from '@nestjs/common';
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
  @ApiOperation({ summary: 'Health check — usado por load balancers / uptime monitors' })
  @ApiResponse({ status: 200, description: 'Servicio arriba y BD respondiendo' })
  @ApiResponse({ status: 503, description: 'BD no responde' })
  async health() {
    const startedAt = process.uptime();
    let database: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch {
      database = 'down';
    }
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(startedAt),
      version: process.env.npm_package_version ?? '0.0.1',
      database,
    };
  }
}
