import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateStageDto } from './create-stage.dto';

export class UpdateStageDto extends PartialType(CreateStageDto) {
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
