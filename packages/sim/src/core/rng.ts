// RNG số nguyên có seed, lưu/nạp được trạng thái (ADR 0003). sfc32, khởi tạo bằng splitmix32.
import { hash32 } from './hash';

/** 4 × u32 */
export type RngState = readonly [number, number, number, number];

const TWO32 = 0x100000000;

export class Rng {
  private constructor(
    private a: number,
    private b: number,
    private c: number,
    private d: number,
  ) {}

  static fromSeed(seed: number): Rng {
    let s = seed >>> 0;
    const next = () => {
      s = (s + 0x9e3779b9) >>> 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
      return (z ^ (z >>> 15)) >>> 0;
    };
    const r = new Rng(next(), next(), next(), next());
    for (let i = 0; i < 12; i++) r.u32();
    return r;
  }

  static fromState(s: RngState): Rng {
    for (const x of s) if (!Number.isSafeInteger(x) || x < 0 || x >= TWO32) throw new RangeError(`trạng thái RNG sai: ${s.join(',')}`);
    return new Rng(s[0], s[1], s[2], s[3]);
  }

  state(): RngState {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
  }

  /** [0, 2^32) */
  u32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Đều trên lo..hi (gồm cả hai đầu), không lệch: loại bỏ phần dư theo ngưỡng. */
  int(lo: number, hi: number): number {
    if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi) || hi < lo) throw new RangeError(`int(${lo}, ${hi})`);
    const span = hi - lo + 1;
    if (span > TWO32) throw new RangeError(`int: khoảng quá rộng ${span}`);
    if (span === TWO32) return lo + this.u32();
    const limit = TWO32 - (TWO32 % span);
    let x = this.u32();
    while (x >= limit) x = this.u32();
    return lo + (x % span);
  }

  /** Xác suất tính bằng phần triệu (ppm), số nguyên. ≤ 0 không bao giờ, ≥ 1e6 luôn luôn; vẫn rút một số để giữ nhịp luồng. */
  chance(ppm: number): boolean {
    return this.int(0, 999_999) < ppm;
  }

  /** Chỉ số theo trọng số nguyên ≥ 0 (tổng > 0). */
  weighted(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) {
      if (!Number.isSafeInteger(w) || w < 0) throw new RangeError(`trọng số sai: ${w}`);
      total += w;
    }
    if (total <= 0) throw new RangeError('tổng trọng số bằng 0');
    let r = this.int(0, total - 1);
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i]!;
      if (r < 0) return i;
    }
    throw new Error('không tới được');
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new RangeError('pick: mảng rỗng');
    return arr[this.int(0, arr.length - 1)]!;
  }
}

/**
 * Các luồng có tên, mỗi hệ thống một luồng. Seed luồng = hash32(root, tên): thêm luồng mới không làm lệch luồng cũ.
 * Snapshot sắp xếp theo tên.
 */
export class RngStreams {
  private readonly streams = new Map<string, Rng>();

  private constructor(private readonly root: number) {}

  static create(root: number, names: readonly string[]): RngStreams {
    const s = new RngStreams(root >>> 0);
    for (const n of [...names].sort()) s.streams.set(n, Rng.fromSeed(hash32(root >>> 0, n)));
    return s;
  }

  static restore(snap: RngStreamsSnapshot): RngStreams {
    const s = new RngStreams(snap.root);
    for (const n of Object.keys(snap.streams).sort()) s.streams.set(n, Rng.fromState(snap.streams[n]!));
    return s;
  }

  get(name: string): Rng {
    const r = this.streams.get(name);
    if (!r) throw new Error(`không có luồng RNG "${name}"`);
    return r;
  }

  snapshot(): RngStreamsSnapshot {
    const streams: Record<string, RngState> = {};
    for (const n of [...this.streams.keys()].sort()) streams[n] = this.streams.get(n)!.state();
    return { root: this.root, streams };
  }
}

export interface RngStreamsSnapshot {
  root: number;
  streams: Record<string, RngState>;
}
