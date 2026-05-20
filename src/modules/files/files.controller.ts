import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Body,
  UploadedFile,
  UseInterceptors,
  Res,
  HttpCode,
  HttpStatus,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { createReadStream } from 'fs';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiParam,
} from '@nestjs/swagger';
import { FilesService } from './files.service';
import { UploadFileDto } from './dto';
import {
  CurrentUser,
  RequirePermissions,
  RequireAnyPermission,
} from '../../common/decorators';

const MAX_FILE_BYTES =
  (Number(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024;

@ApiTags('files')
@ApiBearerAuth('JWT-auth')
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post()
  @RequirePermissions('file:upload')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Subir un archivo y adjuntarlo a una actividad, comentario o solicitud',
  })
  @ApiResponse({ status: 201, description: 'Archivo subido' })
  @ApiResponse({ status: 400, description: 'Archivo inválido o destino incorrecto' })
  @ApiResponse({ status: 403, description: 'Sin permisos sobre la actividad' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_BYTES },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFileDto,
    @CurrentUser() user: { id: string; permissions: string[] },
  ) {
    return this.filesService.upload(file, dto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar archivos de un destino (activityId, commentId, etc.)',
  })
  @ApiResponse({ status: 200, description: 'Lista de archivos' })
  list(
    @Query() query: UploadFileDto,
    @CurrentUser() user: { id: string; permissions: string[] },
  ) {
    return this.filesService.listByTarget(query, user);
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'ID del archivo' })
  @ApiOperation({ summary: 'Descargar / visualizar un archivo' })
  @ApiResponse({ status: 200, description: 'Contenido del archivo' })
  @ApiResponse({ status: 404, description: 'Archivo no encontrado' })
  async download(
    @Param('id') id: string,
    @Query('download') download: string,
    @CurrentUser() user: { id: string; permissions: string[] },
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { file, absolutePath } = await this.filesService.getForDownload(
      id,
      user,
    );

    const disposition = download === 'true' ? 'attachment' : 'inline';
    const safeName = encodeURIComponent(file.originalName);

    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.size),
      'Content-Disposition': `${disposition}; filename*=UTF-8''${safeName}`,
      'Cache-Control': 'private, max-age=0, must-revalidate',
    });

    return new StreamableFile(createReadStream(absolutePath));
  }

  @Delete(':id')
  @RequireAnyPermission('file:delete:own', 'file:delete:any')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', description: 'ID del archivo' })
  @ApiOperation({ summary: 'Eliminar un archivo' })
  @ApiResponse({ status: 204, description: 'Archivo eliminado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Archivo no encontrado' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; permissions: string[] },
  ) {
    return this.filesService.remove(id, user);
  }
}
