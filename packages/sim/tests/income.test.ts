import { describe, expect, it } from 'vitest';
import { birthplaceId, regionId, type MonthPlan } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { Life, Rng } from '../src/index';
import { autoAdvance, lastChoice, pastComingOfAge } from './auto';
import { ACTIONS, actionLock, actionOptions } from '../src/life/actions';
import {
  FORAGE_BY_SEASON, HEAD_TAX, HEAL_FEE, HIRE_WAGE, HUNT_HIDE, HUNT_MEAT, LODGING_PER_SLOT, ROUGH_SLEEP_RISK_PCT, settleAction, TRADE_MIN_CAPITAL,
  tradeGrain, TUITION,
} from '../src/economy/income';
import { buyPrice, createEconomy, sellPrice, type CountyEconomy } from '../src/economy/market';
import type { CharacterState } from '../src/life/character';

/** Quận 0 làng, quận 1 trấn, kề nhau. */
const region: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [0, 1].map((worldIndex) => ({ worldIndex, area: 100, seat: { x: worldIndex, y: 0 }, name: `Quận ${worldIndex}` })),
  settlementKind: ['village', 'town'], adjacency: [[0, 1]], terrainPct: [100], fertilityPct: [100, 100], seatKm: [[0, 60], [60, 0]],
};

function adult(patch: (c: CharacterState) => void = () => {}, seed = 'income') {
  const l = Life.create({ worldSeed: seed, regionId: regionId('r0'), birthplaceId: birthplaceId('r0/c0') }, { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village', cell: { x: 0, y: 0 }, county: 0 }, region);
  const s = l.snapshot();
  s.character.birthTick = 0; s.tick = 20 * 36 + 2;
  s.character.health = s.character.healthMax = 1000; s.character.stamina = 900; s.character.conditions = [];
  for (const k of Object.keys(s.character.skillXp) as (keyof CharacterState['skillXp'])[]) s.character.skillXp[k] = 0;
  patch(s.character);
  return Life.restore(pastComingOfAge(s), [], region);
}
const state = (patch: (c: CharacterState) => void = () => {}) => adult(patch).snapshot().character;
const market = (money = 1_000_000): CountyEconomy => ({ ...createEconomy(region, 0).counties[1]!, money });
const tick = 20 * 36 + 3; // tháng Hai, mùa xuân
const plan = (a: string): MonthPlan => ({ slots: [{ action: a }, { action: a }, { action: a }] });

describe('tiền trong hành động (ADR 0012)', () => {
  it('làm thuê: lương từ quỹ quận, tăng theo kỹ năng thủ công; quận hết tiền thì hết việc', () => {
    const c = state(), m = market();
    settleAction('action.hire', c, tick, m, Rng.fromSeed(1));
    expect(c.household.money).toBe(HIRE_WAGE);
    expect(m.money).toBe(1_000_000 - HIRE_WAGE);
    const skilled = state((x) => { x.skillXp.crafting = 10_000; });
    settleAction('action.hire', skilled, tick, market(), Rng.fromSeed(1));
    expect(skilled.household.money).toBe(HIRE_WAGE * 160 / 100);
    expect(actionLock(ACTIONS.find((a) => a.id === 'action.hire')!, c, tick, 'town', market(10))).toBe('lock.no_work');
  });

  it('học chữ tốn học phí; thầy thuốc lấy phí theo bệnh nặng nhất; thiếu tiền thì khóa', () => {
    const c = state((x) => { x.household.money = 1_000; }), m = market();
    settleAction('action.study', c, tick, m, Rng.fromSeed(1));
    expect(c.household.money).toBe(1_000 - TUITION);
    c.conditions = [{ id: 'illness.cold', kind: 'illness', severity: 'mild', weeksLeft: 2 }, { id: 'illness.fever', kind: 'illness', severity: 'serious', weeksLeft: 2 }];
    settleAction('action.heal', c, tick, m, Rng.fromSeed(1));
    expect(c.household.money).toBe(1_000 - TUITION - HEAL_FEE.serious);
    const broke = state((x) => { x.household.money = TUITION - 1; });
    const lock = (id: string) => actionLock(ACTIONS.find((a) => a.id === id)!, broke, tick, 'town', market());
    expect(lock('action.study')).toBe('lock.money');
    expect(lock('action.heal')).toBe('lock.money');
    expect(lock('action.trade')).toBe('lock.money');
    expect(lock('action.rest')).toBeNull();
  });

  it('đi đường trả tiền trọ; hết tiền vẫn đi được nhưng ngủ bụi, rủi ro cao hơn', () => {
    const rich = state((x) => { x.household.money = 100; });
    expect(settleAction('action.travel', rich, tick, market(), Rng.fromSeed(1))).toBe(100);
    expect(rich.household.money).toBe(100 - LODGING_PER_SLOT);
    const poor = state();
    expect(settleAction('action.travel', poor, tick, market(), Rng.fromSeed(1))).toBe(ROUGH_SLEEP_RISK_PCT);
    expect(actionLock(ACTIONS.find((a) => a.id === 'action.travel')!, poor, tick, 'village', market())).toBeNull();
  });

  it('hái lượm cho cái ăn theo mùa (đông ít); săn cho thịt và da bán được', () => {
    const c = state();
    settleAction('action.forage', c, tick, market(), Rng.fromSeed(1));
    expect(c.household.grain).toBe(FORAGE_BY_SEASON.spring);
    settleAction('action.forage', c, 20 * 36 + 33, market(), Rng.fromSeed(1));
    expect(c.household.grain).toBe(FORAGE_BY_SEASON.spring + FORAGE_BY_SEASON.winter);
    const h = state(), m = market();
    settleAction('action.hunt', h, tick, m, Rng.fromSeed(1));
    expect([h.household.grain, h.household.money, m.money]).toEqual([HUNT_MEAT, HUNT_HIDE, 1_000_000 - HUNT_HIDE]);
  });

  it('buôn bán nhỏ: có lãi có lỗ; kỳ vọng dương, người thạo lãi nhiều và ít lỗ hơn; tiền đi về quỹ quận, không mất', () => {
    /** 2.000 tuần, mỗi tuần vốn 2.000 văn: tổng lãi và số tuần lỗ. */
    const run = (xp: number) => {
      const c = state((x) => { x.skillXp.trade = xp; }), m = market();
      const rng = Rng.fromSeed(5);
      let profit = 0, losses = 0;
      for (let i = 0; i < 2000; i++) {
        c.household.money = 2_000;
        const total = c.household.money + m.money;
        settleAction('action.trade', c, tick, m, rng);
        expect(c.household.money + m.money).toBe(total);
        profit += c.household.money - 2_000;
        if (c.household.money < 2_000) losses++;
      }
      return { profit, losses };
    };
    const novice = run(0), master = run(10_000);
    expect(novice.profit).toBeGreaterThan(0);
    expect(novice.losses).toBeGreaterThan(0);
    expect(master.profit).toBeGreaterThan(novice.profit * 5);
    expect(master.losses).toBeLessThan(novice.losses);
    expect(actionLock(ACTIONS.find((a) => a.id === 'action.trade')!, state((x) => { x.household.money = TRADE_MIN_CAPITAL; }), tick, 'town', market())).toBeNull();
  });

  it('kế hoạch hiện giá tiền và cái được', () => {
    const l = adult();
    const opts = actionOptions(l.character as CharacterState, l.tick, region, l.snapshot().economy);
    const by = (id: string) => opts.find((o) => o.id === id)!;
    expect(by('action.study').cost.money).toBe('money.low');
    expect(by('action.heal').cost.money).toBe('money.medium');
    expect(by('action.trade').cost.money).toBe('money.capital');
    expect(by('action.farm').cost.money).toBe('money.none');
    expect(by('action.hire').gains).toContain('gain.money');
    expect(by('action.forage').gains).toContain('gain.food');
  });

  it('thiếu tiền học thì ô đó nghỉ, không báo kế hoạch hỏng (khóa tạm)', () => {
    const l = adult((c) => { c.location = 1; c.household.money = 0; });
    l.setPlan(plan('action.study'));
    for (let i = 0; i < 6; i++) autoAdvance(l, 'week', lastChoice);
    expect(l.log.some((e) => e.key === 'log.plan.invalid')).toBe(false);
    expect(l.character.skillXp.literacy).toBe(0);
  });

  it('làm thuê ở trấn cả năm: tiền tăng, tổng tiền vùng không đổi', () => {
    const l = adult((c) => { c.location = 1; });
    l.setPlan({ slots: [{ action: 'action.hire' }, { action: 'action.hire' }, { action: 'action.rest' }] });
    const total = l.totalMoney();
    for (let i = 0; i < 36; i++) { autoAdvance(l, 'week', lastChoice); expect(l.totalMoney()).toBe(total); }
    expect(l.character.household.money).toBeGreaterThan(20 * HIRE_WAGE);
  });
});

describe('thuế đinh', () => {
  const toYearStart = (l: Life) => { while (l.tick % 36 !== 1) autoAdvance(l, 'week', lastChoice); };

  it('đã ra riêng từ 16 tuổi: đầu năm nộp cho quận nhà', () => {
    const l = adult((c) => { c.household.independent = true; c.household.money = 500; c.household.grain = 10_000; });
    const total = l.totalMoney();
    toYearStart(l);
    // Mức thuế theo quan đương nhiệm (v0.6 S6): 100–300 văn quanh lệ 200
    const paid = l.log.find((e) => e.key === 'log.tax.paid')!.params.paid as number;
    expect(paid).toBeGreaterThanOrEqual(HEAD_TAX / 2);
    expect(paid).toBeLessThanOrEqual(HEAD_TAX * 3 / 2);
    expect(l.character.household.money).toBe(500 - paid);
    expect(l.totalMoney()).toBe(total);
  });

  it('chưa ra riêng thì nhà lo, không nộp', () => {
    const l = adult((c) => { c.household.money = 500; });
    toYearStart(l);
    expect(l.character.household.money).toBe(500);
  });

  it('thiếu tiền: nộp được bao nhiêu hay bấy nhiêu, ghi nợ, ngắt tua', () => {
    const l = adult((c) => { c.household.independent = true; c.household.money = 50; c.household.grain = 10_000; });
    // Tin thiếu thuế là tin lớn (ngắt tua); cùng tuần mà có sự kiện thì tua dừng vì sự kiện, tin vẫn ở đó
    while (l.tick % 36 !== 1) autoAdvance(l, 'week', lastChoice);
    expect(l.log.some((e) => e.key === 'log.tax.short' && e.importance === 'major')).toBe(true);
    const owed = l.log.find((e) => e.key === 'log.tax.short')!.params.owed as number;
    expect(owed).toBeGreaterThanOrEqual(HEAD_TAX / 2 - 50);
    expect(l.character.household).toMatchObject({ money: 0, taxDebt: owed });
  });
});

describe('lệnh TRADE (mua bán lương thực, không tốn ô)', () => {
  it('mua và bán đúng số lượng theo giá chợ; tổng tiền không đổi', () => {
    const m = market(), h = state((x) => { x.household.money = 1_000; }).household;
    const total = h.money + m.money;
    expect(tradeGrain(h, m, 50)).toBeNull();
    expect(h.grain).toBe(50);
    expect(h.money).toBe(1_000 - Math.ceil((50 * buyPrice(m)) / 10));
    const money = h.money;
    expect(tradeGrain(h, m, -20)).toBeNull();
    expect([h.grain, h.money]).toEqual([30, money + Math.floor((20 * sellPrice(m)) / 10)]);
    expect(h.money + m.money).toBe(total);
  });

  it('vượt túi, kho mình, kho hoặc quỹ chợ thì từ chối cả lệnh, không đổi gì', () => {
    const h = state((x) => { x.household.money = 10; x.household.grain = 5; }).household;
    const m = market();
    const snap = JSON.stringify([h, m]);
    expect(tradeGrain(h, m, 100)).toBe('không đủ tiền');
    expect(tradeGrain(h, m, -6)).toBe('không đủ lương để bán');
    expect(tradeGrain(h, { ...m, grain: 1 }, 2)).toBe('chợ không đủ lương');
    expect(tradeGrain(h, { ...m, money: 0 }, -5)).toBe('chợ không đủ tiền mua');
    expect(JSON.stringify([h, m])).toBe(snap);
  });

  it('trẻ chưa 12 tuổi không mua bán', () => {
    const l = adult((c) => { c.birthTick = 20 * 36 + 2 - 5 * 36; c.household.money = 100; });
    expect(l.trade(5)).toBe('chưa đủ tuổi tự lo liệu');
  });
});
