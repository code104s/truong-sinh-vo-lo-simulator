// Băm 32 bit thuần số nguyên (ADR 0003). Không dùng node:crypto để chạy giống hệt trong worker trình duyệt.

/** Trộn cuối kiểu murmur3 (fmix32). */
export function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** FNV-1a trên đơn vị UTF-16, có tham số seed, rồi fmix32. */
export function hashString(s: string, seed = 0): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return fmix32(h);
}

/** Băm nhiều phần (chuỗi hoặc u32) theo thứ tự; phần tách nhau nên ("ab","c") ≠ ("a","bc"). */
export function hash32(...parts: (string | number)[]): number {
  let h = 0x9e3779b9;
  for (const p of parts) {
    const x = typeof p === 'number' ? fmix32(p >>> 0) : hashString(p, 0x5bd1e995);
    h = fmix32((h ^ x) + 0x7f4a7c15 + Math.imul(h, 31));
  }
  return h;
}

const hex8 = (n: number) => (n >>> 0).toString(16).padStart(8, '0');

/** Hai luồng băm độc lập trên cùng chuỗi → 16 ký tự hex. */
export function hash64Hex(s: string): string {
  return hex8(hashString(s, 0x00000000)) + hex8(hashString(s, 0x2545f491));
}
