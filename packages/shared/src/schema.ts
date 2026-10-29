// Validate viết tay tại ranh giới worker (ADR 0001, phương án 2). Không có luật game ở đây.

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Kiểm tra một giá trị; trả thông báo lỗi kèm đường dẫn, hoặc null nếu hợp lệ. */
export interface Validator<T> {
  readonly check: (u: unknown, path: string) => string | null;
  /** Khóa được phép vắng trong obj(). */
  readonly optional?: true;
  /** Kiểu ma, bất biến theo T để obj() bắt lệch giữa validator và interface. */
  readonly __type?: (t: T) => T;
}

const v = <T>(check: (u: unknown, path: string) => string | null): Validator<T> => ({ check });

const isRecord = (u: unknown): u is Record<string, unknown> =>
  typeof u === 'object' && u !== null && !Array.isArray(u) && !ArrayBuffer.isView(u);

export const str: Validator<string> = v((u, p) => (typeof u === 'string' ? null : `${p}: cần chuỗi`));
export const nonEmpty: Validator<string> = v((u, p) => (typeof u === 'string' && u.length > 0 ? null : `${p}: cần chuỗi khác rỗng`));
export const bool: Validator<boolean> = v((u, p) => (typeof u === 'boolean' ? null : `${p}: cần boolean`));
export const int: Validator<number> = v((u, p) => (Number.isSafeInteger(u) ? null : `${p}: cần số nguyên`));
export const nat: Validator<number> = v((u, p) => (Number.isSafeInteger(u) && (u as number) >= 0 ? null : `${p}: cần số nguyên ≥ 0`));
/** Số hữu hạn (chỉ dùng cho dữ liệu vẽ bản đồ). */
export const num: Validator<number> = v((u, p) => (typeof u === 'number' && Number.isFinite(u) ? null : `${p}: cần số hữu hạn`));
export const unknownValue: Validator<unknown> = v(() => null);

export const intRange = (lo: number, hi: number): Validator<number> =>
  v((u, p) => (Number.isSafeInteger(u) && (u as number) >= lo && (u as number) <= hi ? null : `${p}: cần số nguyên trong ${lo}..${hi}`));

/** Chuỗi có nhãn kiểu (branded); chỉ kiểm tra theo biểu thức chính quy. */
export const brand = <B extends string>(re: RegExp): Validator<B> =>
  v((u, p) => (typeof u === 'string' && re.test(u) ? null : `${p}: sai định dạng ${re}`));

export const lit = <L extends string | number | boolean>(value: L): Validator<L> =>
  v((u, p) => (u === value ? null : `${p}: cần ${JSON.stringify(value)}`));

export const oneOf = <const L extends readonly (string | number)[]>(values: L): Validator<L[number]> =>
  v((u, p) => (values.includes(u as L[number]) ? null : `${p}: cần một trong ${values.join(', ')}`));

export const opt = <T>(inner: Validator<T>): Validator<T | undefined> => ({ check: inner.check, optional: true });

export const nullable = <T>(inner: Validator<T>): Validator<T | null> =>
  v((u, p) => (u === null ? null : inner.check(u, p)));

export const arr = <T>(item: Validator<T>): Validator<T[]> =>
  v((u, p) => {
    if (!Array.isArray(u)) return `${p}: cần mảng`;
    for (let i = 0; i < u.length; i++) {
      const e = item.check(u[i], `${p}[${i}]`);
      if (e) return e;
    }
    return null;
  });

export const record = <T>(value: Validator<T>): Validator<Record<string, T>> =>
  v((u, p) => {
    if (!isRecord(u)) return `${p}: cần object`;
    for (const k of Object.keys(u).sort()) {
      const e = value.check(u[k], `${p}.${k}`);
      if (e) return e;
    }
    return null;
  });

export const union = <A, B>(a: Validator<A>, b: Validator<B>): Validator<A | B> =>
  v((u, p) => {
    const ea = a.check(u, p);
    if (!ea) return null;
    const eb = b.check(u, p);
    return eb ? `${ea} | ${eb}` : null;
  });

export const f32: Validator<Float32Array> = v((u, p) => (u instanceof Float32Array ? null : `${p}: cần Float32Array`));
export const i16: Validator<Int16Array> = v((u, p) => (u instanceof Int16Array ? null : `${p}: cần Int16Array`));
export const u8: Validator<Uint8Array> = v((u, p) => (u instanceof Uint8Array ? null : `${p}: cần Uint8Array`));

/**
 * Object với đúng các khóa đã khai báo. Khóa lạ bị từ chối: chặn trường ẩn (linh căn, thọ nguyên…)
 * lọt qua ranh giới worker.
 */
export const obj = <T>(shape: { [K in keyof T]-?: Validator<T[K]> }): Validator<T> =>
  v((u, p) => {
    if (!isRecord(u)) return `${p}: cần object`;
    const keys = Object.keys(shape) as (keyof T & string)[];
    for (const k of keys) {
      const f = shape[k] as Validator<unknown>;
      if (!(k in u) || u[k] === undefined) {
        if (f.optional) continue;
        return `${p}.${k}: thiếu`;
      }
      const e = f.check(u[k], `${p}.${k}`);
      if (e) return e;
    }
    for (const k of Object.keys(u)) if (!(k in shape)) return `${p}.${k}: khóa không có trong hợp đồng`;
    return null;
  });

/** Hợp có phân biệt theo trường `type`. */
export const tagged = <T extends { type: string }>(variants: { [K in T['type']]: Validator<Extract<T, { type: K }>> }): Validator<T> =>
  v((u, p) => {
    if (!isRecord(u) || typeof u.type !== 'string') return `${p}.type: thiếu`;
    const variant = (variants as Record<string, Validator<unknown>>)[u.type];
    if (!variant || !Object.prototype.hasOwnProperty.call(variants, u.type)) return `${p}.type: không biết "${u.type}"`;
    return variant.check(u, p);
  });

export function parseWith<T>(validator: Validator<T>, u: unknown, root = '$'): Result<T> {
  const error = validator.check(u, root);
  return error ? { ok: false, error } : { ok: true, value: u as T };
}
