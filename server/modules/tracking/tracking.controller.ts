import {
  Controller,
  Get,
  Query,
  Req,
  Logger,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request } from 'express';
import { TrackingService } from './tracking.service';
import type {
  GetStageStatsResponse,
  GetMyTodosResponse,
  GetTrackingRecordsParams,
  GetTrackingRecordsResponse,
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
}
