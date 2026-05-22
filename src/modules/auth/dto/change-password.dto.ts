import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { IsStrongPassword } from '../../../common/validators/strong-password.decorator';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Contraseña actual' })
  @IsString()
  currentPassword: string;

  @ApiProperty({
    description: 'Nueva contraseña: mínimo 8 caracteres, una letra y un número',
    minLength: 8,
  })
  @IsStrongPassword()
  newPassword: string;
}
