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
import { ActivitiesService } from './activities.service';
import {
  CreateActivityDto,
  UpdateActivityDto,
  AssignUsersDto,
} from './dto';
import { CurrentUser, Roles } from '../../common/decorators';
import { Role } from '@prisma/client';

@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Post()
  @Roles(Role.ADMIN)
  create(
    @Body() dto: CreateActivityDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.activitiesService.create(dto, userId);
  }

  @Get()
  findAll(
    @Query('projectId') projectId?: string,
    @Query('stageId') stageId?: string,
    @Query('assignedUserId') assignedUserId?: string,
    @Query('priority') priority?: string,
  ) {
    return this.activitiesService.findAll({
      projectId,
      stageId,
      assignedUserId,
      priority,
    });
  }

  @Get('my-activities')
  getMyActivities(@CurrentUser('id') userId: string) {
    return this.activitiesService.getMyActivities(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.activitiesService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateActivityDto) {
    return this.activitiesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.activitiesService.remove(id);
  }

  @Post(':id/assign')
  @Roles(Role.ADMIN)
  assignUsers(@Param('id') id: string, @Body() dto: AssignUsersDto) {
    return this.activitiesService.assignUsers(id, dto);
  }

  @Delete(':id/unassign/:userId')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  unassignUser(
    @Param('id') activityId: string,
    @Param('userId') userId: string,
  ) {
    return this.activitiesService.unassignUser(activityId, userId);
  }
}
