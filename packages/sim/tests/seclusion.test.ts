// v0.8 S6: giá với phàm giới (quan hệ phai khi ngồi tu nhiều), ám ảnh có thể buông, sự kiện đời tu (ADR 0022 Q10).
import { birthplaceId, regionId, TICKS_PER_YEAR } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { describe, expect, it } from 'vitest';
import { Life, Rng } from '../src/index';
import { autoAdvance, lastChoice, pastComingOfAge } from './auto';
import { newCultivation, QI_PEAK, type CultivationState } from '../src/life/cultivation';
import { cultivate, SECLUSION_FADE_SLOTS } from '../src/life/cultivate';
import { MERIDIAN_ILLNESS } from '../src/life/rogue';
import { choose, makeContext, type EventDef } from '../src/events/engine';
import { EVENTS } from '../src/events/catalog';
import {
  CULTIVATION_EVENTS, cultivatorRobber, ERRAND_FEE, fakeElixir, hauntedDream, parentFar, qiDeviation, SECLUDED_SLOTS, sectErrand, spouseCold,
} from '../src/events/defs/cultivation';
import { sectOf } from '../src/factions/sect';
import { countyMoney } from '../src/economy/market';
import { npcMoney } from '../src/npc/state';
import { factionMoney } from '../src/factions/state';
import type { LifeSnapshot } from '../src/life/life';

/** Quận 0 làng có núi (đường 0–2 qua núi), 1 trấn, 2 làng có núi. */
const region: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [30, 31, 32].map((worldIndex, k) => ({ worldIndex, area: 100, seat: { x: k, y: 0 }, name: `Quận ${k}` })),
  settlementKind: ['village', 'town', 'village'], adjacency: [[0, 1], [0, 2]], terrainPct: [100, 250], fertilityPct: [100, 100, 100],
  seatKm: [[0, 60, 60], [60, 0, 120], [60, 120, 0]],
};
const bp = { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village' as const, cell: { x: 0, y: 0 }, county: 0 };

function adult(cult: Partial<CultivationState> = {}, plan = 'action.rest', flags: string[] = []): LifeSnapshot {
  const s = Life.create({ worldSeed: 'gia-pham-gioi', regionId: regionId('r0'), birthplaceId: bp.id }, bp, region).snapshot();
  s.character.birthTick = 0; s.tick = 25 * TICKS_PER_YEAR + 4; s.character.location = 0;
  s.character.household = { ...s.character.household, independent: true, money: 3_000, grain: 600 };
  s.character.health = s.character.healthMax = 1000; s.character.stamina = 900; s.character.conditions = [];
  s.character.spiritRoot = { elements: ['wood', 'fire'], purity: 50 }; s.character.personality = 'kind';
  s.cultivation = { ...newCultivation(), root: 'fair', ...cult };
  s.plan = { slots: [0, 1, 2].map(() => ({ action: plan })) as never };
  s.events.flags = [...flags];
  return pastComingOfAge(s);
}
const ctxOf = (s: LifeSnapshot) => makeContext(s.character, s.events, s, s.economy, region, s.tick, s.npcs, s.bonds, s.reputation, s.factions);
const run = (ev: EventDef, s: LifeSnapshot, choice: string, seed = 3) => {
  const ctx = ctxOf(s);
  const npc = ev.cast?.(ctx, Rng.fromSeed(1)) ?? null;
  s.events.pending = { instance: 0, eventId: ev.id, tick: s.tick, variant: null, params: ev.params?.(ctx) ?? {}, figure: null, npcId: npc?.id ?? null };
  const log: string[] = [];
  expect(choose(s.events, EVENTS, ctxOf(s), 0, choice, Rng.fromSeed(seed), (e) => log.push(e.key))).toBeNull();
  return log.at(-1)!;
};
/** Cha hay mẹ của người chơi: đặt già, ở cùng quận. */
function agedMother(s: LifeSnapshot) {
  const m = s.npcs.people.find((n) => n.id === s.character.kin.mother)!;
  m.character.location = 0; m.character.birthTick = s.tick - 60 * TICKS_PER_YEAR; m.death = null; m.character.alive = true;
  return m;
}

describe('giá với phàm giới (v0.8 S6, Q10)', () => {
  it('mỗi ô tu luyện đếm vào năm; đầu năm, năm qua tu từ nửa số ô thì quan hệ phai thêm một lượt, rồi đếm lại', () => {
    const c = adult({ path: 'sect' });
    cultivate(c.character, c.cultivation, region, c.tick, () => {});
    expect(c.cultivation.secluded).toBe(1);
    const yearStart = 26 * TICKS_PER_YEAR - 2;
    const fade = (secluded: number) => {
      const s = adult({ path: 'sect', secluded }); s.tick = yearStart;
      const m = agedMother(s);
      s.bonds = s.bonds.filter((b) => b.id !== m.id);
      s.bonds.push({ id: m.id, closeness: 90, trust: 50, hostility: 0, owed: 0 });
      s.bonds.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
      const l = Life.restore(s, [], region);
      autoAdvance(l, 'week', lastChoice); autoAdvance(l, 'week', lastChoice); autoAdvance(l, 'week', lastChoice);
      const snap = l.snapshot();
      return { closeness: snap.bonds.find((b) => b.id === m.id)!.closeness, secluded: snap.cultivation.secluded };
    };
    const busy = fade(SECLUSION_FADE_SLOTS), idle = fade(SECLUSION_FADE_SLOTS - 1);
    expect(busy.closeness).toBeLessThan(idle.closeness);
    expect([busy.secluded, idle.secluded]).toEqual([0, 0]);
  });

  it('cha mẹ già, vợ chồng ở bên: chỉ khi năm nay đã ngồi tu nhiều; ra với người nhà thì gần lại, ngồi lì thì nhạt', () => {
    const s = adult({ path: 'sect', secluded: SECLUDED_SLOTS - 1 }); agedMother(s);
    expect(parentFar.weight(ctxOf(s))).toBe(0);
    s.cultivation.secluded = SECLUDED_SLOTS;
    expect(parentFar.weight(ctxOf(s))).toBeGreaterThan(0);
    const m = agedMother(s);
    const before = s.bonds.find((b) => b.id === m.id)?.closeness ?? 0;
    expect(run(parentFar, s, 'stay')).toBe('event.parent_far.result.stay');
    expect(s.bonds.find((b) => b.id === m.id)!.closeness).toBeLessThan(Math.max(before, 10));
    const v = adult({ path: 'sect', secluded: SECLUDED_SLOTS }); agedMother(v);
    run(parentFar, v, 'visit');
    expect(v.active).toMatchObject({ slot: { action: 'action.nurse' } });
    // Không có vợ chồng ở bên thì không có chuyện bữa cơm một người
    const single = adult({ path: 'sect', secluded: SECLUDED_SLOTS }); single.character.kin.spouse = null;
    expect(spouseCold.weight(ctxOf(single))).toBe(0);
    // Hứa bớt ngồi tu: mất linh khí
    const promise = adult({ path: 'sect', secluded: SECLUDED_SLOTS, qi: 2_000 });
    run(spouseCold, promise, 'share');
    expect(promise.cultivation.qi).toBeLessThan(2_000);
  });

  it('ám ảnh: chỉ người mang ám ảnh chưa có đường tu; buông thì hết, các sự kiện ám ảnh không đến nữa; thuốc tiên giả mất tiền vào chợ', () => {
    expect(fakeElixir.weight(ctxOf(adult()))).toBe(0);
    const s = adult({}, 'action.rest', ['haunted']);
    expect(fakeElixir.weight(ctxOf(s))).toBeGreaterThan(0);
    expect(hauntedDream.weight(ctxOf(adult({ path: 'rogue' }, 'action.rest', ['haunted'])))).toBe(0);
    const total = countyMoney(s.economy) + npcMoney(s.npcs) + factionMoney(s.factions) + s.character.household.money;
    expect(run(fakeElixir, s, 'buy')).toBe('event.fake_elixir.result.buy');
    expect(countyMoney(s.economy) + npcMoney(s.npcs) + factionMoney(s.factions) + s.character.household.money).toBe(total);
    run(hauntedDream, s, 'let_go');
    expect(s.events.flags).not.toContain('haunted');
    expect(s.events.flags).toContain('let_go');
    expect([fakeElixir.weight(ctxOf(s)), hauntedDream.weight(ctxOf(s))]).toEqual([0, 0]);
  });
});

describe('sự kiện đời tu (v0.8 S6)', () => {
  it('kẻ chặn đường: chỉ người tu có linh thạch; đưa thì mất hết, van xin mất một khối và sức khỏe', () => {
    expect(cultivatorRobber.weight(ctxOf(adult({ path: 'rogue', stones: 0 }, 'action.seek')))).toBe(0);
    const s = adult({ path: 'rogue', stones: 3 }, 'action.seek');
    expect(cultivatorRobber.weight(ctxOf(s))).toBeGreaterThan(0);
    run(cultivatorRobber, s, 'hand_over');
    expect(s.cultivation.stones).toBe(0);
    const b = adult({ path: 'rogue', stones: 3 }, 'action.seek'), hp = b.character.health;
    run(cultivatorRobber, b, 'beg');
    expect([b.cultivation.stones, b.character.health < hp]).toEqual([2, true]);
  });

  it('khí nghịch: đến khi đang ngồi tu, tâm cảnh càng loạn càng hay đến; cố dẫn qua có thể thương kinh mạch', () => {
    expect(qiDeviation.weight(ctxOf(adult({ path: 'sect' })))).toBe(0);
    const calm = adult({ path: 'sect' }, 'action.cultivate');
    const hungry = adult({ path: 'sect' }, 'action.cultivate'); hungry.character.household.hunger = 2;
    expect(qiDeviation.weight(ctxOf(hungry))).toBeGreaterThan(qiDeviation.weight(ctxOf(calm)));
    let hurt = 0;
    for (let i = 0; i < 40; i++) {
      const s = adult({ path: 'sect', qi: 5_000 }, 'action.cultivate');
      if (run(qiDeviation, s, 'push', i) === 'event.qi_deviation.result.push_hurt') {
        hurt++;
        expect(s.character.conditions[0]!.id).toBe(MERIDIAN_ILLNESS);
        expect(s.cultivation.qi).toBeLessThan(5_000);
      } else expect(s.cultivation.qi).toBeGreaterThan(5_000);
    }
    expect(hurt).toBeGreaterThan(5);
    expect(hurt).toBeLessThan(35);
  });

  it('tin từ trên núi: chỉ đệ tử còn tên; đi hái thuốc tính hai tuần tạp dịch, nộp tiền thì vào kho tông môn (sổ cái giữ)', () => {
    expect(sectErrand.weight(ctxOf(adult({ path: 'sect', duty: null })))).toBe(0);
    const s = adult({ path: 'sect', duty: { weeks: 0, missed: 0, since: 0 } });
    expect(sectErrand.weight(ctxOf(s))).toBeGreaterThan(0);
    run(sectErrand, s, 'go');
    expect(s.cultivation.duty!.weeks).toBe(2);
    const p = adult({ path: 'sect', duty: { weeks: 0, missed: 0, since: 0 } });
    const total = countyMoney(p.economy) + npcMoney(p.npcs) + factionMoney(p.factions) + p.character.household.money;
    run(sectErrand, p, 'pay');
    expect(sectOf(p.factions)!.money).toBe(ERRAND_FEE);
    expect(countyMoney(p.economy) + npcMoney(p.npcs) + factionMoney(p.factions) + p.character.household.money).toBe(total);
  });

  it('linh khí từ sự kiện không vượt đỉnh, không âm', () => {
    const top = adult({ path: 'sect', qi: QI_PEAK.qi1 }, 'action.cultivate');
    for (let i = 0; i < 10; i++) run(qiDeviation, adult({ path: 'sect', qi: 0 }, 'action.cultivate'), 'stop', i);
    const s = adult({ path: 'sect', qi: 100 }, 'action.cultivate');
    run(qiDeviation, s, 'stop');
    expect(s.cultivation.qi).toBe(0);
    run(qiDeviation, top, 'push', 0);
    expect(top.cultivation.qi).toBeLessThanOrEqual(QI_PEAK.qi1);
  });

  it('nhóm "Đường tiên" có 21 sự kiện (S1–S4: 10, S6: 11)', () => {
    expect(CULTIVATION_EVENTS).toHaveLength(21);
    expect(EVENTS.length).toBe(121);
  });
});
