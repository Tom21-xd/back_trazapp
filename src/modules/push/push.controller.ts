import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { PushService, SubscriptionPayload } from './push.service';
import { CurrentUser, Public } from '../../common/decorators';

@ApiTags('push')
@ApiBearerAuth('JWT-auth')
@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Public()
  @Get('vapid-public-key')
  @ApiOperation({ summary: 'Clave pública VAPID para crear suscripciones' })
  @ApiResponse({
    status: 200,
    description: 'Clave pública o null si no está habilitado',
  })
  getPublicKey() {
    return { publicKey: this.push.getPublicKey() };
  }

  @Post('subscription')
  @ApiOperation({
    summary: 'Registrar (o actualizar) la suscripción push del dispositivo',
  })
  @ApiResponse({ status: 201, description: 'Suscripción guardada' })
  subscribe(
    @CurrentUser('id') userId: string,
    @Body() sub: SubscriptionPayload,
    @Req() req: Request,
  ) {
    const ua = (req.headers['user-agent'] as string) || undefined;
    return this.push.subscribe(userId, sub, ua);
  }

  @Delete('subscription')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar la suscripción push del dispositivo' })
  unsubscribe(
    @CurrentUser('id') userId: string,
    @Query('endpoint') endpoint: string,
  ) {
    return this.push.unsubscribe(userId, endpoint);
  }
}
