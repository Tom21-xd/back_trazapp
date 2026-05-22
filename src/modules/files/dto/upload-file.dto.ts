import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/**
 * Un archivo se adjunta a EXACTAMENTE uno de estos destinos.
 * La validación de "exactamente uno" se hace en el servicio.
 */
export class UploadFileDto {
  @ApiPropertyOptional({
    description: 'ID de la actividad a la que se adjunta',
  })
  @IsOptional()
  @IsUUID()
  activityId?: string;

  @ApiPropertyOptional({ description: 'ID del comentario al que se adjunta' })
  @IsOptional()
  @IsUUID()
  commentId?: string;

  @ApiPropertyOptional({
    description: 'ID de la solicitud de cambio de etapa a la que se adjunta',
  })
  @IsOptional()
  @IsUUID()
  stageChangeRequestId?: string;

  @ApiPropertyOptional({
    description: 'ID del comentario de solicitud al que se adjunta',
  })
  @IsOptional()
  @IsUUID()
  stageChangeCommentId?: string;
}
