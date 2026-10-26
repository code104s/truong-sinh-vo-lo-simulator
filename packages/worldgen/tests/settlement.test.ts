import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, DEFAULT_SETTLEMENT, fromWorld, generateSettlement, generateWorld, type SettlementParams } from '../src/index';

const world = generateWorld({ ...DEFAULT_PARAMS, seed: 'tsvl-01', width: 128, height: 96, naming: 'eastern' });
const towns = world.labels.filter((l) => l.kind === 'city' || l.kind === 'capital');

const paramsOf = (i: number): SettlementParams => {
  const t = towns[i]!;
  return { ...DEFAULT_SETTLEMENT, ...fromWorld(world, t) };
};
// stats.ms là thời gian đo được, không thuộc kết quả sinh
const digest = (p: SettlementParams) => {
  const { stats, ...rest } = generateSettlement(p);
  return createHash('sha256').update(JSON.stringify({ ...rest, stats: { ...stats, ms: 0 } })).digest('hex');
};

describe('settlement generator (Cartographer snapshot)', () => {
  it('the world has towns to build from', () => {
    expect(towns.length).toBeGreaterThan(0);
  });

  it('derives parameters from the world (name, population, culture)', () => {
    const p = paramsOf(0);
    expect(p.name).toBe(towns[0]!.name);
    expect(p.population).toBeGreaterThan(0);
    expect(['western', 'eastern', 'wa', 'islamic']).toContain(p.culture);
  });

  it('same parameters give the same town', () => {
    const p = paramsOf(towns.length - 1);
    expect(digest(p)).toBe(digest(p));
  });

  it('builds streets, wards and buildings', () => {
    const s = generateSettlement(paramsOf(towns.length - 1));
    expect(s.wards.length).toBeGreaterThan(0);
    expect(s.buildings.length).toBeGreaterThan(0);
  });
});
