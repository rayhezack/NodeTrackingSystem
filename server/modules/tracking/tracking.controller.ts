import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type {
  CreateParamRequest,
  ReuseOfficialEventRequest,
  CreateSiblingTrackingEventRequest,
  CreateTrackingRecordRequest,
  TrackingSourceFilter,
  UpdatePermissionConfigRequest,
  UpdateParamRequest,
  UpdateTrackingRecordRequest,
} from '@shared/api.interface';
import { TrackingService } from './tracking.service';

@Controller('api/tracking')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Get('dashboard')
  getDashboard(@Query() query: Record<string, string>) {
    return this.trackingService.getWorkbenchDashboard(query);
  }

  @Get('stats')
  getStats(@Query('source') source?: string) {
    return this.trackingService.getStageStats({
      source: source as TrackingSourceFilter | undefined,
    });
  }

  @Get('my-todos')
  getMyTodos(
    @Query('limit') limit?: string,
    @Query('source') source?: string,
    @Query('actorId') actorId?: string,
    @Query('actorLarkId') actorLarkId?: string,
  ) {
    return this.trackingService.getMyTodos(Number(limit || 10), {
      source: source as TrackingSourceFilter | undefined,
      actorId,
      actorLarkId,
    });
  }

  @Get('records')
  getRecords(@Query() query: Record<string, string>) {
    return this.trackingService.getRecords(query);
  }

  @Get('permissions')
  getPermissions(@Query('actorId') actorId?: string) {
    return this.trackingService.getPermissionConfig(actorId);
  }

  @Put('permissions')
  updatePermissions(@Body() body: UpdatePermissionConfigRequest) {
    return this.trackingService.updatePermissionConfig(body);
  }

  @Post('records')
  createRecord(@Body() body: CreateTrackingRecordRequest) {
    return this.trackingService.createRecord(body);
  }

  @Post('records/:recordId/events')
  createSiblingEvent(
    @Param('recordId') recordId: string,
    @Body() body: CreateSiblingTrackingEventRequest,
  ) {
    return this.trackingService.createSiblingEvent(recordId, body);
  }

  @Post('records/:recordId/reuse-official-event')
  reuseOfficialEvent(
    @Param('recordId') recordId: string,
    @Body() body: ReuseOfficialEventRequest,
  ) {
    return this.trackingService.reuseOfficialEvent(recordId, body);
  }

  @Get('records/:recordId')
  getDetail(
    @Param('recordId') recordId: string,
    @Query('actorId') actorId?: string,
    @Query('actorLarkId') actorLarkId?: string,
  ) {
    return this.trackingService.getDetail(recordId, actorId, actorLarkId);
  }

  @Patch('records/:recordId')
  updateRecord(
    @Param('recordId') recordId: string,
    @Body() body: UpdateTrackingRecordRequest,
  ) {
    return this.trackingService.updateRecord(recordId, body);
  }

  @Get('records/:recordId/params')
  getParams(@Param('recordId') recordId: string) {
    return this.trackingService.getParams(recordId);
  }

  @Post('records/:recordId/params')
  createParam(@Param('recordId') recordId: string, @Body() body: CreateParamRequest) {
    return this.trackingService.createParam(recordId, body);
  }

  @Put('params/:paramRecordId')
  updateParam(
    @Param('paramRecordId') paramRecordId: string,
    @Body() body: UpdateParamRequest,
  ) {
    return this.trackingService.updateParam(paramRecordId, body);
  }

  @Delete('params/:paramRecordId')
  deleteParam(
    @Param('paramRecordId') paramRecordId: string,
    @Query('actorId') actorId?: string,
    @Query('actorLarkId') actorLarkId?: string,
  ) {
    return this.trackingService.deleteParam(paramRecordId, actorId, actorLarkId);
  }
}
