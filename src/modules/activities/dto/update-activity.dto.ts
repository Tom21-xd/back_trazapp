import { PartialType, OmitType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateActivityDto } from './create-activity.dto';

export class UpdateActivityDto extends PartialType(
  OmitType(CreateActivityDto, ['projectId'] as const),
) {
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
