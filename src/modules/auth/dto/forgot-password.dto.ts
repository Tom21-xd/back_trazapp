import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'admin@trazapp.com' })
  @IsEmail({}, { message: 'Email no válido' })
  email: string;
}
