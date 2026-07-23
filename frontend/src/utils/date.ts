/**
 * Format backend Beijing timestamp strings without relying on browser Date parsing.
 * Backend returns "YYYY-MM-DD HH:mm:ss.SSS"; Safari/iOS does not reliably parse that shape.
 */
export function formatBeijingTimestamp(value?: string | null): string {
  if (!value) return '-';

  const normalized = value.trim();
  const match = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?/,
  );

  if (match) {
    const [, y, m, d, hh, mm, ss = '00'] = match;
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalized;

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(
    parsed.getHours(),
  )}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`;
}
