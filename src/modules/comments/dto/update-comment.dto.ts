import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCommentDto {
  @ApiProperty({
    example: 'Comentario actualizado',
    description: 'Nuevo contenido del comentario',
  })
  @IsString()
  @IsNotEmpty()
  content: string;
}
