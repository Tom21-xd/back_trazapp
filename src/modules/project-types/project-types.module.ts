import { Module } from '@nestjs/common';
import { ProjectTypesService } from './project-types.service';
import { ProjectTypesController } from './project-types.controller';

@Module({
  controllers: [ProjectTypesController],
  providers: [ProjectTypesService],
  exports: [ProjectTypesService],
})
export class ProjectTypesModule {}
