// Digest chuẩn hóa (ADR 0003): khóa sắp xếp, chỉ số nguyên/chuỗi/boolean/null. Gặp số thực → ném lỗi.
import { hash64Hex } from './hash';

/** Chuỗi chuẩn hóa của một giá trị. Bỏ khóa có giá trị undefined (giống JSON). */
export function canonical(value: unknown, path = '$'): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isSafeInteger(value)) throw new TypeError(`digest: ${path} không phải số nguyên (${value})`);
      return String(value);
    case 'object': {
      if (value instanceof Int16Array || value instanceof Uint8Array || value instanceof Int32Array || value instanceof Uint32Array) {
        return `[${Array.from(value).join(',')}]`;
      }
      if (ArrayBuffer.isView(value)) throw new TypeError(`digest: ${path} là mảng số thực`);
      if (Array.isArray(value)) return `[${value.map((v, i) => canonical(v, `${path}[${i}]`)).join(',')}]`;
      const o = value as Record<string, unknown>;
      const parts: string[] = [];
      for (const k of Object.keys(o).sort()) {
        if (o[k] === undefined) continue;
        parts.push(`${JSON.stringify(k)}:${canonical(o[k], `${path}.${k}`)}`);
      }
      return `{${parts.join(',')}}`;
    }
    default:
      throw new TypeError(`digest: ${path} có kiểu ${typeof value}`);
  }
}

export function digestOf(value: unknown): string {
  return hash64Hex(canonical(value));
}
