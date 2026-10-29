// v0.7 S6: tán nhân lưu lạc, ẩn dật, theo cướp (ADR 0020 Q7, Q8).
import { birthplaceId, regionId, seasonOf, type CareerId, type CareerRank } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { describe, expect, it } from 'vitest';
import { Life, Rng } from '../src/index';
import { autoAdvance, lastChoice, pastComingOfAge } from './auto';
import { actionDef } from '../src/life/actions';
import { FORAGE_BY_SEASON, RECLUSE_FORAGE_PCT, settleAction } from '../src/economy/income';
import { slotEffects } from '../src/life/player';
import { previewTravel } from '../src/life/travel';
import { CAREER_DEFS, type CareerState } from '../src/life/career';
import { ATONE_FEE, bandOf, DESERT_HOSTILITY, DRIFTER_ROAD_RISK_PCT, joinBand, leaveBand, mountainCounty, OUTLAW_KIN_COLD, ownEnter, ownLock, taxExempt, type OwnWorld } from '../src/life/wayward';
import { banditsQuarter, BANDIT_MIN_MEMBERS } from '../src/factions/bandits';
import { governmentRule, OUTLAW_CAUGHT_PPM, OUTLAW_FINE_PCT } from '../src/factions/government';
import { CAREER_EVENT_PCT, makeContext, newEventsState, rollEvent, type EventDef } from '../src/events/engine';
import { banditLure } from '../src/events/defs/factions';
import type { FactionState } from '../src/factions/state';
import type { LifeSnapshot } from '../src/life/life';
import { ensureBond } from '../src/social/bonds';
import { kinRole } from '../src/npc/family';
import { vLifeSnapshot } from '../src/life/validate';

/** Quận 0 làng, quận 1 trấn (trị sở quan phủ), quận 2 làng núi; 1–2 là đường núi (địa hình 200%). */
const region: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [0, 1, 2].map((worldIndex) => ({ worldIndex, area: 100, seat: { x: worldIndex, y: 0 }, name: `Quận ${worldIndex}` })),
  settlementKind: ['village', 'town', 'village'], adjacency: [[0, 1], [1, 2]], terrainPct: [100, 200], fertilityPct: [100, 100, 100],
  seatKm: [[0, 60, 120], [60, 0, 60], [120, 60, 0]],
};
const bp = { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village' as const, cell: { x: 0, y: 0 }, county: 0 };
const career = (id: CareerId, rank: CareerRank = 'apprentice', faction: string | null = null): CareerState => ({ id, rank, since: 0, faction, mentor: null, years: 0, weeks: 0, idle: 0 });
const tick = 25 * 36 + 9;
const FORAGE = FORAGE_BY_SEASON[seasonOf(tick)];
const never = { chance: () => false, int: (lo: number) => lo } as unknown as Rng;
const noLog = () => {};

function adult(): LifeSnapshot {
  const s = Life.create({ worldSeed: 'wayward', regionId: regionId('r0'), birthplaceId: bp.id }, bp, region).snapshot();
  s.character.birthTick = 0; s.tick = tick;
  s.character.health = s.character.healthMax = 1000; s.character.stamina = 900; s.character.conditions = [];
  s.character.skillXp.hunting = 0;
  Object.assign(s.character.household, { independent: true, money: 5_000, grain: 500, landMu: 0, tenure: 'tenant' });
  return pastComingOfAge(s);
}
const own = (s: LifeSnapshot): OwnWorld => ({ career: s.career, careers: s.careers, npcs: s.npcs, bonds: s.bonds, logic: region, tick: s.tick });
const gov = (s: LifeSnapshot) => s.factions.list.find((f) => f.kind === 'government')!;
function band(s: LifeSnapshot, n = BANDIT_MIN_MEMBERS, seat = 2): FactionState {
  const members = s.npcs.people.filter((x) => !x.death && x.character.household.independent).slice(0, n).map((x) => x.id);
  for (const id of members) s.npcs.people.find((x) => x.id === id)!.occupation = 'bandit';
  const b: FactionState = { id: 'f9', kind: 'bandits', name: { key: 'faction.bandits.name', params: { place: 'Quận 2' } }, seat, counties: [], holds: [], roads: [1], members, leader: null, power: 1_000, losses: 0, greed: 0, termEnds: 0, relations: [], money: 0, grain: 0, founded: 0, ended: null };
  s.factions.list.push(b);
  return b;
}
const money = (s: LifeSnapshot) => s.character.household.money + s.economy.counties.reduce((x, ce) => x + ce.money, 0) + s.factions.list.reduce((x, f) => x + f.money, 0)
  + s.npcs.people.reduce((x, n) => x + n.character.household.money, 0);

describe('lưu lạc (v0.7 S6, Q7)', () => {
  it('bỏ quê: người đã ra riêng, không ruộng; vào nghề lưu lạc; đã lưu lạc thì khóa', () => {
    const s = adult();
    s.character.household.landMu = 3;
    expect(ownLock('action.drift', s.character, own(s))).toBe('lock.has_land');
    s.character.household.landMu = 0;
    s.character.household.independent = false;
    expect(ownLock('action.drift', s.character, own(s))).toBe('lock.dependent');
    s.character.household.independent = true;
    s.career = career('hunter', 'journeyman');
    const w = own(s);
    ownEnter('action.drift', s.character, w, noLog);
    expect(w.career).toMatchObject({ id: 'drifter', rank: 'apprentice' });
    expect(w.careers.at(-1)).toMatchObject({ id: 'hunter', rank: 'journeyman' });
    expect(ownLock('action.drift', s.character, w)).toBe('lock.member');
    expect(taxExempt(w)).toBe(true);
  });

  it('đi đường thì kiếm ăn dọc đường; từng trải thì đi đường ít nạn hơn', () => {
    const s = adult(), c = s.character, ce = s.economy.counties[0]!;
    settleAction('action.travel', c, tick, ce, never, null, career('drifter'));
    expect(c.household.grain - 500).toBe(FORAGE);
    const other = adult().character;
    settleAction('action.travel', other, tick, ce, never, null, career('farmer'));
    expect(other.household.grain).toBe(500);
    const route = previewTravel(region, 0, 1)!, travel = actionDef('action.travel')!;
    const ppm = (k: CareerState | null) => slotEffects(travel, route, adult().character, tick, region, ce, { get: () => never }, noLog, null, null, k).ppm;
    expect(ppm(career('drifter', 'master'))).toBe(Math.floor((ppm(null) * DRIFTER_ROAD_RISK_PCT[2]) / 100));
    expect(CAREER_DEFS.drifter.works).toContain('action.travel');
  });

  it('gặp chuyện đường xá, cơ duyên gấp đôi', () => {
    expect(CAREER_EVENT_PCT.drifter).toMatchObject({ road: 200, opportunity: 200 });
    const s = adult();
    const road: EventDef = { id: 'event.test_road', category: 'road', weight: () => 300_000, cooldownTicks: 0, choices: [{ id: 'a', costs: ['time'], apply: () => ({ result: 'a' }) }, { id: 'b', costs: ['time'], apply: () => ({ result: 'b' }) }] };
    // Rút đúng 400.000: chỉ trúng khi trọng số được nhân đôi
    const roll = (k: CareerState | null) => {
      const ev = newEventsState();
      const ctx = makeContext(s.character, ev, { plan: null, active: null, planWarned: false, career: k }, s.economy, region, tick);
      return rollEvent(ev, [road], ctx, { int: () => 400_000 } as unknown as Rng);
    };
    expect(roll(null)).toBeNull();
    expect(roll(career('drifter'))).not.toBeNull();
  });

  it('một năm lưu lạc: không nộp thuế đinh', () => {
    const run = (k: CareerState | null) => {
      const s = adult();
      s.tick = 26 * 36;
      s.career = k;
      const life = Life.restore(s, [], region);
      autoAdvance(life, 'week', lastChoice);
      return life.log.map((e) => e.key);
    };
    expect(run(career('farmer'))).toContain('log.tax.paid');
    expect(run(career('drifter'))).not.toContain('log.tax.paid');
    expect(run(career('recluse'))).not.toContain('log.tax.paid');
  });
});

describe('ẩn dật (v0.7 S6, Q7)', () => {
  it('dựng lều ở quận có núi rừng: quận ấy thành quê, vào nghề ẩn dật; dời lều giữ nghề', () => {
    expect(mountainCounty(region, 0)).toBe(false);
    expect(mountainCounty(region, 2)).toBe(true);
    const s = adult();
    expect(ownLock('action.build_hut', s.character, own(s))).toBe('lock.no_mountain');
    s.character.location = 2;
    const w = own(s);
    expect(ownLock('action.build_hut', s.character, w)).toBeNull();
    ownEnter('action.build_hut', s.character, w, noLog);
    expect(w.career!.id).toBe('recluse');
    expect(s.character.home).toBe(2);
    expect(ownLock('action.build_hut', s.character, w)).toBe('lock.member');
    s.character.location = 1;
    w.career!.rank = 'journeyman';
    ownEnter('action.build_hut', s.character, w, noLog);
    expect(w.career).toMatchObject({ id: 'recluse', rank: 'journeyman' });
    expect(s.character.home).toBe(1);
  });

  it('hái lượm quanh lều được nhiều hơn theo bậc; xa lều thì như mọi người', () => {
    const grain = (k: CareerState | null, location: number) => {
      const c = adult().character;
      c.home = 2; c.location = location;
      settleAction('action.forage', c, tick, adult().economy.counties[location]!, never, null, k);
      return c.household.grain - 500;
    };
    expect(grain(career('recluse'), 2)).toBe(Math.floor((FORAGE * RECLUSE_FORAGE_PCT[0]) / 100));
    expect(grain(career('recluse', 'master'), 2)).toBe(Math.floor((FORAGE * RECLUSE_FORAGE_PCT[2]) / 100));
    expect(grain(career('recluse'), 0)).toBe(FORAGE);
    expect(CAREER_EVENT_PCT.recluse).toMatchObject({ opportunity: 200, daily: 50 });
  });
});

describe('theo cướp (v0.7 S6, Q8)', () => {
  it('sự kiện người lạ rủ rê: theo họ lên núi thì vào băng thật; người thân xa lánh', () => {
    const s = adult();
    s.character.location = 1;
    const b = band(s);
    const join = banditLure.choices.find((x) => x.id === 'join')!;
    const ctx = makeContext(s.character, s.events, s, s.economy, region, tick, s.npcs, s.bonds, s.reputation, s.factions);
    expect(join.available!(ctx)).toBeNull();
    expect(banditLure.choices.at(-1)!.id).toBe('refuse');
    const kin = s.npcs.people.find((n) => kinRole(s.character, n))!;
    const bond = ensureBond(s.bonds, kin.id);
    bond.closeness = 60; bond.trust = 60;
    join.apply(ctx, never);
    expect(s.career).toMatchObject({ id: 'outlaw', faction: b.id });
    expect(bandOf(s.factions, s)).toBe(b);
    expect([bond.closeness, bond.trust]).toEqual([60 - OUTLAW_KIN_COLD, 60 - OUTLAW_KIN_COLD]);
    expect(join.available!(ctx)).toBe('lock.member');
    expect(b.members).not.toContain('n0');
    // Snapshot vẫn hợp lệ (vào băng không thêm trường lạ vào đời)
    expect(vLifeSnapshot.check(JSON.parse(JSON.stringify(s)), '$')).toBeNull();
  });

  it('được chia của như một người trong đảng; không tính vào số người lập, tan đảng; sổ cái giữ', () => {
    const s = adult(), b = band(s);
    s.career = career('outlaw', 'apprentice', b.id);
    const before = money(s), purse = s.character.household.money, grain = s.character.household.grain;
    const log: string[] = [];
    banditsQuarter(s.factions, s.economy, s.npcs, region, 36 * 26, { int: (_lo: number, hi: number) => hi, chance: () => false } as unknown as Rng, { character: s.character, band: b.id, log: (e) => log.push(e.key) });
    expect(s.character.household.grain).toBeGreaterThan(grain);
    expect(s.character.household.money).toBeGreaterThan(purse);
    expect(log).toContain('log.outlaw.share');
    expect(b.members).toHaveLength(BANDIT_MIN_MEMBERS);
    expect(money(s)).toBe(before);
  });

  it('quan phủ thắng trận tiễu: người chơi trong băng có thể bị bắt, mất nửa túi vào kho quan phủ; sổ cái giữ', () => {
    const s = adult(), b = band(s), g = gov(s);
    Object.assign(g, { greed: 0, money: 100_000, members: [] });
    // Quan phủ không có sai dịch thì không đi tiễu: cho một sai dịch
    const official = s.npcs.people.find((n) => !n.death && !b.members.includes(n.id) && n.character.household.independent)!;
    official.occupation = 'official'; g.members = [official.id];
    s.career = career('outlaw', 'apprentice', b.id);
    const before = money(s), purse = s.character.household.money;
    const chances: number[] = [];
    const rng = { int: (lo: number) => lo, chance: (p: number) => { chances.push(p); return p === OUTLAW_CAUGHT_PPM; } } as unknown as Rng;
    const log: string[] = [];
    const report = governmentRule(g, s.factions, s.economy, s.npcs, region, s.tick, rng, { character: s.character, career: s.career, log: (e) => log.push(e.key) });
    expect(report.wins).toBe(1);
    expect(report.outlaw).toMatchObject({ caught: true, fine: Math.floor((purse * OUTLAW_FINE_PCT) / 100), death: null });
    expect(log).toContain('log.outlaw.lost');
    expect(money(s)).toBe(before);
  });

  it('ra băng: đủ tiền thì chuộc tội vào kho quan phủ; không đủ thì trốn, người trong băng thù', () => {
    const s = adult(), b = band(s), g = gov(s);
    s.career = career('outlaw', 'apprentice', b.id);
    const kho = g.money;
    expect(leaveBand(s.character, s.factions, s)).toBe('log.outlaw.atone');
    expect(g.money - kho).toBe(ATONE_FEE);
    s.character.household.money = 10;
    expect(leaveBand(s.character, s.factions, s)).toBe('log.outlaw.desert');
    for (const id of b.members) expect(s.bonds.find((x) => x.id === id)!.hostility).toBeGreaterThanOrEqual(DESERT_HOSTILITY);
  });

  it('trong đời người chơi: băng tan thì về làm dân; rời nghề theo cướp thì chuộc tội', () => {
    const s = adult();
    s.career = career('outlaw', 'apprentice', 'f99');
    const life = Life.restore(s, [], region);
    autoAdvance(life, 'week', lastChoice);
    expect(life.snapshot().career).toBeNull();
    expect(life.log.map((e) => e.key)).toContain('log.outlaw.disband');
    const t = adult(), b = band(t);
    t.career = career('outlaw', 'apprentice', b.id);
    const l2 = Life.restore(t, [], region);
    expect(l2.leaveCareer()).toBeNull();
    expect(l2.log.map((e) => e.key)).toEqual(expect.arrayContaining(['log.outlaw.atone', 'log.career.leave']));
    expect(l2.snapshot().careers.at(-1)!.id).toBe('outlaw');
  });
});
