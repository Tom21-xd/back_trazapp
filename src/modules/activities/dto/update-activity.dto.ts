import { PartialType, OmitType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateActivityDto } from './create-activity.dto';

export class UpdateActivityDto extends PartialType(
  OmitType(CreateActivityDto, ['projectId'] as const),
) {
  @ApiPropertyOptional({
    example: true,
    description: 'Estado activo de la actividad',
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
