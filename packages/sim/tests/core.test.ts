import { describe, expect, it } from 'vitest';
import { canonical, digestOf, hash32, hash64Hex, idiv, lerpTable, mulDiv, Rng, RngStreams, sortedEntries } from '../src/index';

describe('Rng', () => {
  it('cùng seed cùng dãy, khác seed khác dãy', () => {
    const a = Rng.fromSeed(42), b = Rng.fromSeed(42), c = Rng.fromSeed(43);
    const sa = Array.from({ length: 20 }, () => a.u32());
    expect(Array.from({ length: 20 }, () => b.u32())).toEqual(sa);
    expect(Array.from({ length: 20 }, () => c.u32())).not.toEqual(sa);
  });

  it('dãy pin (bắt trôi thuật toán)', () => {
    const r = Rng.fromSeed(1);
    expect(Array.from({ length: 4 }, () => r.u32())).toMatchInlineSnapshot(`
      [
        1130556604,
        2591592147,
        3014952990,
        960850752,
      ]
    `);
  });

  it('lưu và nạp trạng thái tiếp tục đúng dãy', () => {
    const a = Rng.fromSeed(7);
    for (let i = 0; i < 100; i++) a.u32();
    const b = Rng.fromState(a.state());
    expect(Array.from({ length: 50 }, () => b.int(0, 999))).toEqual(Array.from({ length: 50 }, () => a.int(0, 999)));
  });

  it('int đều và nằm trong khoảng', () => {
    const r = Rng.fromSeed(3);
    const counts = new Array(6).fill(0);
    for (let i = 0; i < 60_000; i++) {
      const x = r.int(1, 6);
      expect(x >= 1 && x <= 6).toBe(true);
      counts[x - 1]++;
    }
    for (const c of counts) expect(Math.abs(c - 10_000)).toBeLessThan(400);
    expect(r.int(5, 5)).toBe(5);
    expect(() => r.int(2, 1)).toThrow();
    expect(() => r.int(0, 1.5)).toThrow();
  });

  it('chance theo ppm', () => {
    const r = Rng.fromSeed(9);
    let hit = 0;
    for (let i = 0; i < 100_000; i++) if (r.chance(250_000)) hit++;
    expect(Math.abs(hit - 25_000)).toBeLessThan(600);
    expect(r.chance(0)).toBe(false);
    expect(r.chance(1_000_000)).toBe(true);
  });

  it('weighted theo trọng số nguyên', () => {
    const r = Rng.fromSeed(11);
    const counts = [0, 0, 0];
    for (let i = 0; i < 30_000; i++) counts[r.weighted([1, 0, 2])]!++;
    expect(counts[1]).toBe(0);
    expect(Math.abs(counts[2]! / counts[0]! - 2)).toBeLessThan(0.1);
    expect(() => r.weighted([0, 0])).toThrow();
    expect(() => r.weighted([1, -1])).toThrow();
  });

  it('từ chối trạng thái sai', () => {
    expect(() => Rng.fromState([1, 2, 3, 2 ** 32])).toThrow();
    expect(() => Rng.fromState([1, 2, 3, 0.5])).toThrow();
  });
});

describe('RngStreams', () => {
  it('thêm luồng mới không làm lệch luồng cũ', () => {
    const a = RngStreams.create(123, ['health', 'illness']);
    const b = RngStreams.create(123, ['accident', 'health', 'illness', 'names']);
    expect(b.get('health').u32()).toBe(a.get('health').u32());
    expect(b.get('illness').u32()).toBe(a.get('illness').u32());
  });

  it('rút ở luồng này không ảnh hưởng luồng kia', () => {
    const a = RngStreams.create(5, ['x', 'y']);
    const b = RngStreams.create(5, ['x', 'y']);
    for (let i = 0; i < 10; i++) a.get('x').u32();
    expect(a.get('y').u32()).toBe(b.get('y').u32());
  });

  it('snapshot/restore', () => {
    const a = RngStreams.create(99, ['b', 'a']);
    a.get('a').u32();
    const snap = a.snapshot();
    expect(Object.keys(snap.streams)).toEqual(['a', 'b']);
    const b = RngStreams.restore(JSON.parse(JSON.stringify(snap)));
    expect(b.get('a').u32()).toBe(a.get('a').u32());
    expect(() => b.get('zzz')).toThrow();
  });
});

describe('hash và digest', () => {
  it('hash32 phân biệt cách tách phần', () => {
    expect(hash32('ab', 'c')).not.toBe(hash32('a', 'bc'));
    expect(hash32('tsvl-01', 'r1/c3')).toBe(hash32('tsvl-01', 'r1/c3'));
    expect(hash32(1)).not.toBe(hash32('1'));
  });

  it('hash64Hex có 16 ký tự hex', () => {
    expect(hash64Hex('xin chào')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('canonical không phụ thuộc thứ tự khóa', () => {
    expect(canonical({ b: 1, a: [2, 'x', null, true] })).toBe(canonical({ a: [2, 'x', null, true], b: 1 }));
    expect(digestOf({ b: 1, a: 2 })).toBe(digestOf({ a: 2, b: 1 }));
    expect(digestOf({ a: 1 })).not.toBe(digestOf({ a: 2 }));
    expect(canonical({ a: undefined, b: 1 })).toBe('{"b":1}');
  });

  it('digest từ chối số thực (bắt rò số thực vào trạng thái)', () => {
    expect(() => digestOf({ hp: 0.5 })).toThrow(/\$\.hp/);
    expect(() => digestOf({ m: new Float32Array(2) })).toThrow();
    expect(() => digestOf({ n: Number.NaN })).toThrow();
  });
});

describe('toán số nguyên', () => {
  it('idiv, mulDiv', () => {
    expect(idiv(7, 2)).toBe(3);
    expect(idiv(-7, 2)).toBe(-3);
    expect(() => idiv(1, 0)).toThrow();
    expect(() => idiv(1.5, 1)).toThrow();
    expect(mulDiv(1000, 7, 3)).toBe(2333);
  });

  it('lerpTable', () => {
    const t = [[0, 600], [20, 1000], [55, 1000], [100, 250]] as const;
    expect(lerpTable(t, -5)).toBe(600);
    expect(lerpTable(t, 10)).toBe(800);
    expect(lerpTable(t, 40)).toBe(1000);
    expect(lerpTable(t, 100)).toBe(250);
    expect(lerpTable(t, 200)).toBe(250);
  });

  it('sortedEntries', () => {
    expect(sortedEntries({ b: 2, a: 1 })).toEqual([['a', 1], ['b', 2]]);
  });
});
