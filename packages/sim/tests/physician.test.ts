// v0.7 S5: thầy thuốc — hành nghề y nhận phí người bệnh, dùng thảo dược, dễ lây bệnh mùa dịch; người bệnh NPC trong quận
// trả phí cho người chơi hành nghề ở đó (ADR 0020 Q6).
import { birthplaceId, GOODS, regionId, type CareerRank, type MonthPlan } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { describe, expect, it } from 'vitest';
import { Life, Rng } from '../src/index';
import { autoAdvance, lastChoice, pastComingOfAge } from './auto';
import { actionDef, actionLock } from '../src/life/actions';
import {
  healFee, PRACTICE_EPIDEMIC_PCT, PRACTICE_FEE, PRACTICE_HERB, PRACTICE_NO_HERB_PCT, PRACTICE_PATIENT_PPM, PRACTICE_RANK_PCT, settleAction,
} from '../src/economy/income';
import { createEconomy, goodBuyPrice, type CountyEconomy } from '../src/economy/market';
import { PRACTICE_INFECT_EPIDEMIC_PPM, PRACTICE_INFECT_PPM, slotEffects } from '../src/life/player';
import { CAREER_DEFS, type CareerState } from '../src/life/career';
import type { CharacterState } from '../src/life/character';
import type { LifeSnapshot } from '../src/life/life';
import { npcMoney } from '../src/npc/state';
import { factionMoney } from '../src/factions/state';

/** Quận 0 làng, quận 1 trấn, kề nhau. */
const region: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [0, 1].map((worldIndex) => ({ worldIndex, area: 100, seat: { x: worldIndex, y: 0 }, name: `Quận ${worldIndex}` })),
  settlementKind: ['village', 'town'], adjacency: [[0, 1]], terrainPct: [100], fertilityPct: [100, 100], seatKm: [[0, 60], [60, 0]],
};
const bp = { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village' as const, cell: { x: 0, y: 0 }, county: 0 };
const HERB = GOODS.indexOf('herb');
const tick = 25 * 36 + 9;
const always = { chance: () => true } as unknown as Rng;
const never = { chance: () => false } as unknown as Rng;
const doc = (rank: CareerRank): CareerState => ({ id: 'physician', rank, since: 0, faction: null, mentor: null, years: 0, weeks: 0, idle: 0 });
const market = (money = 1_000_000): CountyEconomy => ({ ...createEconomy(region, 0).counties[1]!, money, epidemicFrom: -1, epidemicUntil: -1 });
const sick = (m: CountyEconomy) => Object.assign(m, { epidemicFrom: tick - 1, epidemicUntil: tick + 5 });

function adult(): LifeSnapshot {
  const s = Life.create({ worldSeed: 'physician', regionId: regionId('r0'), birthplaceId: bp.id }, bp, region).snapshot();
  s.character.birthTick = 0; s.tick = tick;
  s.character.health = s.character.healthMax = 1000; s.character.stamina = 900; s.character.conditions = [];
  for (const k of Object.keys(s.character.skillXp) as (keyof CharacterState['skillXp'])[]) s.character.skillXp[k] = 0;
  Object.assign(s.character.household, { independent: true, money: 5_000, grain: 500 });
  return pastComingOfAge(s);
}

describe('hành nghề y (v0.7 S5)', () => {
  it('chỉ thầy thuốc từ bậc làm được; ở làng, trấn, thành đều làm được; tính là làm nghề', () => {
    const c = adult().character, practice = actionDef('action.practice')!;
    expect(actionLock(practice, c, tick, 'town', market())).toBe('lock.career');
    expect(actionLock(practice, c, tick, 'town', market(), doc('apprentice'))).toBe('lock.career');
    expect(actionLock(practice, c, tick, 'village', market(), doc('journeyman'))).toBeNull();
    expect(actionLock(practice, c, tick, 'city', market(), doc('master'))).toBeNull();
    expect(practice.skill).toBe('medicine');
    expect(CAREER_DEFS.physician.works).toContain('action.practice');
  });

  it('có khách thì quỹ quận trả phí theo y thuật và bậc; mỗi ca dùng nửa phần thuốc trong túi; tiền vùng không đổi', () => {
    const fee = (rank: CareerRank) => {
      const c = adult().character, m = market();
      c.household.goods[HERB] = 20;
      const total = c.household.money + m.money;
      settleAction('action.practice', c, tick, m, always, null, doc(rank));
      expect(c.household.money + m.money).toBe(total);
      expect(c.household.goods[HERB]).toBe(20 - PRACTICE_HERB);
      return c.household.money - 5_000;
    };
    expect(fee('journeyman')).toBe(PRACTICE_FEE * PRACTICE_RANK_PCT[1] / 100);
    expect(fee('master')).toBe(PRACTICE_FEE * PRACTICE_RANK_PCT[2] / 100);
    const c = adult().character, m = market();
    c.skillXp.medicine = 10_000;
    settleAction('action.practice', c, tick, m, always, null, doc('journeyman'));
    expect(c.household.money - 5_000).toBeGreaterThan(PRACTICE_FEE);
  });

  it('không có khách thì trắng tay, không tốn thuốc', () => {
    const c = adult().character, m = market();
    c.household.goods[HERB] = 20;
    settleAction('action.practice', c, tick, m, never, null, doc('journeyman'));
    expect([c.household.money, c.household.goods[HERB]]).toEqual([5_000, 20]);
    expect(PRACTICE_PATIENT_PPM).toBeLessThan(1_000_000);
  });

  it('túi hết thuốc thì mua phần thiếu ở chợ; không mua được thì phí còn một nửa', () => {
    const c = adult().character, m = market();
    const stock = m.goods[HERB]!.stock, price = goodBuyPrice(m.goods[HERB]!);
    c.household.goods[HERB] = 2;
    settleAction('action.practice', c, tick, m, always, null, doc('journeyman'));
    const cost = Math.ceil(((PRACTICE_HERB - 2) * price) / 10);
    expect(c.household.goods[HERB]).toBe(0);
    expect(m.goods[HERB]!.stock).toBe(stock - (PRACTICE_HERB - 2));
    expect(c.household.money - 5_000).toBe(PRACTICE_FEE - cost);
    const poor = adult().character, empty = market();
    empty.goods[HERB]!.stock = 0;
    settleAction('action.practice', poor, tick, empty, always, null, doc('journeyman'));
    expect(poor.household.money - 5_000).toBe(PRACTICE_FEE * PRACTICE_NO_HERB_PCT / 100);
  });

  it('mùa dịch đông khách: phí gấp đôi', () => {
    const c = adult().character, m = sick(market());
    c.household.goods[HERB] = 5;
    settleAction('action.practice', c, tick, m, always, null, doc('journeyman'));
    expect(c.household.money - 5_000).toBe(PRACTICE_FEE * PRACTICE_EPIDEMIC_PCT / 100);
  });

  it('mùa dịch dễ lây hơn hẳn; đang bệnh thì không lây thêm', () => {
    expect(PRACTICE_INFECT_EPIDEMIC_PPM).toBeGreaterThan(PRACTICE_INFECT_PPM * 10);
    const practice = actionDef('action.practice')!;
    // Rút đúng ngưỡng: lây khi xác suất từ mức dịch trở lên
    const threshold = Object.assign(Rng.fromSeed(1), { chance: (p: number) => p >= PRACTICE_INFECT_EPIDEMIC_PPM });
    const infected = (m: CountyEconomy) => {
      const c = adult().character;
      slotEffects(practice, null, c, tick, region, m, { get: (name: string) => (name === 'illness' ? threshold : never) }, () => {}, null, null, doc('journeyman'));
      return c.conditions.filter((x) => x.kind === 'illness').length;
    };
    expect(infected(market())).toBe(0);
    expect(infected(sick(market()))).toBe(1);
    const ill = adult().character;
    ill.conditions = [{ id: 'illness.cold', kind: 'illness', severity: 'mild', weeksLeft: 2 }];
    slotEffects(practice, null, ill, tick, region, sick(market()), { get: () => Object.assign(Rng.fromSeed(2), { chance: () => true }) }, () => {}, null, null, doc('journeyman'));
    expect(ill.conditions).toHaveLength(1);
  });

  it('người bệnh NPC trong quận trả phí chữa bệnh cho người chơi hành nghề ở đó (Q6), không cho thầy thuốc NPC', () => {
    const patient = adult().character, m = market();
    patient.location = 1;
    patient.conditions = [{ id: 'illness.cold', kind: 'illness', severity: 'serious', weeksLeft: 3 }];
    const purse = { money: 0 };
    slotEffects(actionDef('action.heal')!, null, patient, tick, region, m, { get: () => never }, () => {}, null, null, null, { county: 1, purse });
    expect(purse.money).toBe(healFee(patient));
    // Người chơi ở quận khác: phí theo luật cũ (không có thầy thuốc NPC thì vào quỹ quận)
    const other = { money: 0 }, before = m.money;
    slotEffects(actionDef('action.heal')!, null, patient, tick, region, m, { get: () => never }, () => {}, null, null, null, { county: 0, purse: other });
    expect(other.money).toBe(0);
    expect(m.money).toBeGreaterThan(before);
  });
});

describe('đời thầy thuốc (v0.7 S5)', () => {
  it('một năm hành nghề ở trấn: có thu nhập, tính năm làm nghề; sổ cái tiền giữ mọi tick', () => {
    const s = adult();
    s.character.location = 1;
    s.career = doc('journeyman');
    s.character.skillXp.medicine = 1_500;
    const life = Life.restore(s, [], region);
    const money = () => { const x = life.snapshot(); return x.character.household.money + x.economy.counties.reduce((a, ce) => a + ce.money, 0) + npcMoney(x.npcs) + factionMoney(x.factions); };
    const plan: MonthPlan = { slots: [{ action: 'action.practice' }, { action: 'action.practice' }, { action: 'action.rest' }] };
    expect(life.setPlan(plan)).toBe(true);
    const start = money(), purse = life.character.household.money;
    for (let i = 0; i < 36 && life.alive; i++) {
      autoAdvance(life, 'week', lastChoice);
      expect(money()).toBe(start);
    }
    expect(life.character.household.money).toBeGreaterThan(purse);
    expect(life.snapshot().career!.weeks).toBeGreaterThan(0);
  });
});
