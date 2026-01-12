import { IsString, IsNotEmpty, IsOptional, IsInt, Min } from 'class-validator';

export class CreateStageDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(0)
  order: number;

  @IsString()
  @IsOptional()
  color?: string;
}
