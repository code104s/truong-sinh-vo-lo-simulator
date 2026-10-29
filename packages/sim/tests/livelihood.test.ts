// v0.7 S2: nông dân, thợ thủ công, thợ săn — bậc nghề đổi thu nhập và rủi ro; việc riêng của nghề; mua ruộng (ADR 0020).
import { birthplaceId, regionId, type CareerId, type CareerRank, type MonthPlan } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { describe, expect, it } from 'vitest';
import { Life, Rng } from '../src/index';
import { autoAdvance, lastChoice, pastComingOfAge } from './auto';
import { ACTIONS, actionDef, actionLock } from '../src/life/actions';
import {
  CRAFT_MATERIAL, CRAFT_PAY, CRAFT_PUPIL_GRAIN, HIRE_WAGE, HUNT_HIDE, HUNT_MEAT, LAND_PRICE, LAND_SALE_MU, LANDLORD_MU, landPrice, settleAction,
  TRAP_HIDE, TRAP_MEAT,
} from '../src/economy/income';
import { FARM_YIELD_PER_WEEK, harvestPlayer } from '../src/economy/farming';
import { createEconomy, worldYearStart, type CountyEconomy } from '../src/economy/market';
import { slotEffects } from '../src/life/player';
import type { CareerState } from '../src/life/career';
import type { CharacterState } from '../src/life/character';

/** Quận 0 làng, quận 1 trấn, kề nhau. */
const region: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [0, 1].map((worldIndex) => ({ worldIndex, area: 100, seat: { x: worldIndex, y: 0 }, name: `Quận ${worldIndex}` })),
  settlementKind: ['village', 'town'], adjacency: [[0, 1]], terrainPct: [100], fertilityPct: [100, 100], seatKm: [[0, 60], [60, 0]],
};
const bp = { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village' as const, cell: { x: 0, y: 0 }, county: 0 };

/** Người chơi 20 tuổi đã ra riêng, kỹ năng 0, đủ sức; nghề tùy test. */
function adult(patch: (c: CharacterState) => void = () => {}) {
  const s = Life.create({ worldSeed: 'livelihood', regionId: regionId('r0'), birthplaceId: bp.id }, bp, region).snapshot();
  s.character.birthTick = 0; s.tick = 20 * 36 + 9;
  s.character.health = s.character.healthMax = 1000; s.character.stamina = 900; s.character.conditions = [];
  for (const k of Object.keys(s.character.skillXp) as (keyof CharacterState['skillXp'])[]) s.character.skillXp[k] = 0;
  Object.assign(s.character.household, { independent: true, money: 5_000, grain: 500 });
  patch(s.character);
  return pastComingOfAge(s);
}
const career = (id: CareerId, rank: CareerRank): CareerState => ({ id, rank, since: 0, faction: null, mentor: null, years: 0, weeks: 0, idle: 0 });
const market = (money = 1_000_000): CountyEconomy => ({ ...createEconomy(region, 0).counties[1]!, money });
const tick = 20 * 36 + 9;
const always = { chance: () => true } as unknown as Rng;
const never = { chance: () => false } as unknown as Rng;
const RANKS = ['apprentice', 'journeyman', 'master'] as const;
const plan = (action: string): MonthPlan => ({ slots: [{ action }, { action }, { action }] });

describe('việc riêng của nghề (v0.7 S2)', () => {
  it('xưởng chỉ thợ thủ công từ bậc làm được; bẫy chỉ thợ săn; mua ruộng ai cũng được', () => {
    const c = adult().character;
    const craft = actionDef('action.craft')!, trap = actionDef('action.trap')!, land = actionDef('action.buy_land')!;
    expect(actionLock(craft, c, tick, 'town', market())).toBe('lock.career');
    expect(actionLock(craft, c, tick, 'town', market(), career('artisan', 'apprentice'))).toBe('lock.career');
    expect(actionLock(craft, c, tick, 'town', market(), career('hunter', 'master'))).toBe('lock.career');
    expect(actionLock(craft, c, tick, 'town', market(), career('artisan', 'journeyman'))).toBeNull();
    expect(actionLock(craft, c, tick, 'village', market(), career('artisan', 'master'))).toBe('lock.place');
    expect(actionLock(trap, c, tick, 'village', market())).toBe('lock.career');
    expect(actionLock(trap, c, tick, 'village', market(), career('hunter', 'apprentice'))).toBeNull();
    expect(land.career).toBeUndefined();
    // Việc riêng của nghề có trong bảng chọn (khóa nêu lý do)
    expect(ACTIONS.filter((d) => !d.hidden).map((d) => d.id)).toEqual(expect.arrayContaining(['action.craft', 'action.trap', 'action.buy_land']));
  });
});

describe('thợ thủ công (v0.7 S2)', () => {
  it('làm thuê: lương theo bậc 100/110/120%; người ngoài nghề như cũ', () => {
    const wages = RANKS.map((r) => { const c = adult().character, m = market(); settleAction('action.hire', c, tick, m, never, null, career('artisan', r)); return c.household.money - 5_000; });
    expect(wages).toEqual([HIRE_WAGE, HIRE_WAGE * 110 / 100, HIRE_WAGE * 120 / 100]);
    const plain = adult().character; settleAction('action.hire', plain, tick, market(), never);
    expect(plain.household.money - 5_000).toBe(HIRE_WAGE);
  });

  it('việc xưởng: bỏ vật liệu trước; có đơn được gấp ba lương, không đơn mất vật liệu; sổ cái giữ', () => {
    const hit = adult().character, m = market();
    settleAction('action.craft', hit, tick, m, always, null, career('artisan', 'journeyman'));
    expect(hit.household.money - 5_000).toBe(CRAFT_PAY - CRAFT_MATERIAL);
    expect(m.money).toBe(1_000_000 - CRAFT_PAY + CRAFT_MATERIAL);
    const miss = adult().character;
    settleAction('action.craft', miss, tick, market(), never, null, career('artisan', 'journeyman'));
    expect(miss.household.money - 5_000).toBe(-CRAFT_MATERIAL);
  });

  it('thợ có tiếng có học trò: công ×130%, nuôi học trò 2 thăng mỗi ô vào kho chợ', () => {
    const c = adult().character, m = market(), grain = m.grain;
    settleAction('action.craft', c, tick, m, always, null, career('artisan', 'master'));
    expect(c.household.money - 5_000).toBe(CRAFT_PAY * 130 / 100 - CRAFT_MATERIAL);
    expect(c.household.grain).toBe(500 - CRAFT_PUPIL_GRAIN);
    expect(m.grain).toBe(grain + CRAFT_PUPIL_GRAIN);
  });

  it('một năm ở trấn: thợ làm được nhận việc xưởng kiếm nhiều hơn làm thuê, nhưng năm nào cũng có ô trắng tay', () => {
    const run = (action: string) => {
      const s = adult((c) => { c.location = 1; c.home = 1; });
      s.career = career('artisan', 'journeyman');
      const l = Life.restore(s, [], region);
      const before = l.character.household.money;
      l.setPlan(plan(action));
      for (let k = 0; k < 12; k++) autoAdvance(l, 'month', lastChoice);
      return l.character.household.money - before;
    };
    expect(run('action.craft')).toBeGreaterThan(run('action.hire'));
  });
});

describe('thợ săn (v0.7 S2)', () => {
  it('săn: thịt, da theo bậc 100/115/130%; rủi ro theo bậc 100/160/220% (S9: thợ săn có bậc vào rừng sâu)', () => {
    // Da vào túi đồ (v0.7 S3b), không trả tiền ngay
    const got = RANKS.map((r) => { const c = adult().character; settleAction('action.hunt', c, tick, market(), never, null, career('hunter', r)); return [c.household.grain - 500, c.household.goods[0]! + c.household.money - 5_000]; });
    const f = (x: number, pct: number) => Math.floor((x * pct) / 100);
    expect(got).toEqual([[HUNT_MEAT, HUNT_HIDE], [f(HUNT_MEAT, 115), f(HUNT_HIDE, 115)], [f(HUNT_MEAT, 130), f(HUNT_HIDE, 130)]]);
    const hunt = actionDef('action.hunt')!;
    const ppm = RANKS.map((r) => {
      const c = adult().character;
      return slotEffects(hunt, null, c, tick, region, market(), { get: () => never }, () => {}, null, null, career('hunter', r)).ppm;
    });
    expect(ppm[1]).toBe(Math.floor(ppm[0]! * 160 / 100));
    expect(ppm[2]).toBe(Math.floor(ppm[0]! * 220 / 100));
  });

  it('bẫy: ít sức, ít rủi ro hơn săn; được thì thịt, da; không được thì trắng tay', () => {
    const trap = actionDef('action.trap')!, hunt = actionDef('action.hunt')!;
    expect(trap.stamina).toBeLessThan(hunt.stamina);
    expect(trap.riskPpm).toBeLessThan(hunt.riskPpm);
    const c = adult().character;
    settleAction('action.trap', c, tick, market(), always, null, career('hunter', 'apprentice'));
    expect([c.household.grain - 500, c.household.goods[0], c.household.money - 5_000]).toEqual([TRAP_MEAT, TRAP_HIDE, 0]);
    const empty = adult().character;
    settleAction('action.trap', empty, tick, market(), never, null, career('hunter', 'apprentice'));
    expect([empty.household.grain, empty.household.money]).toEqual([500, 5_000]);
  });
});

describe('nông dân và ruộng đất (v0.7 S2)', () => {
  const harvest = (rank: CareerRank | null) => {
    const c = adult().character;
    c.household = { ...c.household, tenure: 'tenant', landMu: 0, farmWeeks: 10, farmCounty: 0, grain: 0 };
    const eco = createEconomy(region, 0);
    for (const ce of eco.counties) ce.weatherPct = 100;
    return harvestPlayer(c, eco, region, rank ? career('farmer', rank) : null);
  };

  it('gặt theo bậc 100/110/120%; tô ruộng thuê 50/45/40%; người ngoài nghề như cũ', () => {
    const g = 10 * FARM_YIELD_PER_WEEK;
    expect(harvest(null)).toMatchObject({ gross: g, rent: g / 2 });
    expect(harvest('apprentice')).toMatchObject({ gross: g, rent: g / 2 });
    expect(harvest('journeyman')).toMatchObject({ gross: g * 110 / 100, rent: Math.floor(g * 110 / 100 * 45 / 100) });
    expect(harvest('master')).toMatchObject({ gross: g * 120 / 100, rent: g * 120 / 100 * 40 / 100 });
  });

  it('mua ruộng: chỉ người đã ra riêng, ở quận nhà, còn ruộng bán, đủ tiền', () => {
    const land = actionDef('action.buy_land')!;
    const m = createEconomy(region, 0).counties[0]!;
    const c = adult().character;
    expect(actionLock(land, c, tick, 'village', m)).toBeNull();
    expect(actionLock(land, { ...c, household: { ...c.household, independent: false } }, tick, 'village', m)).toBe('lock.dependent');
    expect(actionLock(land, { ...c, location: 1 }, tick, 'village', m)).toBe('lock.not_home');
    expect(actionLock(land, { ...c, household: { ...c.household, money: LAND_PRICE - 1 } }, tick, 'village', m)).toBe('lock.money');
    expect(actionLock(land, c, tick, 'village', { ...m, landSold: LAND_SALE_MU })).toBe('lock.no_land');
  });

  it('mua ruộng: tiền vào quỹ quận, thêm một mẫu, tá điền thành chủ ruộng, từ 20 mẫu thành địa chủ; năm đói giá 60%', () => {
    const c = adult().character, m = createEconomy(region, 0).counties[0]!;
    c.household = { ...c.household, tenure: 'tenant', landMu: 0, money: 30_000 };
    const fund = m.money;
    settleAction('action.buy_land', c, tick, m, never);
    expect(c.household).toMatchObject({ landMu: 1, tenure: 'owner', money: 30_000 - LAND_PRICE });
    expect(m).toMatchObject({ money: fund + LAND_PRICE, landSold: 1 });
    c.household.landMu = LANDLORD_MU - 1;
    settleAction('action.buy_land', c, tick, m, never);
    expect(c.household).toMatchObject({ landMu: LANDLORD_MU, tenure: 'landlord' });
    // Hết ruộng bán năm nay thì không mua được nữa, đầu năm sau lại có
    settleAction('action.buy_land', c, tick, m, never);
    settleAction('action.buy_land', c, tick, m, never);
    expect(m.landSold).toBe(LAND_SALE_MU);
    const eco = { counties: [m] } as unknown as Parameters<typeof worldYearStart>[0];
    worldYearStart(eco, Rng.fromSeed(1), 36 * 21);
    expect(m.landSold).toBe(0);
    expect(landPrice({ ...m, grain: 0 })).toBe(LAND_PRICE * 60 / 100);
  });

  it('mua ruộng trong kế hoạch: ghi nhật ký, sổ cái giữ, lưu/tải giữ ruộng', () => {
    const s = adult();
    s.character.household.money = 3_000;
    const l = Life.restore(s, [], region);
    const total = l.totalMoney(), mu = l.character.household.landMu;
    l.setPlan(plan('action.buy_land'));
    autoAdvance(l, 'week', lastChoice);
    expect(l.character.household.landMu).toBe(mu + 1);
    expect(l.log.some((e) => e.key === 'log.land.bought')).toBe(true);
    expect(l.totalMoney()).toBe(total);
    const snap = JSON.parse(JSON.stringify(l.snapshot()));
    expect(Life.restore(snap, [], region).character.household.landMu).toBe(mu + 1);
  });
});
