import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsStrongPassword } from '../../../common/validators/strong-password.decorator';

export class CreateUserDto {
  @ApiProperty({
    example: 'usuario@ejemplo.com',
    description: 'Email del usuario',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 'Password123',
    description:
      'Contraseña: mínimo 8 caracteres, al menos una letra y un número',
    minLength: 8,
  })
  @IsStrongPassword()
  password: string;

  @ApiProperty({
    example: 'Juan Pérez',
    description: 'Nombre completo del usuario',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({
    example: '+54 11 1234-5678',
    description: 'Teléfono del usuario',
  })
  @IsString()
  @IsOptional()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({
    example: 'https://example.com/avatar.jpg',
    description: 'URL del avatar del usuario',
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  avatar?: string;

  @ApiPropertyOptional({
    description: 'ID del rol (AppRole) asignado al usuario',
  })
  @IsUUID()
  @IsOptional()
  appRoleId?: string;
}
