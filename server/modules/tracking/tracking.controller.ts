import {
  Controller,
  Get,
  Query,
  Req,
  Logger,
  Param,
  Patch,
  Post,
  Put,
  Delete,
  Body,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request } from 'express';
import { TrackingService } from './tracking.service';
import type {
  GetStageStatsResponse,
  GetMyTodosResponse,
  GetTrackingRecordsParams,
  GetTrackingRecordsResponse,
  GetTrackingDetailResponse,
  UpdateTrackingRecordRequest,
  UpdateTrackingRecordResponse,
  GetParamsResponse,
  CreateParamRequest,
  CreateParamResponse,
  UpdateParamRequest,
  UpdateParamResponse,
  DeleteParamResponse,
} from '@shared/api.interface';

@Controller('api/tracking')
export class TrackingController {
  private readonly logger = new Logger(TrackingController.name);

  constructor(private readonly trackingService: TrackingService) {
    this.logger.log('TrackingController initialized');
  }

  /**
   * 阶段统计
   */
  @NeedLogin()
  @Get('stats')
  async getStageStats(): Promise<GetStageStatsResponse> {
    return this.trackingService.getStageStats();
  }

  /**
   * 我的待办
   */
  @NeedLogin()
  @Get('my-todos')
  async getMyTodos(
    @Req() req: Request,
    @Query('limit') limit?: string,
  ): Promise<GetMyTodosResponse> {
    const { userId } = req.userContext;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.trackingService.getMyTodos(userId, limitNum);
  }

  /**
   * 需求列表
   */
  @NeedLogin()
  @Get('records')
  async getRecords(
    @Query() query: GetTrackingRecordsParams & { pageSize?: string },
  ): Promise<GetTrackingRecordsResponse> {
    const params: GetTrackingRecordsParams = {
      keyword: query.keyword,
      stage: query.stage,
      priority: query.priority,
      platform: query.platform,
      owner: query.owner,
      pageSize: query.pageSize ? parseInt(String(query.pageSize), 10) : 20,
      pageToken: query.pageToken,
    };
    return this.trackingService.getRecords(params);
  }

  /**
   * 需求详情
   */
  @NeedLogin()
  @Get('records/:recordId')
  async getDetail(
    @Req() req: Request,
    @Param('recordId') recordId: string,
  ): Promise<GetTrackingDetailResponse> {
    const { userId } = req.userContext;
    return this.trackingService.getDetail(recordId, userId);
  }

  /**
   * 更新主表字段
   */
  @NeedLogin()
  @Patch('records/:recordId')
  async updateRecord(
    @Req() req: Request,
    @Param('recordId') recordId: string,
    @Body() body: UpdateTrackingRecordRequest,
  ): Promise<UpdateTrackingRecordResponse> {
    const { userId } = req.userContext;
    return this.trackingService.updateRecord(recordId, userId, body);
  }

  /**
   * 参数列表
   */
  @NeedLogin()
  @Get('records/:recordId/params')
  async getParams(
    @Param('recordId') recordId: string,
  ): Promise<GetParamsResponse> {
    return this.trackingService.getParams(recordId);
  }

  /**
   * 新增参数
   */
  @NeedLogin()
  @Post('records/:recordId/params')
  async createParam(
    @Req() req: Request,
    @Param('recordId') recordId: string,
    @Body() body: CreateParamRequest,
  ): Promise<CreateParamResponse> {
    const { userId } = req.userContext;
    return this.trackingService.createParam(recordId, userId, body);
  }

  /**
   * 编辑参数
   */
  @NeedLogin()
  @Put('params/:paramRecordId')
  async updateParam(
    @Req() req: Request,
    @Param('paramRecordId') paramRecordId: string,
    @Body() body: UpdateParamRequest,
  ): Promise<UpdateParamResponse> {
    const { userId } = req.userContext;
    return this.trackingService.updateParam(paramRecordId, userId, body);
  }

  /**
   * 软删除参数（更新状态为废弃）
   */
  @NeedLogin()
  @Delete('params/:paramRecordId')
  async deleteParam(
    @Req() req: Request,
    @Param('paramRecordId') paramRecordId: string,
  ): Promise<DeleteParamResponse> {
    const { userId } = req.userContext;
    return this.trackingService.deleteParam(paramRecordId, userId);
  }
}
