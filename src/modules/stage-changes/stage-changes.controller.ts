import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { StageChangesService } from './stage-changes.service';
import {
  CreateStageChangeRequestDto,
  ReviewStageChangeDto,
  AddCommentDto,
} from './dto';
import { CurrentUser, Roles } from '../../common/decorators';
import { Role, StageChangeStatus } from '@prisma/client';

@Controller('stage-changes')
export class StageChangesController {
  constructor(private readonly stageChangesService: StageChangesService) {}

  @Post()
  createRequest(
    @Body() dto: CreateStageChangeRequestDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.stageChangesService.createRequest(dto, userId);
  }

  @Get()
  findAll(
    @Query('activityId') activityId?: string,
    @Query('status') status?: StageChangeStatus,
  ) {
    return this.stageChangesService.findAll({ activityId, status });
  }

  @Get('pending')
  @Roles(Role.ADMIN)
  getPending() {
    return this.stageChangesService.getPendingRequests();
  }

  @Get('my-requests')
  getMyRequests(@CurrentUser('id') userId: string) {
    return this.stageChangesService.getMyRequests(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.stageChangesService.findOne(id);
  }

  @Patch(':id/review')
  @Roles(Role.ADMIN)
  review(
    @Param('id') id: string,
    @Body() dto: ReviewStageChangeDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.stageChangesService.reviewRequest(id, dto, userId);
  }

  @Post(':id/comments')
  addComment(
    @Param('id') requestId: string,
    @Body() dto: AddCommentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.stageChangesService.addComment(requestId, dto, userId);
  }
}
