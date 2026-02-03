import { IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignUsersDto {
  @ApiProperty({
    example: ['123e4567-e89b-12d3-a456-426614174000', '123e4567-e89b-12d3-a456-426614174001'],
    description: 'IDs de usuarios a asignar a la actividad',
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  userIds: string[];
}
