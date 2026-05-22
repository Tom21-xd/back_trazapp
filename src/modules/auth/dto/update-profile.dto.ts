import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Juan Pérez' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: '+57 300 000 0000' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({
    description:
      'Avatar como data URL de imagen (ya redimensionado en el cliente). Máx ~256 KB.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(350_000)
  @Matches(/^data:image\/(png|jpeg|jpg|webp);base64,/, {
    message: 'El avatar debe ser una imagen en formato data URL',
  })
  avatar?: string;
}
