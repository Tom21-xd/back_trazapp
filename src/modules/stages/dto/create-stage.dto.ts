import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateStageDto {
  @ApiProperty({
    example: 'En Proceso',
    description: 'Nombre de la etapa',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional({
    example: 'Actividades que están siendo trabajadas',
    description: 'Descripción de la etapa',
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    example: 1,
    description: 'Orden de la etapa en el flujo',
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  order: number;

  @ApiPropertyOptional({
    example: '#3498db',
    description: 'Color de la etapa en formato hexadecimal',
  })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  color?: string;
}
