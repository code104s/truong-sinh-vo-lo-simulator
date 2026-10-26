import { VI } from './vi';

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

export { VI };
