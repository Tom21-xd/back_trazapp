import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTagDto {
  @ApiProperty({
    example: 'Urgente',
    description: 'Nombre de la etiqueta',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @ApiPropertyOptional({
    example: '#e74c3c',
    description: 'Color de la etiqueta en formato hexadecimal',
  })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  color?: string;
}
