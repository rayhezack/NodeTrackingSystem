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
  CreateTrackingRecordRequest,
  UpdatePermissionConfigRequest,
  UpdateParamRequest,
  UpdateTrackingRecordRequest,
} from '@shared/api.interface';
import { TrackingService } from './tracking.service';

@Controller('api/tracking')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Get('stats')
  getStats() {
    return this.trackingService.getStageStats();
  }

  @Get('my-todos')
  getMyTodos(@Query('limit') limit?: string) {
    return this.trackingService.getMyTodos(Number(limit || 10));
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

  @Get('records/:recordId')
  getDetail(@Param('recordId') recordId: string, @Query('actorId') actorId?: string) {
    return this.trackingService.getDetail(recordId, actorId);
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
  deleteParam(@Param('paramRecordId') paramRecordId: string) {
    return this.trackingService.deleteParam(paramRecordId);
  }
}
