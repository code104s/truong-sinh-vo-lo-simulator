import { describe, expect, it } from 'vitest';
import { birthplaceId, regionId, type Tenure } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { Life } from '../src/index';
import { autoAdvance, lastChoice } from './auto';
import { FARM_YIELD_PER_WEEK, harvestPlayer, recordFarmWeek, WEEKS_PER_MU } from '../src/economy/farming';
import { createEconomy, HARVEST_MONTH } from '../src/economy/market';
import type { CharacterState } from '../src/life/character';

/** Quận 0 làng (phì 100), quận 1 trấn (phì 120). */
const region: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [0, 1].map((worldIndex) => ({ worldIndex, area: 100, seat: { x: worldIndex, y: 0 }, name: `Quận ${worldIndex}` })),
  settlementKind: ['village', 'town'], adjacency: [[0, 1]], terrainPct: [100], fertilityPct: [100, 120], seatKm: [[0, 60], [60, 0]],
};

function adult(patch: (c: CharacterState) => void = () => {}, seed = 'farm') {
  const l = Life.create({ worldSeed: seed, regionId: regionId('r0'), birthplaceId: birthplaceId('r0/c0') }, { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village', cell: { x: 0, y: 0 }, county: 0 }, region);
  const s = l.snapshot();
  s.character.birthTick = 0; s.tick = 20 * 36 + 2;
  s.character.health = s.character.healthMax = 1000; s.character.stamina = 900; s.character.conditions = [];
  s.character.skillXp.farming = 0;
  patch(s.character);
  return Life.restore(s, [], region);
}

/** Nhân vật và chợ để gọi harvestPlayer trực tiếp; thời tiết 100% mọi quận. */
function setup(weeks: number, opts: { county?: number; tenure?: Tenure; landMu?: number; skill?: number; weather?: number } = {}) {
  const c = adult().snapshot().character;
  c.skillXp.farming = opts.skill ?? 0;
  c.household = { ...c.household, independent: true, tenure: opts.tenure ?? 'tenant', landMu: opts.landMu ?? 0, farmWeeks: weeks, farmCounty: opts.county ?? 0 };
  const eco = createEconomy(region, 0);
  for (const ce of eco.counties) ce.weatherPct = opts.weather ?? 100;
  return { c, eco };
}

describe('tuần công và thu hoạch (ADR 0012)', () => {
  it('tuần công cộng dồn trong mùa; làm ở quận khác là bỏ ruộng cũ', () => {
    const h = setup(0).c.household;
    recordFarmWeek(h, 0); recordFarmWeek(h, 0);
    expect([h.farmWeeks, h.farmCounty]).toEqual([2, 0]);
    recordFarmWeek(h, 1);
    expect([h.farmWeeks, h.farmCounty]).toEqual([1, 1]);
  });

  it('tá điền: nộp tô 50% vào kho quận, không thuế điền', () => {
    const { c, eco } = setup(10);
    const before = eco.counties[0]!.grain;
    const r = harvestPlayer(c, eco, region);
    expect(r).toMatchObject({ gross: 10 * FARM_YIELD_PER_WEEK, rent: 5 * FARM_YIELD_PER_WEEK, tax: 0, net: 5 * FARM_YIELD_PER_WEEK });
    expect(eco.counties[0]!.grain).toBe(before + r.rent);
    expect(c.household.grain).toBe(r.net);
    expect(c.household.farmWeeks).toBe(0);
  });

  it('tự canh trên ruộng nhà: chỉ nộp thuế điền 10%; làm quá số đất thì phần dư là ruộng thuê', () => {
    const own = harvestPlayer(...(() => { const s = setup(12, { tenure: 'owner', landMu: 6 }); return [s.c, s.eco, region] as const; })());
    expect(own).toMatchObject({ gross: 600, tax: 60, rent: 0, net: 540 });
    const over = harvestPlayer(...(() => { const s = setup(6 * WEEKS_PER_MU + 6, { tenure: 'owner', landMu: 6 }); return [s.c, s.eco, region] as const; })());
    expect(over).toMatchObject({ gross: 24 * 50, tax: 18 * 5, rent: 6 * 25 });
  });

  it('ruộng ở quận khác quận nhà thì là ruộng thuê dù nhà có đất', () => {
    const { c, eco } = setup(10, { tenure: 'owner', landMu: 6, county: 1 });
    const r = harvestPlayer(c, eco, region);
    expect(r.tax).toBe(0);
    expect(r.rent).toBe(r.gross / 2);
    expect(r.gross).toBe(10 * FARM_YIELD_PER_WEEK * 120 / 100); // độ phì quận 1
  });

  it('sản lượng tăng theo kỹ năng, độ phì, thời tiết; mất mùa thu ít', () => {
    const gross = (o: Parameters<typeof setup>[1]) => { const s = setup(10, o); return harvestPlayer(s.c, s.eco, region).gross; };
    expect(gross({ skill: 10_000 })).toBe(gross({}) * 160 / 100);
    expect(gross({ county: 1 })).toBeGreaterThan(gross({ county: 0 }));
    expect(gross({ weather: 50 })).toBe(gross({}) / 2);
    expect(gross({ weather: 120 })).toBeGreaterThan(gross({}));
  });

  it('nhà giàu thu tô phần đất cho thuê từ kho dân nền quận nhà, theo thời tiết; tự làm thì phần cho thuê ít đi', () => {
    const rent = (weeks: number, weather = 100) => {
      const { c, eco } = setup(weeks, { tenure: 'landlord', landMu: 40, weather });
      const home = eco.counties[0]!.grain;
      const r = harvestPlayer(c, eco, region);
      expect(eco.counties[0]!.grain).toBe(home - r.landlordIncome + r.tax);
      return r.landlordIncome;
    };
    expect(rent(0)).toBe(40 * WEEKS_PER_MU * FARM_YIELD_PER_WEEK / 2 * 90 / 100);
    expect(rent(0, 50)).toBe(rent(0) / 2);
    const r37 = 37 * WEEKS_PER_MU * FARM_YIELD_PER_WEEK / 2; // tự làm 3 mẫu, cho thuê 37 mẫu
    expect(rent(9)).toBe(r37 - Math.trunc(r37 / 10)); // thuế làm tròn về 0 như sim
  });

  it('kho quận cạn thì tô thu được bao nhiêu hay bấy nhiêu (không tạo từ hư không)', () => {
    const { c, eco } = setup(0, { tenure: 'landlord', landMu: 40 });
    eco.counties[0]!.grain = 100;
    expect(harvestPlayer(c, eco, region).landlordIncome).toBe(100);
    expect(eco.counties[0]!.grain).toBe(0);
  });
});

describe('mùa vụ trong đời', () => {
  it('làm ruộng cả năm: gặt một lần đầu tháng thu hoạch, lương vào kho, mùa đông không tính tuần công', () => {
    const l = adult();
    l.setPlan({ slots: [{ action: 'action.farm' }, { action: 'action.farm' }, { action: 'action.rest' }] });
    const harvests: number[] = [];
    for (let i = 0; i < 36 * 2; i++) {
      autoAdvance(l, 'week', lastChoice);
      const h = l.log.filter((e) => e.key === 'log.harvest.own');
      if (h.length > harvests.length) harvests.push(l.character.household.grain);
    }
    expect(harvests).toHaveLength(2);
    const first = l.log.find((e) => e.key === 'log.harvest.own')!;
    expect((first.tick % 36) / 3 + 1).toBe(HARVEST_MONTH);
    expect(Number(first.params.net)).toBeGreaterThan(0);
    // Năm đủ: tháng 9–12 trừ đông (tháng 10–12) và tháng 1–8: 2 ô × 9 tháng = 18 tuần công tối đa
    const full = l.log.filter((e) => e.key === 'log.harvest.own')[1]!;
    expect(Number(full.params.net) + Number(full.params.rent) + Number(full.params.tax)).toBeLessThanOrEqual(18 * 5 * 2);
  });

  it('không làm ruộng thì không có gì để gặt, không ghi nhật ký', () => {
    const l = adult();
    l.setPlan({ slots: [{ action: 'action.rest' }, { action: 'action.rest' }, { action: 'action.rest' }] });
    for (let i = 0; i < 36; i++) autoAdvance(l, 'week', lastChoice);
    expect(l.log.some((e) => e.key.startsWith('log.harvest.'))).toBe(false);
    expect(l.character.household.grain).toBe(0);
  });
});
