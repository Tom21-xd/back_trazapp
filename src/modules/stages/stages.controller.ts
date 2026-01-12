import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { StagesService } from './stages.service';
import { CreateStageDto, UpdateStageDto } from './dto';
import { Roles } from '../../common/decorators';
import { Role } from '@prisma/client';

@Controller('stages')
export class StagesController {
  constructor(private readonly stagesService: StagesService) {}

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateStageDto) {
    return this.stagesService.create(dto);
  }

  @Get()
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.stagesService.findAll(includeInactive === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.stagesService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateStageDto) {
    return this.stagesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.stagesService.remove(id);
  }

  @Post('reorder')
  @Roles(Role.ADMIN)
  reorder(@Body() stages: { id: string; order: number }[]) {
    return this.stagesService.reorder(stages);
  }
}
