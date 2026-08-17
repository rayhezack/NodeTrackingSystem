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
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type {
  BatchDeleteParamsRequest,
  CreateParamRequest,
  ReuseOfficialEventRequest,
  CreateSiblingTrackingEventRequest,
  CreateTrackingRecordRequest,
  DeleteTrackingRequestRequest,
  DeleteTrackingEventRequest,
  ResolveUiImagePreviewRequest,
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
  getDashboard(@Query() query: Record<string, string>, @Req() request: Request) {
    return this.trackingService.getWorkbenchDashboard({
      ...query,
      ...this.resolveActor(request, query.actorId, query.actorLarkId),
    });
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
    @Req() request?: Request,
  ) {
    const actor = this.resolveActor(request, actorId, actorLarkId);
    return this.trackingService.getMyTodos(Number(limit || 10), {
      source: source as TrackingSourceFilter | undefined,
      ...actor,
    });
  }

  @Get('records')
  getRecords(@Query() query: Record<string, string>) {
    return this.trackingService.getRecords(query);
  }

  @Get('permissions')
  getPermissions(@Query('actorId') actorId: string | undefined, @Req() request: Request) {
    return this.trackingService.getPermissionConfig(this.resolveActor(request, actorId).actorId);
  }

  @Put('permissions')
  updatePermissions(@Body() body: UpdatePermissionConfigRequest, @Req() request: Request) {
    return this.trackingService.updatePermissionConfig(this.withTrustedActor(body, request));
  }

  @Post('ui-image-preview')
  resolveUiImagePreview(@Body() body: ResolveUiImagePreviewRequest) {
    return this.trackingService.resolveUiImagePreview(body);
  }

  @Get('notifications/status')
  getNotificationStatus() {
    return this.trackingService.getNotificationStatus();
  }

  @Post('records')
  createRecord(@Body() body: CreateTrackingRecordRequest, @Req() request: Request) {
    return this.trackingService.createRecord(this.withTrustedActor(body, request));
  }

  @Post('records/:recordId/events')
  createSiblingEvent(
    @Param('recordId') recordId: string,
    @Body() body: CreateSiblingTrackingEventRequest,
    @Req() request: Request,
  ) {
    return this.trackingService.createSiblingEvent(recordId, this.withTrustedActor(body, request));
  }

  @Delete('records/:recordId')
  deleteEvent(
    @Param('recordId') recordId: string,
    @Body() body: DeleteTrackingEventRequest = {},
    @Req() request: Request,
  ) {
    return this.trackingService.deleteEvent(recordId, this.withTrustedActor(body, request));
  }

  @Delete('records/:recordId/request')
  deleteRequest(
    @Param('recordId') recordId: string,
    @Body() body: DeleteTrackingRequestRequest = {},
    @Req() request: Request,
  ) {
    return this.trackingService.deleteRequest(recordId, this.withTrustedActor(body, request));
  }

  @Post('records/:recordId/reuse-official-event')
  reuseOfficialEvent(
    @Param('recordId') recordId: string,
    @Body() body: ReuseOfficialEventRequest,
    @Req() request: Request,
  ) {
    return this.trackingService.reuseOfficialEvent(recordId, this.withTrustedActor(body, request));
  }

  @Get('records/:recordId')
  getDetail(
    @Param('recordId') recordId: string,
    @Query('actorId') actorId?: string,
    @Query('actorLarkId') actorLarkId?: string,
    @Req() request?: Request,
  ) {
    const actor = this.resolveActor(request, actorId, actorLarkId);
    return this.trackingService.getDetail(recordId, actor.actorId, actor.actorLarkId);
  }

  @Patch('records/:recordId')
  updateRecord(
    @Param('recordId') recordId: string,
    @Body() body: UpdateTrackingRecordRequest,
    @Req() request: Request,
  ) {
    return this.trackingService.updateRecord(recordId, this.withTrustedActor(body, request));
  }

  @Get('records/:recordId/params')
  getParams(@Param('recordId') recordId: string) {
    return this.trackingService.getParams(recordId);
  }

  @Post('records/:recordId/params')
  createParam(
    @Param('recordId') recordId: string,
    @Body() body: CreateParamRequest,
    @Req() request: Request,
  ) {
    return this.trackingService.createParam(recordId, this.withTrustedActor(body, request));
  }

  @Post('records/:recordId/params/batch-delete')
  batchDeleteParams(
    @Param('recordId') recordId: string,
    @Body() body: BatchDeleteParamsRequest,
    @Req() request: Request,
  ) {
    return this.trackingService.batchDeleteParams(recordId, this.withTrustedActor(body, request));
  }

  @Put('params/:paramRecordId')
  updateParam(
    @Param('paramRecordId') paramRecordId: string,
    @Body() body: UpdateParamRequest,
    @Req() request: Request,
  ) {
    return this.trackingService.updateParam(paramRecordId, this.withTrustedActor(body, request));
  }

  @Delete('params/:paramRecordId')
  deleteParam(
    @Param('paramRecordId') paramRecordId: string,
    @Query('actorId') actorId?: string,
    @Query('actorLarkId') actorLarkId?: string,
    @Req() request?: Request,
  ) {
    const actor = this.resolveActor(request, actorId, actorLarkId);
    return this.trackingService.deleteParam(paramRecordId, actor.actorId, actor.actorLarkId);
  }

  private withTrustedActor<T extends { actorId?: string; actorLarkId?: string }>(
    body: T,
    request?: Request,
  ): T {
    return {
      ...body,
      ...this.resolveActor(request, body.actorId, body.actorLarkId),
    };
  }

  private resolveActor(
    request?: Request,
    fallbackActorId?: string,
    fallbackActorLarkId?: string,
  ): { actorId?: string; actorLarkId?: string } {
    const trustedActor = request?.userContext?.userId;
    return trustedActor
      ? { actorId: trustedActor, actorLarkId: undefined }
      : { actorId: fallbackActorId, actorLarkId: fallbackActorLarkId };
  }
}
