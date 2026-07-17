/**
 * 时间工具函数
 * 将响应中的 ISO 时间戳字段转换为北京时间字符串格式 YYYY-MM-DD HH:mm:ss.SSS
 */

// 需要自动转换的时间戳字段名集合
const TIMESTAMP_FIELDS: ReadonlySet<string> = new Set([
  'created_at',
  'updated_at',
  'inbound_at',
  'outbound_at',
  'returned_at',
  'sent_at',
  'expires_at',
  'last_attempt_at',
  'joined_at',
  'used_at',
]);

/**
 * 将 ISO 时间字符串转换为北京时间字符串格式 YYYY-MM-DD HH:mm:ss.SSS
 * 仅对有效的时间字符串做转换，无效或非字符串值原样返回
 */
function formatToBeijing(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  // 使用 Asia/Shanghai 时区格式化，保留毫秒
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  // 将格式化后的日期/时间部分拼接为 YYYY-MM-DD HH:mm:ss
  const parts = formatter.formatToParts(date);
  const get = (type: string): string => {
    const part = parts.find((p) => p.type === type);
    return part ? part.value : '';
  };
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
  const timeStr = `${get('hour')}:${get('minute')}:${get('second')}`;
  // 毫秒直接从原始 Date 取（UTC 毫秒不受时区影响）
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${dateStr} ${timeStr}.${ms}`;
}

/**
 * 递归处理对象/数组，将其中的时间戳字段从 ISO 转为北京时间字符串
 * @param data 任意响应数据
 * @returns 转换后的数据（同引用修改并返回）
 */
export function convertTimesToBeijing<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      data[i] = convertTimesToBeijing(data[i]);
    }
    return data;
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    const obj = data as Record<string, any>;
    for (const key of Object.keys(obj)) {
      if (TIMESTAMP_FIELDS.has(key) && typeof obj[key] === 'string' && obj[key] !== '') {
        obj[key] = formatToBeijing(obj[key]);
      } else {
        obj[key] = convertTimesToBeijing(obj[key]);
      }
    }
  }
  return data;
}
