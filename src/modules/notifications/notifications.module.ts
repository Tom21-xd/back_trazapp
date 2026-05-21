import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsStreamService } from './notifications-stream.service';

// Global: cualquier servicio (activities, comments, stage-changes) puede
// inyectar NotificationsService sin importar este módulo explícitamente.
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
      }),
    }),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsStreamService],
  exports: [NotificationsService, NotificationsStreamService],
})
export class NotificationsModule {}
