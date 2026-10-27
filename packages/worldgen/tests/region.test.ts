import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BIRTHPLACE_ID_RE, vBirthplace, vRegionMapData, vRegionSummary } from '@tsvl/shared';
import { describe, expect, it } from 'vitest';
import { buildRegion, FERTILITY_MAX, FERTILITY_MIN, fertilityOf, HANVIET_CHARS, regionIdentity, toHanViet, type RegionBundle } from '../src/index';
import { reachableCounties } from '../src/region/connectivity';

const SEEDS = ['tsvl-01', 'tsvl-02', 'tsvl-03'];
const built = new Map<string, RegionBundle>();
const region = (seed: string) => {
  if (!built.has(seed)) built.set(seed, buildRegion(seed));
  return built.get(seed)!;
};
const idDigest = (b: RegionBundle) => createHash('sha256').update(JSON.stringify(regionIdentity(b))).digest('hex').slice(0, 16);

describe('Hán-Việt', () => {
  it('đổi tên và viết hoa từng âm tiết', () => {
    expect(toHanViet('渭京')).toBe('Vị Kinh');
    expect(toHanViet('大秦')).toBe('Đại Tần');
    expect(toHanViet('青山')).toBe('Thanh Sơn');
    expect(toHanViet('拉武西尔')).toBeNull();
    expect(toHanViet('')).toBeNull();
  });

  it('phủ hết bộ chữ eastern của Cartographer (bắt khi upstream đổi bộ chữ)', () => {
    const src = readFileSync(join(import.meta.dirname, '../src/cartographer/gen/naming.ts'), 'utf8');
    const morphemes = [...src.matchAll(/(\p{Script=Han}):[a-z]+:/gu)].map((m) => m[1]!);
    const easternBlock = src.slice(src.indexOf('const EASTERN'), src.indexOf('const WA:'));
    const realmBlock = src.slice(src.indexOf('const REALM_EASTERN'), src.indexOf('const REALM_WA'));
    // Mẫu dạng ['en', 'zh', 'ja']: chỉ lấy cột zh
    const zhTemplates = [...(easternBlock + realmBlock).matchAll(/\['[^']*', '([^']*)', '[^']*'\]/g)].map((m) => m[1]!).join('');
    const suffixes = [...zhTemplates].filter((c) => /\p{Script=Han}/u.test(c));
    expect(suffixes.length).toBeGreaterThan(10);
    // Bộ hình vị của WA dùng tiếng Nhật, không thuộc eastern: chỉ lấy các bảng EAST_*
    const eastSrc = src.slice(src.indexOf('const EAST_POOL'), src.indexOf('/** 拼音连写'));
    const eastMorphemes = [...eastSrc.matchAll(/(\p{Script=Han}):[a-z]+:/gu)].map((m) => m[1]!);
    expect(morphemes.length).toBeGreaterThan(eastMorphemes.length);
    const missing = [...new Set([...eastMorphemes, ...suffixes])].filter((c) => !HANVIET_CHARS.includes(c));
    expect(missing).toEqual([]);
  });
});

describe('vùng chơi (1024×768)', () => {
  it('cùng seed cho cùng vùng và cùng nơi sinh', () => {
    const a = region('tsvl-01');
    const b = buildRegion('tsvl-01');
    expect(regionIdentity(b)).toEqual(regionIdentity(a));
    expect(b.logic).toEqual(a.logic);
    expect(Array.from(b.map.elevation)).toEqual(Array.from(a.map.elevation));
  });

  it.each(SEEDS)('%s: dữ liệu đúng hợp đồng', (seed) => {
    const b = region(seed);
    expect(vRegionMapData.check(b.map, '$map')).toBeNull();
    expect(vRegionSummary.check(b.summary, '$summary')).toBeNull();
    for (const p of b.birthplaces) expect(vBirthplace.check(p, '$bp')).toBeNull();
  });

  it.each(SEEDS)('%s: quy mô vùng và nơi sinh theo GDD 3.2 D', (seed) => {
    const b = region(seed);
    expect(b.map.counties.length).toBeGreaterThanOrEqual(5);
    expect(b.map.counties.length).toBeLessThanOrEqual(30);
    const kinds = (k: string) => b.birthplaces.filter((p) => p.kind === k).length;
    expect(kinds('city')).toBe(1);
    expect(kinds('town')).toBeGreaterThanOrEqual(1);
    expect(kinds('town')).toBeLessThanOrEqual(3);
    expect(kinds('village')).toBeGreaterThanOrEqual(5);
    expect(kinds('village')).toBeLessThanOrEqual(10);
    expect(b.summary.landKm2).toBeGreaterThan(10_000);
  });

  it.each(SEEDS)('%s: id ổn định, duy nhất; tên Hán-Việt; nơi sinh nằm trên đất của vùng', (seed) => {
    const b = region(seed);
    const ids = b.birthplaces.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of b.birthplaces) {
      expect(p.id).toMatch(BIRTHPLACE_ID_RE);
      expect(p.id.startsWith(`${b.summary.id}/`)).toBe(true);
      expect(toHanViet(p.nameHan)).toBe(p.name);
      const i = p.cell.y * b.map.W + p.cell.x;
      expect(b.map.mask[i]).toBe(1);
      expect(b.map.county[i]).toBe(p.county);
    }
    const names = b.birthplaces.map((p) => p.nameHan);
    expect(new Set(names).size).toBe(names.length);
    for (const c of b.map.counties) expect(toHanViet(c.nameHan)).toBe(c.name);
  });

  it.each(SEEDS)('%s: lớp logic là số nguyên, kề cận đối xứng', (seed) => {
    const { logic, map } = region(seed);
    const n = map.counties.length;
    expect(logic.counties).toHaveLength(n);
    expect(logic.settlementKind).toHaveLength(n);
    expect(logic.terrainPct).toHaveLength(logic.adjacency.length);
    expect(logic.terrainPct.every((p) => [100, 150, 200, 300].includes(p))).toBe(true);
    const capital = region(seed).birthplaces.find((p) => p.kind === 'city')!;
    expect(reachableCounties(capital.county, logic.adjacency).size).toBe(n);
    expect(logic.settlementKind[capital.county]).toBe('city');
    for (const p of region(seed).birthplaces) if (p.kind !== 'village') expect(logic.settlementKind[p.county]).toBe(p.kind);
    expect(logic.seatKm).toHaveLength(n);
    for (let i = 0; i < n; i++) {
      expect(logic.seatKm[i]![i]).toBe(0);
      for (let j = 0; j < n; j++) {
        expect(Number.isInteger(logic.seatKm[i]![j])).toBe(true);
        expect(logic.seatKm[i]![j]).toBe(logic.seatKm[j]![i]);
      }
    }
    for (const [a, b] of logic.adjacency) expect(a).toBeLessThan(b);
    expect(logic.adjacency.length).toBeGreaterThanOrEqual(n - 1);
  });

  it('hệ số địa hình phân biệt được tuyến (hồi quy: ngưỡng sông cũ tính 91% cạnh là qua sông)', () => {
    const all = SEEDS.flatMap((seed) => region(seed).logic.terrainPct);
    const plain = all.filter((p) => p === 100).length;
    expect(plain / all.length).toBeGreaterThanOrEqual(0.25);
    expect(all.some((p) => p > 100)).toBe(true);
  });

  it('độ phì nhiêu (ADR 0012): số nguyên trong khoảng, mỗi quận một giá trị, có phân biệt', () => {
    for (const seed of SEEDS) {
      const { logic, map } = region(seed);
      expect(logic.fertilityPct).toHaveLength(map.counties.length);
      for (const f of logic.fertilityPct) {
        expect(Number.isInteger(f)).toBe(true);
        expect(f).toBeGreaterThanOrEqual(FERTILITY_MIN);
        expect(f).toBeLessThanOrEqual(FERTILITY_MAX);
      }
    }
    // Vùng đồi núi (tsvl-01) phải chênh rõ giữa các quận
    const f1 = region('tsvl-01').logic.fertilityPct;
    expect(Math.max(...f1) - Math.min(...f1)).toBeGreaterThanOrEqual(15);
    expect(region(SEEDS[0]!).logic.fertilityPct).toMatchInlineSnapshot(`
      [
        114,
        70,
        72,
        70,
        94,
        109,
        75,
        72,
        73,
      ]
    `);
  });

  it('công thức phì nhiêu: sông cộng, cao và lạnh trừ, kẹp hai đầu', () => {
    expect(fertilityOf(50, 150, 0)).toBe(100);
    expect(fertilityOf(50, 150, 90)).toBe(109);
    expect(fertilityOf(50, 150, 500)).toBe(120); // sông cộng tối đa +20
    expect(fertilityOf(400, 150, 0)).toBe(75);
    expect(fertilityOf(50, 120, 0)).toBe(90);
    expect(fertilityOf(2000, 50, 0)).toBe(FERTILITY_MIN);
  });

  it('digest vùng pin (bắt trôi do sửa code hoặc engine)', () => {
    expect(SEEDS.map((s) => idDigest(region(s)))).toMatchInlineSnapshot(`
      [
        "7826949e1db7c03e",
        "fedc87b3720106f9",
        "6dfd01a639539d10",
      ]
    `);
  });
});
