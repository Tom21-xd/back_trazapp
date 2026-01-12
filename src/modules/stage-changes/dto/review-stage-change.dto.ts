import { IsEnum, IsString, IsOptional } from 'class-validator';
import { StageChangeStatus } from '@prisma/client';

export class ReviewStageChangeDto {
  @IsEnum(StageChangeStatus)
  status: StageChangeStatus;

  @IsString()
  @IsOptional()
  reviewComment?: string;
}
