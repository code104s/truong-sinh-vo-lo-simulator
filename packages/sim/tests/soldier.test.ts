// v0.7 S4: lính — sai dịch nha môn (ứng tuyển, lương quý, nợ lương, theo trận tiễu phỉ), võ đường (ADR 0020 Q5).
import { birthplaceId, regionId, type CareerRank, type MonthPlan } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { describe, expect, it } from 'vitest';
import { Life, Rng } from '../src/index';
import { autoAdvance, lastChoice, pastComingOfAge } from './auto';
import { enlist, enlistLock, type EnlistWorld } from '../src/life/soldier';
import {
  ARREARS_FROM, BATTLE_WOUND_PPM, governmentForce, governmentRule, OFFICIAL_RANK_PCT, OFFICIAL_REPLACE_MARGIN, OFFICIAL_WAGE, PERSON_VALUE,
} from '../src/factions/government';
import type { FactionPlayer, FactionState } from '../src/factions/state';
import type { CareerState } from '../src/life/career';
import type { LifeSnapshot } from '../src/life/life';
import { vLifeSnapshot } from '../src/life/validate';
import { DOJO_FEE } from '../src/economy/income';
import { PLAYER_ID } from '../src/npc/family';
import type { NpcState } from '../src/npc/state';

/** Quận 0 làng, quận 1 trấn (trị sở quan phủ), kề nhau. Hai quận: định biên một sai dịch. */
const region: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [0, 1].map((worldIndex) => ({ worldIndex, area: 100, seat: { x: worldIndex, y: 0 }, name: `Quận ${worldIndex}` })),
  settlementKind: ['village', 'town'], adjacency: [[0, 1]], terrainPct: [100], fertilityPct: [100, 100], seatKm: [[0, 60], [60, 0]],
};
const bp = { id: birthplaceId('r0/c1'), name: 'Trấn', nameHan: '鎮', kind: 'town' as const, cell: { x: 1, y: 0 }, county: 1 };
const soldier = (rank: CareerRank, faction: string): CareerState => ({ id: 'soldier', rank, since: 0, faction, mentor: null, years: 0, weeks: 0, idle: 0 });
const noLog = () => {};

/** Người chơi 25 tuổi ở trị sở, đã ra riêng; võ 600. Quan phủ thanh liêm, kho dày, nhiệm kỳ còn dài. */
function adult(): LifeSnapshot {
  const s = Life.create({ worldSeed: 'soldier', regionId: regionId('r0'), birthplaceId: bp.id }, bp, region).snapshot();
  s.character.birthTick = 0; s.tick = 25 * 36 + 10;
  s.character.health = s.character.healthMax = 1000; s.character.stamina = 900; s.character.conditions = [];
  s.character.location = 1;
  s.character.skillXp.martial = 600; s.character.skillXp.literacy = 0;
  Object.assign(s.character.household, { independent: true, money: 5_000, grain: 500 });
  const g = gov(s);
  Object.assign(g, { greed: 0, termEnds: 1_000_000, money: 100_000 });
  return pastComingOfAge(s);
}
const gov = (s: LifeSnapshot): FactionState => s.factions.list.find((f) => f.kind === 'government')!;
/** Một NPC người lớn ở trị sở làm sai dịch, chữ võ bằng `score`; ngoài ra không ai trong nhóm được tuyển (về làng). */
function staffed(s: LifeSnapshot, score = 0): NpcState {
  const g = gov(s);
  const adults = s.npcs.people.filter((n) => !n.death && n.character.household.independent && n.id !== s.character.kin.father && n.id !== s.character.kin.mother);
  for (const n of s.npcs.people) n.character.home = 0;
  const n = adults[0]!;
  Object.assign(n.character, { home: 1, location: 1, birthTick: 0 });
  n.character.skillXp.literacy = score; n.character.skillXp.martial = 0;
  n.occupation = 'official';
  g.members = [n.id];
  return n;
}
const office = (s: LifeSnapshot): EnlistWorld => ({ career: s.career, careers: s.careers, factions: s.factions, npcs: s.npcs, bonds: s.bonds, logic: region, tick: s.tick });
const me = (s: LifeSnapshot, log: FactionPlayer['log'] = noLog): FactionPlayer => ({ character: s.character, career: s.career, log });
const money = (s: LifeSnapshot) => s.character.household.money + s.economy.counties.reduce((x, ce) => x + ce.money, 0) + s.factions.list.reduce((x, f) => x + f.money, 0)
  + s.npcs.people.reduce((x, n) => x + n.character.household.money, 0);
/** Rng giả: `int` lấy cận dưới (luôn đi tiễu, quan phủ thắng) trừ khi `lose`; `chance` theo hàng đợi (hết hàng: trượt). */
function rng(chances: boolean[] = [], lose = false): Rng {
  return { int: (lo: number, hi: number) => (lose && hi !== 999 ? hi : lo), chance: () => chances.shift() ?? false } as unknown as Rng;
}
function band(s: LifeSnapshot, members: string[] = []): FactionState {
  const b: FactionState = { id: 'f9', kind: 'bandits', name: { key: 'faction.bandits.name', params: { place: 'Quận 0' } }, seat: 0, counties: [], holds: [], roads: [], members, leader: null, power: 1_000, losses: 0, greed: 0, termEnds: 0, relations: [], money: 0, grain: 0, founded: 0, ended: null };
  s.factions.list.push(b);
  for (const id of members) s.npcs.people.find((n) => n.id === id)!.occupation = 'bandit';
  return b;
}

describe('ứng tuyển sai dịch (v0.7 S4)', () => {
  it('khóa: chỉ ở trị sở, 18–45 tuổi; đủ người thì phải hơn sai dịch kém nhất từ 500 chữ + võ; đã là sai dịch thì thôi', () => {
    const s = adult();
    staffed(s, 200);
    s.character.location = 0;
    expect(enlistLock(s.character, office(s))).toBe('lock.not_seat');
    s.character.location = 1;
    s.character.birthTick = s.tick - 50 * 36;
    expect(enlistLock(s.character, office(s))).toBe('lock.age');
    s.character.birthTick = 0;
    expect(enlistLock(s.character, office(s))).toBe('lock.no_post');
    s.character.skillXp.martial = 200 + OFFICIAL_REPLACE_MARGIN;
    expect(enlistLock(s.character, office(s))).toBeNull();
    // Còn chỗ (sai dịch NPC đã mất) thì ai đúng tuổi cũng vào được
    s.character.skillXp.martial = 0;
    gov(s).members = [];
    expect(enlistLock(s.character, office(s))).toBeNull();
    s.career = soldier('apprentice', gov(s).id);
    expect(enlistLock(s.character, office(s))).toBe('lock.member');
  });

  it('đủ người: thay sai dịch kém nhất (người ấy về nghề cũ); vào nghề lính bậc học việc, nơi nhận là quan phủ', () => {
    const s = adult();
    const n = staffed(s);
    const w = office(s);
    const log: string[] = [];
    enlist(s.character, w, (e) => log.push(e.key));
    expect(gov(s).members).toEqual([]);
    expect(n.occupation).not.toBe('official');
    expect(w.career).toMatchObject({ id: 'soldier', rank: 'apprentice', faction: gov(s).id });
    expect(log).toEqual(['log.soldier.replace', 'log.soldier.enlist']);
  });
});

describe('lương sai dịch, nợ lương (v0.7 S4)', () => {
  it('lương quý từ kho quan phủ theo bậc của người chơi (S9: 85 / 95 / 110% lương lệ); sổ cái giữ', () => {
    for (const rank of ['apprentice', 'master'] as const) {
      const s = adult();
      s.career = soldier(rank, gov(s).id);
      const before = money(s), purse = s.character.household.money;
      governmentRule(gov(s), s.factions, s.economy, s.npcs, region, s.tick, rng(), me(s));
      expect(s.character.household.money - purse).toBe(Math.floor((OFFICIAL_WAGE * OFFICIAL_RANK_PCT[rank === 'master' ? 2 : 0]) / 100));
      expect(money(s)).toBe(before);
    }
  });

  it('quan tham giữ lại (độ tham − 50)% lương, ghi nợ từng người; quan không tham trả cả nợ cũ; thôi việc thì mất nợ', () => {
    const s = adult();
    const n = staffed(s);
    s.career = soldier('apprentice', gov(s).id);
    const g = gov(s);
    g.greed = 80;
    const purse = s.character.household.money, npcPurse = n.character.household.money, before = money(s);
    // Người chơi học việc lương theo bậc (S9), NPC lương lệ; nợ tính trên lương của từng người
    const withheld = Math.floor((OFFICIAL_WAGE * (80 - ARREARS_FROM)) / 100);
    const mine = Math.floor((OFFICIAL_WAGE * OFFICIAL_RANK_PCT[0]) / 100), mineHeld = Math.floor((mine * (80 - ARREARS_FROM)) / 100);
    governmentRule(g, s.factions, s.economy, s.npcs, region, s.tick, rng(), me(s));
    expect(s.character.household.money - purse).toBe(mine - mineHeld);
    expect(n.character.household.money - npcPurse).toBe(OFFICIAL_WAGE - withheld);
    expect(g.owed).toEqual([{ id: PLAYER_ID, coin: mineHeld }, { id: n.id, coin: withheld }]);
    expect(money(s)).toBe(before);
    // Quan mới thanh liêm: lương quý cộng nợ cũ
    g.greed = 10;
    const log: string[] = [];
    const p2 = s.character.household.money;
    governmentRule(g, s.factions, s.economy, s.npcs, region, s.tick + 9, rng(), me(s, (e) => log.push(e.key)));
    expect(s.character.household.money - p2).toBe(mine + mineHeld);
    expect(g.owed).toBeUndefined();
    expect(log).toContain('log.soldier.repaid');
    // Lại bị nợ rồi thôi việc: phần nợ ở lại kho
    g.greed = 100;
    governmentRule(g, s.factions, s.economy, s.npcs, region, s.tick + 18, rng(), me(s));
    s.career = null;
    governmentRule(g, s.factions, s.economy, s.npcs, region, s.tick + 27, rng(), me(s));
    expect(g.owed?.map((x) => x.id)).toEqual([n.id]);
    expect(money(s)).toBe(before);
  });

  it('kho cạn: người kém nhất nghỉ trước (người chơi bằng điểm thì đi trước); người hơn hẳn thì thay người chơi', () => {
    const s = adult();
    s.character.skillXp.martial = 0;
    s.career = soldier('apprentice', gov(s).id);
    gov(s).money = OFFICIAL_WAGE - 1;
    expect(governmentRule(gov(s), s.factions, s.economy, s.npcs, region, s.tick, rng(), me(s)).soldier).toMatchObject({ left: 'dismissed' });
    // Ứng viên NPC ở trị sở hơn người chơi từ 500 chữ + võ
    const t = adult();
    t.character.skillXp.martial = 0;
    staffed(t).occupation = 'laborer';
    gov(t).members = [];
    t.npcs.people.find((n) => n.character.home === 1)!.character.skillXp.literacy = OFFICIAL_REPLACE_MARGIN;
    t.career = soldier('apprentice', gov(t).id);
    expect(governmentRule(gov(t), t.factions, t.economy, t.npcs, region, t.tick, rng(), me(t)).soldier).toMatchObject({ left: 'replaced' });
    expect(gov(t).members).toHaveLength(1);
  });
});

describe('theo trận tiễu phỉ (v0.7 S4)', () => {
  it('người chơi sai dịch góp thế vào trận; thắng thua ghi nhật ký; bên thua bị thương nặng hơn bên thắng', () => {
    const s = adult();
    const g = gov(s);
    s.career = soldier('apprentice', g.id);
    band(s);
    const force = governmentForce(g, new Map(), s.character);
    expect(force - governmentForce(g, new Map())).toBe(PERSON_VALUE + 600);
    const seen: number[] = [];
    const log: string[] = [];
    const won = { int: (lo: number) => lo, chance: (p: number) => { seen.push(p); return false; } } as unknown as Rng;
    const report = governmentRule(g, s.factions, s.economy, s.npcs, region, s.tick, won, me(s, (e) => log.push(e.key)));
    expect(report.wins).toBe(1);
    expect(log).toContain('log.soldier.won');
    // Võ 600 giảm rủi ro 3,6%
    expect(seen).toEqual([Math.floor((BATTLE_WOUND_PPM[0] * 97) / 100)]);
    // Thua: bị thương thì gãy xương
    const t = adult();
    t.career = soldier('apprentice', gov(t).id);
    band(t);
    const log2: string[] = [];
    governmentRule(gov(t), t.factions, t.economy, t.npcs, region, t.tick, rng([true, false], true), me(t, (e) => log2.push(e.key)));
    expect(log2).toContain('log.soldier.lost');
    expect(t.character.conditions.map((c) => c.id)).toEqual(['injury.fracture']);
  });

  it('chết trận: người chơi, sai dịch NPC, người theo cướp đều có thể chết; người mất để lại của cho người thừa kế; sổ cái giữ', () => {
    const s = adult();
    const n = staffed(s, 1_000);
    s.career = soldier('apprentice', gov(s).id);
    const robber = s.npcs.people.find((x) => !x.death && x.id !== n.id && x.character.household.independent)!;
    band(s, [robber.id]);
    const before = money(s);
    const report = governmentRule(gov(s), s.factions, s.economy, s.npcs, region, s.tick, rng(Array(20).fill(true)), me(s));
    expect(report.soldier!.death).toMatchObject({ cause: 'accident', detail: 'accident.battle' });
    expect(n.death).not.toBeNull();
    expect(robber.death).not.toBeNull();
    expect(gov(s).members).toEqual([]);
    expect(money(s)).toBe(before);
  });
});

describe('lính trong đời người chơi (v0.7 S4)', () => {
  it('ứng tuyển trong kế hoạch, đi tuần tính năm làm nghề, lĩnh lương đầu quý; lưu/tải cùng digest', () => {
    const s = adult();
    staffed(s);
    const l = Life.restore(s, [], region);
    const total = l.totalMoney();
    expect(l.actions().find((a) => a.id === 'action.patrol')!.locked).toBe('lock.career');
    expect(l.setPlan({ slots: [{ action: 'action.enlist' }, { action: 'action.patrol' }, { action: 'action.patrol' }] })).toBe(true);
    // Tick đầu rơi vào ô thứ hai (tick % 3 = 1): ứng tuyển ở tuần thứ ba, đi tuần ở các tuần sau
    for (let i = 0; i < 5; i++) autoAdvance(l, 'week', lastChoice);
    const snap = l.snapshot();
    expect(snap.career).toMatchObject({ id: 'soldier', faction: gov(snap).id });
    expect(snap.career!.weeks).toBeGreaterThan(0);
    // Tới đầu quý: lương vào túi
    const purse = l.character.household.money;
    for (let i = 0; i < 30 && !l.log.some((e) => e.key === 'log.soldier.wage'); i++) autoAdvance(l, 'week', lastChoice);
    expect(l.log.some((e) => e.key === 'log.soldier.wage')).toBe(true);
    expect(l.character.household.money).toBeGreaterThan(purse - 200);
    expect(vLifeSnapshot.check(JSON.parse(JSON.stringify(l.snapshot())), '$')).toBeNull();
    const mid = Life.restore(JSON.parse(JSON.stringify(l.snapshot())), [], region);
    autoAdvance(l, 'week', lastChoice); autoAdvance(mid, 'week', lastChoice);
    expect(mid.digest()).toBe(l.digest());
    expect(l.totalMoney()).toBe(total);
  });

  it('võ đường: học phí vào quỹ quận, võ lên gấp đôi tự luyện, chỉ ở trấn, thành', () => {
    const gain = (action: string) => {
      const l = Life.restore(adult(), [], region);
      const plan: MonthPlan = { slots: [{ action }, { action: 'action.rest' }, { action: 'action.rest' }] };
      const [xp, purse, fund] = [l.character.skillXp.martial, l.character.household.money, l.snapshot().economy.counties[1]!.money];
      l.setPlan(plan);
      // Tick đầu rơi vào ô thứ hai (tick % 3 = 1): ô đầu chạy ở tuần thứ ba
      for (let i = 0; i < 3; i++) autoAdvance(l, 'week', lastChoice);
      return { xp: l.character.skillXp.martial - xp, paid: purse - l.character.household.money, fund: l.snapshot().economy.counties[1]!.money - fund };
    };
    const dojo = gain('action.dojo'), train = gain('action.train');
    expect(dojo.xp).toBeGreaterThanOrEqual(2 * train.xp - 1);
    expect(dojo.paid - train.paid).toBe(DOJO_FEE);
    const t = adult();
    t.character.location = 0;
    const options = Life.restore(t, [], region).actions();
    expect(options.find((a) => a.id === 'action.dojo')!.locked).toBe('lock.place');
    // Bảng chọn hiện cả khóa của quan phủ cho ô ứng tuyển
    expect(options.find((a) => a.id === 'action.enlist')!.locked).toBe('lock.not_seat');
  });
});
