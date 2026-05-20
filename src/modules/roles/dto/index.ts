import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PartialType, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({ example: 'Supervisor' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(300)
  description?: string;

  @ApiProperty({
    type: [String],
    example: ['project:create', 'activity:update'],
    description: 'Keys de permisos asignados al rol',
  })
  @IsArray()
  @IsString({ each: true })
  permissionKeys: string[];
}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {}

export class AssignRoleDto {
  @ApiProperty({ description: 'ID del usuario' })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({
    description: 'ID del rol (null para quitar el rol)',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  roleId?: string | null;
}
