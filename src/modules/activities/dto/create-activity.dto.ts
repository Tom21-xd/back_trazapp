import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  IsUUID,
  IsArray,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Priority } from '@prisma/client';

export class CreateActivityDto {
  @ApiProperty({
    example: 'Implementar autenticación',
    description: 'Título de la actividad',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({
    example: 'Implementar autenticación con JWT y refresh tokens',
    description: 'Descripción detallada de la actividad',
  })
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({
    enum: Priority,
    example: Priority.ALTA,
    description: 'Prioridad de la actividad',
  })
  @IsEnum(Priority)
  @IsOptional()
  priority?: Priority;

  @ApiPropertyOptional({
    example: '2024-12-31',
    description: 'Fecha límite de la actividad',
  })
  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'ID del proyecto al que pertenece la actividad',
  })
  @IsUUID()
  @IsNotEmpty()
  projectId: string;

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174001',
    description: 'ID de la etapa actual de la actividad',
  })
  @IsUUID()
  @IsNotEmpty()
  currentStageId: string;

  @ApiPropertyOptional({
    example: ['123e4567-e89b-12d3-a456-426614174002'],
    description: 'IDs de usuarios asignados a la actividad',
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  assignedUserIds?: string[];

  @ApiPropertyOptional({
    example: ['123e4567-e89b-12d3-a456-426614174003'],
    description: 'IDs de etiquetas de la actividad',
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  tagIds?: string[];

  @ApiPropertyOptional({
    example: ['123e4567-e89b-12d3-a456-426614174004'],
    description: 'IDs de actividades de las que depende esta actividad',
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  dependsOnActivityIds?: string[];
}
