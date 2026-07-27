import type { ParamDetail, TrackingSource } from '@shared/api.interface';

export function normalizePlatformDisplay(value: string | undefined, source: TrackingSource): string {
  const raw = (value || '').trim();
  if (source === 'web') {
    if (raw === 'Web' || raw === '仅Web') return 'Web通用';
    return raw || '-';
  }
  const alias: Record<string, string> = {
    App: 'App通用',
    仅App: 'App通用',
    iOS: '仅iOS',
    Android: '仅Android',
    'iOS、Android': 'App通用',
    'iOS,Android': 'App通用',
    'iOS, Android': 'App通用',
  };
  return alias[raw] || raw || '-';
}

export function buildParamClipboardText(
  items: ParamDetail[],
  source: TrackingSource,
  title = '参数说明',
): string {
  if (!items.length) return `${title}\n暂无参数`;

  const lines = items.flatMap((item, index) => [
    `${index + 1}. ${item.paramKey}`,
    `- 参数名：${item.paramName || '-'}`,
    `- 类型：${item.paramType || '-'}`,
    `- 必传规则：${item.requiredRule || (item.required ? '必传' : '非必传')}`,
    `- 适用端：${normalizePlatformDisplay(item.platform, source)}`,
    `- 定义：${item.definition || '-'}`,
    `- 枚举/取值范围：${item.enumRange || '-'}`,
    `- 条件说明：${item.triggerCondition || '-'}`,
    `- 示例：${item.example || item.defaultValue || '-'}`,
  ]);

  return [title, ...lines].join('\n');
}

