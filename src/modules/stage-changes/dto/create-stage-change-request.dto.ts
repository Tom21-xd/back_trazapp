import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class CreateStageChangeRequestDto {
  @IsUUID()
  @IsNotEmpty()
  activityId: string;

  @IsUUID()
  @IsNotEmpty()
  toStageId: string;

  @IsString()
  @IsNotEmpty()
  description: string;
}
