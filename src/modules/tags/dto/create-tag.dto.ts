import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTagDto {
  @ApiProperty({
    example: 'Urgente',
    description: 'Nombre de la etiqueta',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    example: '#e74c3c',
    description: 'Color de la etiqueta en formato hexadecimal',
  })
  @IsString()
  @IsOptional()
  color?: string;
}
