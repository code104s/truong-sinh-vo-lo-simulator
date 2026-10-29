// v0.5 S4: quan hệ người chơi–NPC, thăm hỏi, nhờ cậy, phai theo năm, sự kiện đổi quan hệ — ADR 0017.
import { birthplaceId, regionId, type MonthPlan } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { describe, expect, it } from 'vitest';
import { Life, Rng } from '../src/index';
import { autoAdvance, lastChoice } from './auto';
import { choose, makeContext, newEventsState, type EventDef } from '../src/events/engine';
import { GIFT_BY_BACKGROUND } from '../src/economy/income';
import { validatePlan } from '../src/life/actions';
import { vLifeSnapshot } from '../src/life/validate';
import { bondOf, bondView } from '../src/social/bonds';
import { ASK_GRAIN, fadeBonds, socialAct, socialLock } from '../src/social/actions';
import { KIN_KEEP_GRAIN } from '../src/npc/family';

const region: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [0, 1].map((worldIndex) => ({ worldIndex, area: 100, seat: { x: worldIndex, y: 0 }, name: `Quận ${worldIndex}` })),
  settlementKind: ['village', 'town'], adjacency: [[0, 1]], terrainPct: [100], fertilityPct: [100, 100], seatKm: [[0, 60], [60, 0]],
};
const bp = { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village' as const, cell: { x: 0, y: 0 }, county: 0 };

/** Người chơi 20 tuổi, đã ra riêng, đủ tiền lương; một người lạ (không phải cha mẹ) cùng quận để xã giao. */
function adult(seed = 'social') {
  const s = Life.create({ worldSeed: seed, regionId: regionId('r0'), birthplaceId: bp.id }, bp, region).snapshot();
  s.character.birthTick = 0; s.tick = 20 * 36 + 1;
  Object.assign(s.character.household, { independent: true, money: 2_000, grain: 500 });
  s.character.health = s.character.healthMax = 1000; s.character.stamina = 900; s.character.conditions = [];
  s.events.once.push('event.coming_of_age');
  const kin = new Set([s.character.kin.father, s.character.kin.mother]);
  const other = s.npcs.people.find((n) => !n.death && n.character.location === 0 && n.character.household.independent && !kin.has(n.id))!;
  return { s, other };
}
const plan = (action: string, person: string): MonthPlan => ({ slots: [{ action, person }, { action, person }, { action, person }] });
/** RNG giả cho nhờ cậy: nhận lời khi xác suất từ một nửa trở lên — để test đọc thẳng công thức. */
const half = { chance: (ppm: number) => ppm >= 500_000 } as unknown as Rng;

describe('kế hoạch xã giao (v0.5 S4)', () => {
  it('xã giao cần một người; việc khác không nhắm vào ai', () => {
    expect(validatePlan(plan('action.visit', 'n3'), region)).toBe(true);
    expect(validatePlan({ slots: [{ action: 'action.visit' }, { action: 'action.rest' }, { action: 'action.rest' }] }, region)).toBe(false);
    expect(validatePlan({ slots: [{ action: 'action.farm', person: 'n3' }, { action: 'action.rest' }, { action: 'action.rest' }] }, region)).toBe(false);
  });

  it('thăm hỏi: quà vào túi người được thăm, thân thiết và tin cậy tăng; sổ cái giữ; lưu/tải giữ quan hệ', () => {
    const { s, other } = adult();
    const l = Life.restore(s, [], region);
    const total = l.totalMoney(), purse = other.character.household.money;
    expect(l.setPlan(plan('action.visit', other.id))).toBe(true);
    autoAdvance(l, 'week', lastChoice);
    const after = l.snapshot();
    expect(after.npcs.people.find((n) => n.id === other.id)!.character.household.money - purse).toBe(GIFT_BY_BACKGROUND[after.character.background]);
    expect(bondOf(after.bonds, other.id)).toMatchObject({ closeness: 10, trust: 3 });
    expect(l.log.some((e) => e.key === 'log.social.visit')).toBe(true);
    expect(l.totalMoney()).toBe(total);
    // Thăm năm lần thì thành bạn (10 → 50)
    for (let k = 0; k < 4; k++) autoAdvance(l, 'week', lastChoice);
    const snap = l.snapshot();
    expect(bondView(bondOf(snap.bonds, other.id)!).closeness).toBe('friend');
    expect(vLifeSnapshot.check(JSON.parse(JSON.stringify(snap)), '$')).toBeNull();
    expect(Life.restore(JSON.parse(JSON.stringify(snap)), [], region).snapshot().bonds).toEqual(snap.bonds);
  });

  it('người ấy ở quận khác hoặc đã mất: ô bị khóa, có cảnh báo; không thăm, không đổi quan hệ', () => {
    for (const away of ['moved', 'dead'] as const) {
      const { s, other } = adult(`away-${away}`);
      if (away === 'moved') other.character.location = 1;
      else other.death = { tick: 100, cause: 'old_age', detail: 'old_age.natural' };
      const l = Life.restore(s, [], region);
      l.setPlan(plan('action.visit', other.id));
      autoAdvance(l, 'week', lastChoice);
      expect(l.log.some((e) => e.key === 'log.plan.invalid' && e.params.reason === 'lock.person_away')).toBe(true);
      expect(l.log.some((e) => e.key === 'log.social.visit')).toBe(false);
      expect(bondOf(l.snapshot().bonds, other.id)).toBeNull();
    }
  });

  it('nhờ cậy: người lạ thì khóa; bạn có dư thì cho tối đa 4 tuần ăn từ phần trên một năm ăn, mình nợ ơn', () => {
    const { s, other } = adult('ask');
    const w = { npcs: s.npcs, bonds: s.bonds, rng: half };
    const slot = { action: 'action.ask_help', person: other.id };
    expect(socialLock(slot, s.character, w)).toBe('lock.stranger');
    s.bonds.push({ id: other.id, closeness: 60, trust: 40, hostility: 0, owed: 0 });
    s.bonds.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
    expect(socialLock(slot, s.character, w)).toBeNull();
    other.character.household.grain = KIN_KEEP_GRAIN + 100;
    const grain = s.character.household.grain, log: string[] = [];
    socialAct(slot, s.character, w, (e) => log.push(e.key));
    expect(s.character.household.grain - grain).toBe(ASK_GRAIN);
    expect(other.character.household.grain).toBe(KIN_KEEP_GRAIN + 100 - ASK_GRAIN);
    expect(bondOf(s.bonds, other.id)).toMatchObject({ closeness: 62, owed: -15 });
    // Lần hai: 62×6.000 + 40×4.000 − 15×5.000 = 457.000 < một nửa → bị từ chối; nợ ơn làm khó nhờ tiếp
    socialAct(slot, s.character, w, (e) => log.push(e.key));
    expect(log).toEqual(['log.social.helped_grain', 'log.social.refused']);
    expect(bondOf(s.bonds, other.id)!.closeness).toBe(60);
  });

  it('người ấy nhận lời mà không còn gì dư: không đổi kho, thân thiết giảm; nhờ được tiền khi hết lương dư', () => {
    const { s, other } = adult('cannot');
    s.bonds.push({ id: other.id, closeness: 100, trust: 100, hostility: 0, owed: 0 });
    const w = { npcs: s.npcs, bonds: s.bonds, rng: half };
    const slot = { action: 'action.ask_help', person: other.id };
    Object.assign(other.character.household, { grain: KIN_KEEP_GRAIN, money: 300 });
    const log: string[] = [];
    socialAct(slot, s.character, w, (e) => log.push(e.key));
    expect(other.character.household).toMatchObject({ grain: KIN_KEEP_GRAIN, money: 300 });
    other.character.household.money = 1_000;
    const money = s.character.household.money;
    socialAct(slot, s.character, w, (e) => log.push(e.key));
    expect(log).toEqual(['log.social.cannot_help', 'log.social.helped_money']);
    expect(s.character.household.money - money).toBe(200);
    expect(other.character.household.money).toBe(800);
  });
});

describe('quan hệ phai theo năm, sự kiện đổi quan hệ (v0.5 S4)', () => {
  it('đầu năm: thân thiết −5, tin cậy −3, thù hận −2; người thân không nhạt dưới 50; nợ ơn để lâu thì mất tin cậy', () => {
    const { s, other } = adult('fade');
    const mother = s.character.kin.mother!;
    s.bonds.push({ id: other.id, closeness: 30, trust: 40, hostility: 10, owed: -25 });
    s.bonds.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
    bondOf(s.bonds, mother)!.closeness = 52;
    fadeBonds(s.character, { npcs: s.npcs, bonds: s.bonds, rng: half });
    expect(bondOf(s.bonds, other.id)).toMatchObject({ closeness: 25, trust: 27, hostility: 8, owed: -25 });
    expect(bondOf(s.bonds, mother)!.closeness).toBe(50);
  });

  it('lựa chọn với người thật đổi quan hệ theo bảng `bonds`; người vô danh thì không', () => {
    const { s, other } = adult('events');
    const def: EventDef = {
      id: 'event.test', category: 'daily', weight: () => 0, cooldownTicks: 0,
      bonds: { fight: { hostility: 25, closeness: -5 } },
      choices: [{ id: 'fight', costs: ['health'], apply: () => ({ result: 'fight' }) }, { id: 'leave', costs: ['time'], apply: () => ({ result: 'leave' }) }],
    };
    for (const npcId of [other.id, null]) {
      const bonds: typeof s.bonds = [], events = newEventsState();
      events.pending = { instance: 1, eventId: def.id, tick: s.tick, variant: null, params: {}, figure: null, npcId };
      const ctx = makeContext(s.character, events, s.player, s.economy, region, s.tick, s.npcs, bonds);
      expect(choose(events, [def], ctx, 1, 'fight', Rng.fromSeed(1), () => {})).toBeNull();
      expect(bonds).toEqual(npcId ? [{ id: other.id, closeness: 0, trust: 0, hostility: 25, owed: 0 }] : []);
    }
  });
});

describe('khóa xã giao gửi kèm người trong quận (v0.5 F2)', () => {
  it('mỗi người trong quận có khóa của từng việc xã giao, đúng như khi ô chạy', () => {
    const { s, other } = adult('f2');
    const l = Life.restore(s, [], region);
    const view = l.people().find((p) => p.id === other.id)!;
    // v0.7 S1: học việc cũng nhắm vào một người
    expect(view.social!.map((o) => o.action)).toEqual(['action.visit', 'action.ask_help', 'action.propose', 'action.apprentice', 'action.join_guild']);
    for (const o of view.social!) expect(o.locked).toBe(l.socialLock({ action: o.action, person: other.id }));
    expect(view.social!.find((o) => o.action === 'action.ask_help')!.locked).toBe('lock.stranger');
    expect(view.social!.find((o) => o.action === 'action.visit')!.locked).toBeNull();
    // Người thân, người quen ở mọi quận không mang khóa (chỉ người trong quận)
    expect(l.circle().every((p) => p.social === undefined)).toBe(true);
    // Hồi quy (F2): việc xã giao không được gắn nhãn "Đổi nơi ở" (nhãn mặc định của việc không có kỹ năng)
    const gains = Object.fromEntries(l.actions().filter((a) => a.group === 'social').map((a) => [a.id, a.gains]));
    expect(gains).toEqual({ 'action.visit': ['gain.bond'], 'action.ask_help': ['gain.food', 'gain.money'], 'action.propose': ['gain.family'], 'action.apprentice': ['gain.career'], 'action.join_guild': ['gain.guild'] });
  });
});
