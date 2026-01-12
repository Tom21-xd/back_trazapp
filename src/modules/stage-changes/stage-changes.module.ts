import { Module } from '@nestjs/common';
import { StageChangesService } from './stage-changes.service';
import { StageChangesController } from './stage-changes.controller';

@Module({
  controllers: [StageChangesController],
  providers: [StageChangesService],
  exports: [StageChangesService],
})
export class StageChangesModule {}
