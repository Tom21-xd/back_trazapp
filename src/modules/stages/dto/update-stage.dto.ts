import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateStageDto } from './create-stage.dto';

export class UpdateStageDto extends PartialType(CreateStageDto) {
  @ApiPropertyOptional({
    example: true,
    description: 'Estado activo de la etapa',
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
