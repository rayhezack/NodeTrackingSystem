import { Body, Controller, Get, Param, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import type {
  ApplyAiTrackingDraftRequest,
  GenerateAiTrackingDraftRequest,
  StartAiFeishuAuthRequest,
} from '@shared/api.interface';
import { AiTrackingService } from './ai-tracking.service';
import { FeishuOAuthService } from './feishu-oauth.service';

@Controller('api/tracking/ai')
export class AiTrackingController {
  constructor(
    private readonly aiTracking: AiTrackingService,
    private readonly oauth: FeishuOAuthService,
  ) {}

  @Get('config')
  getConfig() {
    return this.aiTracking.getConfigStatus();
  }

  @Get('feishu-auth/status')
  getAuthStatus(
    @Req() request: Request,
    @Query('actorId') actorId?: string,
    @Query('actorLarkId') actorLarkId?: string,
  ) {
    const actor = this.resolveRequestActor(request, actorId, actorLarkId);
    if (!actor) return { authorized: false, tokenStorage: 'encrypted_base' as const };
    return this.aiTracking.getAuthStatus(actor);
  }

  @Post('feishu-auth/start')
  startAuth(@Body() body: StartAiFeishuAuthRequest, @Req() request: Request) {
    const actor = this.resolveRequestActor(request, body.actorId, body.actorLarkId);
    if (!actor) throw new UnauthorizedException('无法识别当前妙搭用户，不能发起飞书文档授权');
    return this.aiTracking.startAuth({
      recordId: body.recordId,
      actorId: request.userContext?.userId || body.actorId || actor,
      actorLarkId: body.actorLarkId,
    });
  }

  @Get('feishu-auth/callback')
  async completeAuth(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') oauthError: string | undefined,
    @Res() response: Response,
  ) {
    try {
      const result = await this.oauth.completeAuthorization(code, state, oauthError);
      response.cookie('ai_tracking_session', this.oauth.createSessionCookie(result.authenticatedActor), {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });
      response.status(200).type('html').send(callbackHtml(true, '飞书文档授权成功，可以返回埋点系统继续生成。'));
    } catch (error) {
      const message = error instanceof Error ? error.message : '飞书文档授权失败';
      response.status(400).type('html').send(callbackHtml(false, message));
    }
  }

  @Post('records/:recordId/drafts')
  generateDraft(
    @Param('recordId') recordId: string,
    @Body() body: GenerateAiTrackingDraftRequest,
    @Req() request: Request,
  ) {
    return this.aiTracking.generateDraft(
      recordId,
      body,
      this.requireSessionActor(request, body.actorId, body.actorLarkId),
    );
  }

  @Get('records/:recordId/drafts/latest')
  getLatestDraft(
    @Param('recordId') recordId: string,
    @Query('actorId') actorId: string | undefined,
    @Query('actorLarkId') actorLarkId: string | undefined,
    @Req() request: Request,
  ) {
    return this.aiTracking.getLatestDraft(
      recordId,
      actorId,
      actorLarkId,
      this.requireSessionActor(request, actorId, actorLarkId),
    );
  }

  @Get('records/:recordId/drafts/:draftId')
  getDraft(
    @Param('recordId') recordId: string,
    @Param('draftId') draftId: string,
    @Query('actorId') actorId: string | undefined,
    @Query('actorLarkId') actorLarkId: string | undefined,
    @Req() request: Request,
  ) {
    return this.aiTracking.getDraft(
      recordId,
      draftId,
      actorId,
      actorLarkId,
      this.requireSessionActor(request, actorId, actorLarkId),
    );
  }

  @Post('records/:recordId/drafts/:draftId/apply')
  applyDraft(
    @Param('recordId') recordId: string,
    @Param('draftId') draftId: string,
    @Body() body: ApplyAiTrackingDraftRequest,
    @Req() request: Request,
  ) {
    return this.aiTracking.applyDraft(
      recordId,
      draftId,
      body,
      this.requireSessionActor(request, body.actorId, body.actorLarkId),
    );
  }

  private requireSessionActor(
    request: Request,
    fallbackActorId?: string,
    fallbackActorLarkId?: string,
  ): string {
    const actor = this.resolveRequestActor(request, fallbackActorId, fallbackActorLarkId);
    if (!actor) throw new UnauthorizedException('飞书文档授权会话不存在或已失效，请重新授权');
    return actor;
  }

  private resolveRequestActor(
    request: Request,
    fallbackActorId?: string,
    fallbackActorLarkId?: string,
  ): string | undefined {
    return fallbackActorLarkId ||
      request.userContext?.userId ||
      fallbackActorId ||
      this.oauth.getSessionActor(request.headers.cookie);
  }
}

function callbackHtml(success: boolean, message: string): string {
  const safeMessage = message.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char] || char);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>飞书文档授权</title><style>body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#f5f6f8;color:#1f2329}main{max-width:520px;margin:18vh auto;padding:28px;background:#fff;border:1px solid #dee0e3;border-radius:4px}h1{font-size:18px;margin:0 0 12px;color:${success ? '#00a870' : '#d54941'}}p{font-size:14px;line-height:1.7;margin:0}</style></head><body><main><h1>${success ? '授权成功' : '授权失败'}</h1><p>${safeMessage}</p></main><script>setTimeout(function(){window.close()},1800)</script></body></html>`;
}
