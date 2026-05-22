import { applyDecorators } from '@nestjs/common';
import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

/**
 * Política de contraseñas institucional:
 * - mínimo 8 caracteres
 * - al menos una letra y un número
 * - máximo 128 (defensa ante DoS por hashing)
 *
 * Reutilizable en register, reset-password, change-password y create-user.
 */
export function IsStrongPassword() {
  return applyDecorators(
    IsString(),
    MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' }),
    MaxLength(128),
    Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
      message: 'La contraseña debe incluir al menos una letra y un número',
    }),
  );
}
