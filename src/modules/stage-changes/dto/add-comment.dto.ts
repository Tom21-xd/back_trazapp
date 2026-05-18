import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddCommentDto {
  @ApiProperty({
    example: 'Información adicional sobre la solicitud',
    description: 'Contenido del comentario',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content: string;
}
