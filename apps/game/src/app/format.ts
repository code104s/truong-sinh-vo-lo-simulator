// Định dạng hiển thị từ dữ liệu worker + chuỗi nội dung. Không có luật game.
import { t } from '@tsvl/content';
import { calendarOf, type CalendarDate, type LogEntry, type Tick } from '@tsvl/shared';

export const dateText = (d: CalendarDate) => t('date.full', { year: d.year, month: `month.${d.month}`, tenDay: `tenday.${d.tenDay}` });
/** Ngày đặt giữa câu, vd. "hạ tuần tháng Sáu năm 17". */
export const inlineDate = (tick: Tick) => {
  const d = calendarOf(tick);
  return t('date.inline', { year: d.year, month: `month.${d.month}`, tenDay: `tenday.${d.tenDay}` });
};
export const shortDate = (tick: Tick) => {
  const d = calendarOf(tick);
  return t('date.short', { year: d.year, month: `month.${d.month}` });
};

/** Câu nhật ký; mục khỏi bệnh có di chứng dùng biến thể ".scar". */
export function logText(e: LogEntry): string {
  const key = e.params.scar === 1 ? `${e.key}.scar` : e.key;
  return t(key, e.params);
}

export function randomSeed(): string {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
  return `tsvl-${s}`;
}
