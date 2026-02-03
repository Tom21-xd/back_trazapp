import { IsEnum, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StageChangeStatus } from '@prisma/client';

export class ReviewStageChangeDto {
  @ApiProperty({
    enum: StageChangeStatus,
    example: StageChangeStatus.APROBADO,
    description: 'Estado de la revisión (APROBADO o RECHAZADO)',
  })
  @IsEnum(StageChangeStatus)
  status: StageChangeStatus;

  @ApiPropertyOptional({
    example: 'Se aprueba el cambio de etapa porque cumple con los requisitos',
    description: 'Comentario del revisor',
  })
  @IsString()
  @IsOptional()
  reviewComment?: string;
}
