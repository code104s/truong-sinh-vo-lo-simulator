import { EVENTS_VI } from './events.vi';
import { EVENTS_CAREERS_VI } from './events.careers.vi';
import { EVENTS_CULTIVATION_VI } from './events.cultivation.vi';
import { VI as BASE_VI } from './vi';

/** Mọi chuỗi: giao diện, nhật ký (vi.ts) và sự kiện (events.vi.ts; v0.7 S8: events.careers.vi.ts; v0.8: events.cultivation.vi.ts). */
const VI: Readonly<Record<string, string>> = { ...BASE_VI, ...EVENTS_VI, ...EVENTS_CAREERS_VI, ...EVENTS_CULTIVATION_VI };

export type Params = Readonly<Record<string, string | number>>;

/**
 * Dịch khóa nội dung. Tham số là chuỗi trùng một khóa thì được dịch tiếp (vd. illness: "illness.fever").
 * Khóa thiếu trả về chính khóa, đặt trong ngoặc để dễ thấy khi thử.
 */
export function t(key: string, params: Params = {}): string {
  const template = VI[key];
  if (template === undefined) return `⟨${key}⟩`;
  return template.replace(/\{(\w+)\}/g, (_m, name: string) => {
    const v = params[name];
    if (v === undefined) return `{${name}}`;
    return typeof v === 'string' && VI[v] !== undefined ? VI[v] : String(v);
  });
}

export const hasKey = (key: string): boolean => VI[key] !== undefined;

/**
 * Sự kiện đường tiên (v0.8 F3): mọi sự kiện có văn bản ở events.cultivation.vi.ts (nhóm `cultivation` của sim, test giữ
 * hai bên khớp). Thẻ sự kiện đóng triện riêng, biên niên lọc "Đạo".
 */
export const CULTIVATION_EVENT_IDS: ReadonlySet<string> = new Set(
  Object.keys(EVENTS_CULTIVATION_VI).filter((k) => k.endsWith('.title')).map((k) => k.slice(0, -'.title'.length)),
);

export { VI };
