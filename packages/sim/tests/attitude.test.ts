// v0.7 S7: thái độ của thế lực với người chơi (ADR 0020 Q9).
import { birthplaceId, regionId, type CareerRank } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { describe, expect, it } from 'vitest';
import { Life, Rng } from '../src/index';
import { pastComingOfAge } from './auto';
import {
  attitudeBand, attitudeOf, attitudeQuarter, caravanCutPct, EVENT_TONE_PCT, HOSTILE_AT, JOIN_ATTITUDE, MEMBER_CAP, OUTLAW_JOIN_BAND, OUTLAW_JOIN_GOV, shiftAttitude,
} from '../src/factions/attitude';
import { enlist, enlistLock, type EnlistWorld } from '../src/life/soldier';
import { governmentRule, OFFICIAL_RANK_PCT, OFFICIAL_WAGE } from '../src/factions/government';
import { factionViews, type FactionState } from '../src/factions/state';
import { CARAVAN_CUT_PCT } from '../src/life/merchant';
import { joinBand, leaveBand } from '../src/life/wayward';
import { choose, makeContext, newEventsState, rollEvent, type EventDef } from '../src/events/engine';
import { banditLure } from '../src/events/defs/factions';
import type { CareerState } from '../src/life/career';
import type { LifeSnapshot } from '../src/life/life';
import { vLifeSnapshot } from '../src/life/validate';

/** Quận 0 làng, quận 1 trấn (trị sở quan phủ), kề nhau. */
const region: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [0, 1].map((worldIndex) => ({ worldIndex, area: 100, seat: { x: worldIndex, y: 0 }, name: `Quận ${worldIndex}` })),
  settlementKind: ['village', 'town'], adjacency: [[0, 1]], terrainPct: [100], fertilityPct: [100, 100], seatKm: [[0, 60], [60, 0]],
};
const bp = { id: birthplaceId('r0/c1'), name: 'Trấn', nameHan: '鎮', kind: 'town' as const, cell: { x: 1, y: 0 }, county: 1 };
const tick = 25 * 36 + 10;
const career = (id: CareerState['id'], rank: CareerRank, faction: string | null): CareerState => ({ id, rank, since: 0, faction, mentor: null, years: 0, weeks: 0, idle: 0 });

function adult(): LifeSnapshot {
  const s = Life.create({ worldSeed: 'attitude', regionId: regionId('r0'), birthplaceId: bp.id }, bp, region).snapshot();
  s.character.birthTick = 0; s.tick = tick;
  s.character.health = s.character.healthMax = 1000; s.character.stamina = 900; s.character.conditions = [];
  s.character.location = 1;
  Object.assign(s.character.household, { independent: true, money: 5_000, grain: 500, landMu: 0 });
  Object.assign(gov(s), { greed: 0, termEnds: 1_000_000, money: 100_000 });
  return pastComingOfAge(s);
}
const gov = (s: LifeSnapshot): FactionState => s.factions.list.find((f) => f.kind === 'government')!;
function band(s: LifeSnapshot): FactionState {
  const members = s.npcs.people.filter((x) => !x.death && x.character.household.independent).slice(0, 3).map((x) => x.id);
  for (const id of members) s.npcs.people.find((x) => x.id === id)!.occupation = 'bandit';
  const b: FactionState = { id: 'f9', kind: 'bandits', name: { key: 'faction.bandits.name', params: { place: 'Quận 0' } }, seat: 0, counties: [], holds: [], roads: [0], members, leader: null, power: 1_000, losses: 0, greed: 0, termEnds: 0, relations: [], money: 0, grain: 0, founded: 0, ended: null };
  s.factions.list.push(b);
  return b;
}
const office = (s: LifeSnapshot): EnlistWorld => ({ career: s.career, careers: s.careers, factions: s.factions, npcs: s.npcs, bonds: s.bonds, logic: region, tick: s.tick });

describe('trục thái độ (v0.7 S7, Q9)', () => {
  it('cộng dồn trong −100..100; về 0 thì bỏ trường; dải ghét, dè chừng, thường, thân', () => {
    const f = gov(adult());
    expect(attitudeOf(f)).toBe(0);
    shiftAttitude(f, 150);
    expect(f.playerAttitude).toBe(100);
    shiftAttitude(f, -100);
    expect('playerAttitude' in f).toBe(false);
    expect([-100, HOSTILE_AT, -39, -10, -9, 29, 30, 100].map(attitudeBand)).toEqual(['hostile', 'hostile', 'wary', 'wary', 'neutral', 'neutral', 'friendly', 'friendly']);
  });

  it('gửi theo dải trong FactionView; snapshot giữ được, ngoài khoảng bị từ chối', () => {
    const s = adult();
    shiftAttitude(gov(s), 45);
    expect(factionViews(s.factions, region).find((v) => v.kind === 'government')!.attitude).toBe('friendly');
    expect(vLifeSnapshot.check(JSON.parse(JSON.stringify(s)), '$')).toBeNull();
    gov(s).playerAttitude = 101;
    expect(vLifeSnapshot.check(JSON.parse(JSON.stringify(s)), '$')).toContain('playerAttitude');
  });
});

describe('thái độ đổi theo nghề (S7)', () => {
  it('quan phủ ghét thì không nhận làm sai dịch; vào nha môn thì quan phủ thân hơn', () => {
    const s = adult();
    s.character.skillXp.martial = 600;
    shiftAttitude(gov(s), HOSTILE_AT);
    expect(enlistLock(s.character, office(s))).toBe('lock.hostile');
    shiftAttitude(gov(s), -HOSTILE_AT);
    const w = office(s);
    expect(enlistLock(s.character, w)).toBeNull();
    enlist(s.character, w, () => {});
    expect(w.career!.id).toBe('soldier');
    expect(attitudeOf(gov(s))).toBe(JOIN_ATTITUDE);
  });

  it('lương sai dịch theo thái độ quan phủ (±10%)', () => {
    const wage = (attitude: number) => {
      const s = adult();
      s.career = career('soldier', 'apprentice', gov(s).id);
      shiftAttitude(gov(s), attitude);
      const before = s.character.household.money;
      governmentRule(gov(s), s.factions, s.economy, s.npcs, region, 36 * 26, { int: (_lo: number, hi: number) => hi, chance: () => false } as unknown as Rng, { character: s.character, career: s.career, log: () => {} });
      return s.character.household.money - before;
    };
    // Học việc: lương lệ × bậc (S9) × thái độ
    const base = Math.floor((OFFICIAL_WAGE * OFFICIAL_RANK_PCT[0]) / 100);
    expect(wage(0)).toBe(base);
    expect(wage(100)).toBe(Math.floor((base * 110) / 100));
    expect(wage(-35)).toBe(Math.floor((base * 93) / 100));
  });

  it('phần nộp hội theo đoàn: hội thân bớt, hội dè chừng thêm', () => {
    const g = gov(adult());
    expect(caravanCutPct(CARAVAN_CUT_PCT, g)).toBe(CARAVAN_CUT_PCT);
    shiftAttitude(g, 40);
    expect(caravanCutPct(CARAVAN_CUT_PCT, g)).toBe(CARAVAN_CUT_PCT - 5);
    shiftAttitude(g, -60);
    expect(caravanCutPct(CARAVAN_CUT_PCT, g)).toBe(CARAVAN_CUT_PCT + 5);
  });

  it('theo cướp: băng thân, quan phủ ghét; chuộc tội thì quan phủ bớt ghét, băng phật lòng', () => {
    const s = adult(), b = band(s);
    const w = { career: s.career, careers: s.careers, bonds: s.bonds, npcs: s.npcs, tick: s.tick, factions: s.factions };
    joinBand(s.character, b, w);
    s.career = w.career;
    expect([attitudeOf(b), attitudeOf(gov(s))]).toEqual([OUTLAW_JOIN_BAND, OUTLAW_JOIN_GOV]);
    leaveBand(s.character, s.factions, s);
    expect([attitudeOf(b), attitudeOf(gov(s))]).toEqual([OUTLAW_JOIN_BAND - 20, OUTLAW_JOIN_GOV + 20]);
  });

  it('mỗi quý ở trong thế lực thân thêm (tới 60); theo cướp thì quan phủ ghét dần', () => {
    const s = adult(), b = band(s);
    attitudeQuarter(s.factions, career('soldier', 'apprentice', gov(s).id));
    expect(attitudeOf(gov(s))).toBe(2);
    gov(s).playerAttitude = MEMBER_CAP - 1;
    attitudeQuarter(s.factions, career('soldier', 'apprentice', gov(s).id));
    attitudeQuarter(s.factions, career('soldier', 'apprentice', gov(s).id));
    expect(attitudeOf(gov(s))).toBe(MEMBER_CAP);
    attitudeQuarter(s.factions, career('outlaw', 'apprentice', b.id));
    expect([attitudeOf(b), attitudeOf(gov(s))]).toEqual([2, MEMBER_CAP - 2]);
    attitudeQuarter(s.factions, career('farmer', 'master', null));
    expect(attitudeOf(b)).toBe(2);
  });
});

describe('thái độ đổi theo sự kiện, và đổi nhịp sự kiện (S7)', () => {
  it('chọn trong sự kiện thế lực đổi thái độ của đúng thế lực ấy (báo quan: quan phủ thân, băng ghét)', () => {
    const s = adult();
    s.character.location = 0;
    const b = band(s);
    const ev = newEventsState();
    ev.pending = { instance: 0, eventId: banditLure.id, tick: s.tick, variant: null, params: {}, figure: null, npcId: null };
    s.character.personality = 'cunning';
    const ctx = makeContext(s.character, ev, s, s.economy, region, s.tick, s.npcs, s.bonds, s.reputation, s.factions);
    expect(choose(ev, [banditLure], ctx, 0, 'tip_off', { chance: () => false, int: (lo: number) => lo } as unknown as Rng, () => {})).toBeNull();
    expect([attitudeOf(b), attitudeOf(gov(s))]).toEqual([-30, 10]);
  });

  it('chuyện gây khó đến nhiều hơn khi thế lực ghét; chuyện có lợi ít đi', () => {
    const s = adult();
    const def = (tone: 'favor' | 'grudge'): EventDef => ({
      id: 'event.test_gov', category: 'economy', weight: () => 300_000, cooldownTicks: 0,
      factions: (ctx) => ({ government: ctx.factions.list.find((f) => f.kind === 'government') ?? null }), tone: { government: tone },
      choices: [{ id: 'a', costs: ['time'], apply: () => ({ result: 'a' }) }, { id: 'b', costs: ['time'], apply: () => ({ result: 'b' }) }],
    });
    // Rút 400.000: chỉ trúng khi trọng số tăng quá 400.000
    const fired = (tone: 'favor' | 'grudge') => {
      const ev = newEventsState();
      return rollEvent(ev, [def(tone)], makeContext(s.character, ev, s, s.economy, region, s.tick, s.npcs, s.bonds, s.reputation, s.factions), { int: () => 400_000 } as unknown as Rng) !== null;
    };
    expect([fired('grudge'), fired('favor')]).toEqual([false, false]);
    shiftAttitude(gov(s), -50);
    expect(EVENT_TONE_PCT.grudge.hostile).toBe(200);
    expect([fired('grudge'), fired('favor')]).toEqual([true, false]);
    shiftAttitude(gov(s), 100);
    expect([fired('grudge'), fired('favor')]).toEqual([false, true]);
  });
});
