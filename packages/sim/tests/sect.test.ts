// v0.8 S3: tông môn tối giản — kỳ tuyển mỗi ba năm, trẻ NPC đỗ rời vùng, đệ tử ký danh, nghĩa vụ (ADR 0022 Q5).
import { birthplaceId, regionId, type LogEntry } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { describe, expect, it } from 'vitest';
import { Life } from '../src/index';
import { autoAdvance, lastChoice, pastComingOfAge } from './auto';
import {
  attendTrial, dutyLock, dutyYear, isTrialYear, SECT_AGE, SECT_DUTY_FEE, SECT_DUTY_WEEKS, SECT_STONES_JOIN, SECT_STONES_YEAR, sectOf, sectPhase, trialLock, trialOpen,
} from '../src/factions/sect';
import { countyMoney } from '../src/economy/market';
import { npcMoney } from '../src/npc/state';
import { factionMoney } from '../src/factions/state';
import type { SpiritRoot } from '../src/life/character';
import type { LifeSnapshot } from '../src/life/life';
import { vLifeSnapshot } from '../src/life/validate';

/** Quận 0 làng, quận 1 trấn (trị sở: nơi sứ giả xuống), kề nhau. */
const region: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [0, 1].map((worldIndex) => ({ worldIndex, area: 100, seat: { x: worldIndex, y: 0 }, name: `Quận ${worldIndex}` })),
  settlementKind: ['village', 'town'], adjacency: [[0, 1]], terrainPct: [100], fertilityPct: [100, 100], seatKm: [[0, 60], [60, 0]],
};
const bp = { id: birthplaceId('r0/c1'), name: 'Trấn', nameHan: '鎮', kind: 'town' as const, cell: { x: 1, y: 0 }, county: 1 };
/** Đầu tháng Ba năm thứ 18 (năm tuyển: 18 chia hết cho 3). */
const TRIAL = 17 * 36 + 2 * 3;
const GOOD: SpiritRoot = { elements: ['wood'], purity: 80 };
const FAIR: SpiritRoot = { elements: ['wood', 'fire'], purity: 50 };
const MIXED: SpiritRoot = { elements: ['wood', 'fire', 'earth'], purity: 30 };

/** Người chơi 15 tuổi đứng ở trị sở; mọi NPC không linh căn (để kiểm soát ai đỗ). */
function world(age = 15): LifeSnapshot {
  const s = Life.create({ worldSeed: 'tong-mon', regionId: regionId('r0'), birthplaceId: bp.id }, bp, region).snapshot();
  s.tick = TRIAL; s.character.birthTick = TRIAL - age * 36 - 5; s.character.location = 1;
  s.character.health = s.character.healthMax = 1000; s.character.stamina = 900; s.character.conditions = [];
  s.character.household = { ...s.character.household, money: 2_000 };
  for (const n of s.npcs.people) n.character.spiritRoot = null;
  return pastComingOfAge(s);
}
const money = (s: LifeSnapshot) => countyMoney(s.economy) + npcMoney(s.npcs) + factionMoney(s.factions) + s.character.household.money;
/** Một trẻ NPC chưa ra riêng (mỗi lần một người khác), đặt tuổi và linh căn. */
const picked = new WeakMap<LifeSnapshot, Set<string>>();
function kid(s: LifeSnapshot, age: number, root: SpiritRoot | null) {
  const used = picked.get(s) ?? new Set<string>(); picked.set(s, used);
  const n = s.npcs.people.find((x) => x.death === null && !x.character.household.independent && !used.has(x.id))!;
  used.add(n.id);
  n.character.birthTick = TRIAL - age * 36 - 3; n.character.spiritRoot = root; n.character.household.money = 7;
  return n;
}

describe('tông môn ngoài vùng (v0.8 S3)', () => {
  it('lập cùng quan phủ: không giữ quận, trị sở là nơi sứ giả xuống (thành, không thì trấn); tên theo vùng', () => {
    const f = sectOf(world().factions)!;
    expect(f).toMatchObject({ kind: 'sect', seat: 1, counties: [], holds: [], money: 0, name: { key: 'faction.sect.name' } });
    expect(f.name.params.name).toMatch(/^sect\.name\.[0-5]$/);
    expect(sectOf(world().factions)!.name).toEqual(f.name);
  });

  it('kỳ tuyển: năm chia hết cho 3, cả tháng Ba', () => {
    expect([15, 16, 17, 18, 21].map((y) => isTrialYear((y - 1) * 36))).toEqual([true, false, false, true, true]);
    expect([TRIAL - 1, TRIAL, TRIAL + 2, TRIAL + 3].map(trialOpen)).toEqual([false, true, true, false]);
  });

  it('trẻ NPC 8–20 tuổi chưa ra riêng có linh căn khá, tốt thì đỗ, rời vùng; của trong túi về cha mẹ; sổ cái giữ; kỳ ít người thì nhận cả tạp', () => {
    const s = world();
    const a = kid(s, 10, GOOD), b = kid(s, 12, MIXED), c = kid(s, 25, GOOD);
    const total = money(s), n0 = s.npcs.people.length;
    const log: LogEntry[] = [];
    // Chỉ một người khá, tốt (đứa 25 tuổi quá tuổi) → kỳ này nhận cả tạp
    expect(sectPhase(s.factions, s.npcs, s.economy, region, TRIAL, { c: s.character, log: (e) => log.push({ tick: TRIAL, ...e }) })).toBe(2);
    expect(s.npcs.people.some((x) => x.id === a.id || x.id === b.id)).toBe(false);
    expect(s.npcs.people.some((x) => x.id === c.id)).toBe(true);
    expect(s.npcs.people.length).toBe(n0 - 2);
    expect(sectOf(s.factions)!.trial).toEqual({ tick: TRIAL, takesMixed: true, taken: 2 });
    expect(money(s)).toBe(total);
    expect(log.map((e) => e.key)).toContain('log.sect.took');
    expect(SECT_AGE).toEqual([8, 20]);
  });

  it('tin đồn tháng Giêng năm tuyển; năm khác không có gì', () => {
    const s = world();
    const log: string[] = [];
    sectPhase(s.factions, s.npcs, s.economy, region, TRIAL - 2 * 3, { c: s.character, log: (e) => log.push(e.key) });
    sectPhase(s.factions, s.npcs, s.economy, region, TRIAL + 36 - 2 * 3, { c: s.character, log: (e) => log.push(e.key) });
    expect(log).toEqual(['log.sect.rumor']);
  });
});

describe('người chơi dự kỳ tuyển, đệ tử ký danh (v0.8 S3)', () => {
  const opened = (s: LifeSnapshot) => { sectPhase(s.factions, s.npcs, s.economy, region, TRIAL, null); return s; };

  it('khóa: không có kỳ tuyển, không đứng ở trị sở, quá 20 tuổi, đã có đường tu', () => {
    const s = world();
    expect(trialLock(s.character, s.cultivation, s.factions, TRIAL)).toBe('lock.no_trial');
    opened(s);
    expect(trialLock(s.character, s.cultivation, s.factions, TRIAL)).toBeNull();
    expect(trialLock(s.character, s.cultivation, s.factions, TRIAL + 3)).toBe('lock.no_trial');
    s.character.location = 0;
    expect(trialLock(s.character, s.cultivation, s.factions, TRIAL)).toBe('lock.no_trial');
    const old = opened(world(21));
    expect(trialLock(old.character, old.cultivation, old.factions, TRIAL)).toBe('lock.trial_age');
  });

  it('linh căn khá thì đỗ: đệ tử ký danh, ba khối linh thạch; tạp (kỳ đủ người) hay không có thì trượt, mang ám ảnh', () => {
    const ok = opened(world()); ok.character.spiritRoot = FAIR;
    const keys: string[] = [];
    expect(attendTrial(ok.character, ok.cultivation, ok.factions, TRIAL, ok.events.flags, (e) => keys.push(e.key))).toBe(true);
    expect(ok.cultivation).toMatchObject({ root: 'fair', path: 'sect', stones: SECT_STONES_JOIN, duty: { weeks: 0, missed: 0, since: TRIAL } });
    expect(trialLock(ok.character, ok.cultivation, ok.factions, TRIAL)).toBe('lock.member');
    // Kỳ đủ người khá, tốt (hai trẻ NPC) thì không nhận tạp
    const full = world(); kid(full, 9, GOOD); kid(full, 11, FAIR); opened(full); full.character.spiritRoot = MIXED;
    expect(attendTrial(full.character, full.cultivation, full.factions, TRIAL, full.events.flags, (e) => keys.push(e.key))).toBe(false);
    expect(full.cultivation).toMatchObject({ root: 'mixed', path: null });
    expect(full.events.flags).toContain('haunted');
    const none = opened(world());
    expect(attendTrial(none.character, none.cultivation, none.factions, TRIAL, none.events.flags, (e) => keys.push(e.key))).toBe(false);
    expect(keys).toEqual(['log.sect.joined', 'log.sect.rejected', 'log.sect.rejected_none']);
  });

  it('nghĩa vụ mỗi năm: đủ sáu tuần tạp dịch thì nhận linh thạch; thiếu thì nộp tiền thay vào kho tông môn; không nộp nổi hai năm thì bị gạch tên', () => {
    const s = opened(world()); s.character.spiritRoot = GOOD;
    attendTrial(s.character, s.cultivation, s.factions, TRIAL, s.events.flags, () => {});
    const year = (t: number) => { const keys: string[] = []; dutyYear(s.character, s.cultivation, s.factions, t, (e) => keys.push(e.key)); return keys; };
    // Năm mới vào: chưa xét
    expect(year(TRIAL + 30)).toEqual([]);
    s.cultivation.duty!.weeks = SECT_DUTY_WEEKS;
    expect(year(TRIAL + 36)).toEqual(['log.sect.stipend']);
    expect(s.cultivation.stones).toBe(SECT_STONES_JOIN + SECT_STONES_YEAR);
    const total = money(s), before = s.character.household.money;
    expect(year(TRIAL + 72)).toEqual(['log.sect.duty_paid', 'log.sect.stipend']);
    expect(before - s.character.household.money).toBe(SECT_DUTY_FEE);
    expect(sectOf(s.factions)!.money).toBe(SECT_DUTY_FEE);
    expect(money(s)).toBe(total);
    s.character.household.money = 0;
    expect(year(TRIAL + 108)).toEqual(['log.sect.duty_missed', 'log.sect.stipend']);
    expect(year(TRIAL + 144)).toEqual(['log.sect.expelled']);
    expect(s.cultivation).toMatchObject({ path: 'sect', duty: null });
    expect(dutyLock(s.cultivation)).toBe('lock.not_disciple');
  });

  it('chơi thật: đứng ở trị sở tháng Ba năm tuyển, xếp dự tuyển — đỗ, làm tạp dịch; lưu tải cùng digest', () => {
    const s = world(); s.character.spiritRoot = GOOD; s.tick = TRIAL - 3;
    s.plan = { slots: [0, 1, 2].map(() => ({ action: 'action.trial' })) as never };
    const l = Life.restore(s, [], region);
    for (let k = 0; k < 6; k++) autoAdvance(l, 'week', lastChoice);
    expect(l.snapshot().cultivation).toMatchObject({ root: 'good', path: 'sect' });
    expect(l.view().cultivation).toEqual({ realm: 'mortal', root: 'good', path: 'sect', qi: 'empty', duty: { weeks: 0, need: 6, missed: 0, expelAt: 2, fee: 600 } });
    expect(l.log.some((e) => e.key === 'log.sect.joined')).toBe(true);
    expect(l.actions().find((a) => a.id === 'action.sect_duty')!.locked).toBeNull();
    expect(l.setPlan({ slots: [0, 1, 2].map(() => ({ action: 'action.sect_duty' })) as never })).toBe(true);
    autoAdvance(l, 'month', lastChoice);
    expect(l.snapshot().cultivation.duty!.weeks).toBeGreaterThanOrEqual(1);
    expect(vLifeSnapshot.check(JSON.parse(JSON.stringify(l.snapshot())), '$')).toBeNull();
    const m = Life.restore(JSON.parse(JSON.stringify(l.snapshot())), [], region);
    for (let k = 0; k < 2; k++) { autoAdvance(l, 'year', lastChoice); autoAdvance(m, 'year', lastChoice); }
    expect(m.digest()).toBe(l.digest());
  });
});
