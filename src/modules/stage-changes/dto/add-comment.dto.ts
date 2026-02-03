import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddCommentDto {
  @ApiProperty({
    example: 'Información adicional sobre la solicitud',
    description: 'Contenido del comentario',
  })
  @IsString()
  @IsNotEmpty()
  content: string;
}
