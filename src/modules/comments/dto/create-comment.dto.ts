import { IsString, IsNotEmpty, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCommentDto {
  @ApiProperty({
    example: 'Este es un comentario sobre la actividad',
    description: 'Contenido del comentario',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content: string;

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'ID de la actividad donde se crea el comentario',
  })
  @IsUUID()
  @IsNotEmpty()
  activityId: string;
}
