import { IsString, IsNotEmpty, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateStageChangeRequestDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'ID de la actividad que se quiere cambiar de etapa',
  })
  @IsUUID()
  @IsNotEmpty()
  activityId: string;

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174001',
    description: 'ID de la etapa destino',
  })
  @IsUUID()
  @IsNotEmpty()
  toStageId: string;

  @ApiProperty({
    example:
      'Se completaron todos los requisitos para pasar a la siguiente etapa',
    description: 'Descripción o justificación del cambio de etapa',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description: string;
}
