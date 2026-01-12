import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  IsUUID,
  IsArray,
} from 'class-validator';
import { Priority } from '@prisma/client';

export class CreateActivityDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(Priority)
  @IsOptional()
  priority?: Priority;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsUUID()
  @IsNotEmpty()
  projectId: string;

  @IsUUID()
  @IsNotEmpty()
  currentStageId: string;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  assignedUserIds?: string[];

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  tagIds?: string[];

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  dependsOnActivityIds?: string[];
}
