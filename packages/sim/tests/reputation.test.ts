// v0.5 S6: tiếng tăm theo quận (lan, phai, việc làm có tiếng, ảnh hưởng) và tin đồn từ quận kề — ADR 0017 Q9.
import { birthplaceId, calendarOf, regionId, TICKS_PER_MONTH } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { describe, expect, it } from 'vitest';
import { Life, Rng } from '../src/index';
import { autoAdvance, lastChoice } from './auto';
import { EVENTS } from '../src/events/catalog';
import { choose, makeContext, type EventDef } from '../src/events/engine';
import { vLifeSnapshot } from '../src/life/validate';
import { kinRole, lookup, single } from '../src/npc/family';
import { bondOf } from '../src/social/bonds';
import { socialAct, type SocialWorld } from '../src/social/actions';
import { addReputation, fadeReputation, firstImpression, reputationBand, spreadReputation } from '../src/social/reputation';
import type { LifeSnapshot } from '../src/life/life';

const chain: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [0, 1, 2, 3].map((worldIndex) => ({ worldIndex, area: 100, seat: { x: worldIndex, y: 0 }, name: `Quận ${worldIndex}` })),
  settlementKind: ['village', 'town', 'village', 'village'], adjacency: [[0, 1], [1, 2], [2, 3]], terrainPct: [100, 100, 100], fertilityPct: [100, 100, 100, 100],
  seatKm: [[0, 60, 120, 180], [60, 0, 60, 120], [120, 60, 0, 60], [180, 120, 60, 0]],
};
const bp = { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village' as const, cell: { x: 0, y: 0 }, county: 0 };
const half = { chance: (ppm: number) => ppm >= 500_000 } as unknown as Rng;

/** Người chơi 25 tuổi đã ra riêng ở quận 0, giữa năm (không vướng đầu năm). */
function adult(seed = 'rep'): LifeSnapshot {
  const s = Life.create({ worldSeed: seed, regionId: regionId('r0'), birthplaceId: bp.id }, bp, chain).snapshot();
  s.tick = 30 * 36 + 13;
  const c = s.character;
  c.birthTick = s.tick - 25 * 36;
  Object.assign(c.household, { independent: true, money: 5_000, grain: 600 });
  c.health = c.healthMax = 1000; c.stamina = 900; c.conditions = [];
  s.events.once.push('event.coming_of_age');
  return s;
}

describe('tiếng tăm: lan, phai, dải (v0.5 S6)', () => {
  it('đầu tháng lan sang quận kề một nửa phần chênh với nửa tiếng quận kề; xa một quận thì nhỏ đi một nửa, không vượt nơi phát ra', () => {
    const rep = [40, 0, 0, 0];
    spreadReputation(rep, chain);
    expect(rep).toEqual([40, 10, 0, 0]);
    spreadReputation(rep, chain);
    expect(rep).toEqual([40, 15, 2, 0]);
    for (let k = 0; k < 40; k++) spreadReputation(rep, chain);
    expect(rep[0]).toBe(40);
    expect(rep[1]).toBeLessThanOrEqual(20);
    expect(rep[2]).toBeLessThanOrEqual(10);
    expect(rep[3]).toBeLessThanOrEqual(5);
    // Tiếng xấu lan như tiếng tốt; quận nghe hai bên thì theo bên vang hơn
    const bad = [0, 0, -60, 0];
    spreadReputation(bad, chain);
    expect(bad).toEqual([0, -15, -60, -15]);
    const both = [30, 0, -60, 0];
    spreadReputation(both, chain);
    expect(both[1]).toBe(-15);
  });

  it('đầu năm phai 10% về 0, làm tròn lên; giữ trong −100..100', () => {
    const rep = [100, 9, -25, 1, 0];
    fadeReputation(rep);
    expect(rep).toEqual([90, 8, -22, 0, 0]);
    addReputation(rep, 0, 50);
    addReputation(rep, 2, -500);
    expect([rep[0], rep[2]]).toEqual([100, -100]);
  });

  it('dải: khét tiếng ≤ −50, bị chê ≤ −15, vô danh, được nể ≥ 15, có tiếng tốt ≥ 50', () => {
    expect([-50, -49, -15, -14, 14, 15, 49, 50].map(reputationBand)).toEqual(['infamous', 'disliked', 'disliked', 'unknown', 'unknown', 'respected', 'respected', 'renowned']);
  });
});

describe('việc làm có tiếng, ảnh hưởng (v0.5 S6)', () => {
  it('bảng tiếng tăm, quan hệ của sự kiện chỉ nhắc kết quả có thật (có văn bản)', async () => {
    const { VI } = await import('@tsvl/content');
    const withRep = EVENTS.filter((d) => d.reputation);
    expect(withRep.length).toBeGreaterThanOrEqual(15);
    for (const d of EVENTS) for (const k of [...Object.keys(d.reputation ?? {}), ...Object.keys(d.bonds ?? {})]) expect(VI[`${d.id}.result.${k}`], `${d.id}.${k}`).toBeDefined();
  });

  it('lựa chọn sự kiện cộng tiếng ở quận đang đứng; người mới quen tin, ghét theo tiếng', () => {
    const s = adult();
    const other = s.npcs.people.find((n) => !n.death && !kinRole(s.character, n))!;
    const def: EventDef = {
      id: 'event.test', category: 'daily', weight: () => 0, cooldownTicks: 0,
      reputation: { rescue: 15 }, bonds: { rescue: { closeness: 5 } },
      choices: [{ id: 'rescue', costs: ['risk'], apply: () => ({ result: 'rescue' }) }, { id: 'leave', costs: ['time'], apply: () => ({ result: 'leave' }) }],
    };
    s.reputation[0] = 30;
    s.events.pending = { instance: 1, eventId: def.id, tick: s.tick, variant: null, params: {}, figure: null, npcId: other.id };
    const ctx = makeContext(s.character, s.events, s, s.economy, chain, s.tick, s.npcs, s.bonds, s.reputation);
    expect(choose(s.events, [def], ctx, 1, 'rescue', Rng.fromSeed(1), () => {})).toBeNull();
    expect(s.reputation).toEqual([45, 0, 0, 0]);
    expect(bondOf(s.bonds, other.id)).toMatchObject({ closeness: 5, ...firstImpression(30) });
    expect(firstImpression(30)).toEqual({ trust: 15, hostility: 0 });
    expect(firstImpression(-30)).toEqual({ trust: 0, hostility: 15 });
  });

  it('tiếng tốt giúp người ta nhận lời: ngỏ lời bị chối ở quận vô danh, được nhận ở quận người ta nể', () => {
    const s = adult('rep-wed');
    const c = s.character;
    const byId = lookup(s.npcs);
    const other = s.npcs.people.find((n) => !n.death && n.character.location === 0 && n.character.gender !== c.gender && !kinRole(c, n))!;
    const was = other.character.kin.spouse === null ? undefined : byId.get(other.character.kin.spouse);
    if (was) was.character.kin.spouse = null;
    other.character.kin.spouse = null; other.character.household.independent = true;
    other.character.birthTick = c.birthTick + (c.gender === 'male' ? 36 : -36);
    expect(single(other, byId)).toBe(true);
    const w = (rep: number): SocialWorld => ({ npcs: s.npcs, bonds: s.bonds, rng: half, tick: s.tick, logic: chain, reputation: [rep, 0, 0, 0] });
    s.bonds.push({ id: other.id, closeness: 55, trust: 0, hostility: 0, owed: 0 });
    const log: string[] = [];
    // 55 × 8.000 = 440.000 < một nửa; thêm tiếng 30 × 3.000 = 90.000 → 530.000
    socialAct({ action: 'action.propose', person: other.id }, c, w(0), (e) => log.push(e.key));
    bondOf(s.bonds, other.id)!.closeness = 55;
    socialAct({ action: 'action.propose', person: other.id }, c, w(30), (e) => log.push(e.key));
    expect(log[0]).toBe('log.marry.refused');
    expect(log[1]).toMatch(/^log\.marry\.wed_/);
  });

  it('thiếu thuế đinh thì mất tiếng ở quận nhà; trạng thái và tổng kết đọc theo dải; lưu/tải giữ tiếng', () => {
    const s = adult('rep-tax');
    s.tick = 31 * 36 - 1;
    Object.assign(s.character.household, { money: 0, grain: 600 });
    s.reputation = [20, 0, 0, 0];
    // Không vướng tang người thân (lo tang cũng có tiếng)
    s.character.kin = { father: null, mother: null, spouse: null };
    const l = Life.restore(s, [], chain);
    expect(l.view().reputation).toBe('respected');
    autoAdvance(l, 'week', lastChoice);
    autoAdvance(l, 'week', lastChoice);
    expect(l.log.some((e) => e.key === 'log.tax.short')).toBe(true);
    // Đầu năm: phai 20 → 18, lan sang quận 1, rồi thiếu thuế −5 ở quận nhà
    const snap = l.snapshot();
    expect(snap.reputation[0]).toBe(13);
    expect(l.view().reputation).toBe('unknown');
    expect(vLifeSnapshot.check(JSON.parse(JSON.stringify(snap)), '$')).toBeNull();
    expect(Life.restore(snap, [], chain).snapshot().reputation).toEqual(snap.reputation);
  });
});

describe('tin đồn từ quận kề (v0.5 S6)', () => {
  /** Tua tới đầu tháng kế tiếp (tuần đầu tháng chạy xong). */
  const toNextMonth = (l: Life) => { const end = (Math.floor(l.tick / TICKS_PER_MONTH) + 1) * TICKS_PER_MONTH + 1; while (l.tick < end) autoAdvance(l, 'week', lastChoice); };

  it('tai họa, dịch ở quận kề: nghe sau một tháng, tin thường; quận không kề thì không nghe', () => {
    const s = adult('rumor');
    const next = (Math.floor(s.tick / TICKS_PER_MONTH) + 1) * TICKS_PER_MONTH;
    const month = calendarOf(next).month;
    Object.assign(s.economy.counties[1]!, { disaster: 'flood', disasterMonth: month });
    Object.assign(s.economy.counties[2]!, { disaster: 'flood', disasterMonth: month });
    s.economy.counties[1]!.epidemicFrom = next;
    const l = Life.restore(s, [], chain);
    toNextMonth(l);
    expect(l.log.some((e) => e.key.startsWith('log.rumor.'))).toBe(false);
    expect(l.snapshot().rumors.map((r) => [r.key, r.tick])).toEqual([['log.rumor.flood', next + TICKS_PER_MONTH], ['log.rumor.epidemic', next + TICKS_PER_MONTH]]);
    toNextMonth(l);
    const heard = l.log.filter((e) => e.key.startsWith('log.rumor.'));
    expect(heard.map((e) => [e.key, e.params.county, e.importance])).toEqual([['log.rumor.flood', 'Quận 1', 'minor'], ['log.rumor.epidemic', 'Quận 1', 'minor']]);
    expect(l.snapshot().rumors).toEqual([]);
  });

  it('người quen mất ở quận khác: tin đồn tới sau một tháng; người lạ ở quận khác thì không có tin', () => {
    const s = adult('rumor-death');
    const others = s.npcs.people.filter((n) => !n.death && !kinRole(s.character, n) && n.character.location === 0).slice(0, 2);
    for (const n of others) {
      Object.assign(n.character, { location: 2, home: 2, health: -1, conditions: [{ id: 'illness.fever', kind: 'illness', severity: 'grave', weeksLeft: 4 }] });
    }
    s.bonds.push({ id: others[0]!.id, closeness: 30, trust: 0, hostility: 0, owed: 0 });
    s.bonds.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
    const l = Life.restore(s, [], chain);
    for (let k = 0; k < 4; k++) toNextMonth(l);
    const heard = l.log.filter((e) => e.key === 'log.rumor.death');
    expect(heard.map((e) => e.params.name)).toEqual([others[0]!.character.name]);
    const died = l.npcDeaths().find((d) => d.id === others[0]!.id)!;
    expect(heard[0]!.tick).toBeGreaterThanOrEqual(died.tick + TICKS_PER_MONTH);
    expect(l.log.some((e) => e.params.name === others[1]!.character.name)).toBe(false);
  });
});
