// v0.8 S4: tán tu — công pháp thô (tàn quyển, tu sĩ chỉ điểm), tự dẫn khí, thương kinh mạch (ADR 0022 Q6).
import { birthplaceId, regionId } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { describe, expect, it } from 'vitest';
import { Life, Rng } from '../src/index';
import { autoAdvance, lastChoice, pastComingOfAge } from './auto';
import { newCultivation, QI_PLACE_PCT, qiPlacePct, sitesOf, TECHNIQUE_PCT } from '../src/life/cultivation';
import { createCharacter, type CharacterState, type SpiritRoot } from '../src/life/character';
import { consequencesPhase, pickIllness } from '../src/life/health';
import { CRUDE_MANUAL, induce, induceLock, inducePpm, INDUCE_MAX_PPM, MANUAL_LITERACY_XP, MERIDIAN_ILLNESS } from '../src/life/rogue';
import { dutyLock, dutyYear } from '../src/factions/sect';
import { choose, makeContext, type EventDef } from '../src/events/engine';
import { cultivatorTeach, ruinScroll, TEACH_FEE, TEACH_WEEKS } from '../src/events/defs/cultivation';
import { EVENTS } from '../src/events/catalog';
import { countyMoney } from '../src/economy/market';
import type { LifeSnapshot } from '../src/life/life';
import { vLifeSnapshot } from '../src/life/validate';

/** 6 quận, đường 0–1 qua núi (quận 0, 1 có núi), quận 5 là thành: đủ để có di tích. */
const wide: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [10, 11, 12, 13, 14, 15].map((worldIndex, k) => ({ worldIndex, area: 100, seat: { x: k, y: 0 }, name: `Quận ${k}` })),
  settlementKind: ['village', 'village', 'village', 'town', 'village', 'city'],
  adjacency: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]], terrainPct: [250, 100, 100, 100, 100], fertilityPct: [100, 100, 100, 100, 100, 100],
  seatKm: [0, 1, 2, 3, 4, 5].map((a) => [0, 1, 2, 3, 4, 5].map((b) => Math.abs(a - b) * 60)),
};
const bp = { id: birthplaceId('r0/c0'), name: 'Làng núi', nameHan: '村', kind: 'village' as const, cell: { x: 0, y: 0 }, county: 0 };
const GOOD: SpiritRoot = { elements: ['wood'], purity: 80 };
const FAIR: SpiritRoot = { elements: ['wood', 'fire'], purity: 50 };
const MIXED: SpiritRoot = { elements: ['wood', 'fire', 'earth'], purity: 30 };
const ruin = () => sitesOf(wide).ruins[0]!;
/** Quận làng không núi, không di tích (linh khí 100%). */
const PLAIN = 2;

function adult(county: number, flags: string[], root: SpiritRoot | null, seek = true): LifeSnapshot {
  const s = Life.create({ worldSeed: 'tan-tu', regionId: regionId('r0'), birthplaceId: bp.id }, bp, wide).snapshot();
  s.character.birthTick = 0; s.tick = 20 * 36 + 4; s.character.location = county;
  s.character.household = { ...s.character.household, independent: true, money: 3_000, grain: 300 };
  s.character.health = s.character.healthMax = 1000; s.character.stamina = 900; s.character.conditions = [];
  s.character.spiritRoot = root; s.character.luck = 5; s.character.aptitude = 5;
  s.plan = { slots: [0, 1, 2].map(() => ({ action: seek ? 'action.seek' : 'action.rest' })) as never };
  s.events.flags = [...flags];
  return pastComingOfAge(s);
}
const ctxOf = (s: LifeSnapshot) => makeContext(s.character, s.events, s, s.economy, wide, s.tick, s.npcs, s.bonds, s.reputation, s.factions);
const run = (ev: EventDef, s: LifeSnapshot, choice: string) => {
  s.events.pending = { instance: 0, eventId: ev.id, tick: s.tick, variant: null, params: ev.params?.(ctxOf(s)) ?? {}, figure: null, npcId: null };
  const log: string[] = [];
  expect(choose(s.events, EVENTS, ctxOf(s), 0, choice, Rng.fromSeed(3), (e) => log.push(e.key))).toBeNull();
  return log.at(-1)!;
};
const choiceLock = (ev: EventDef, s: LifeSnapshot, id: string) => ev.choices.find((c) => c.id === id)!.available?.(ctxOf(s)) ?? null;

/** Người trưởng thành dựng tay để rút nhiều lần. */
function person(root: SpiritRoot | null, aptitude = 5, county = PLAIN): CharacterState {
  const c = createCharacter({ birthTick: 0, birthplaceId: birthplaceId('r0/c0'), birthplaceKind: 'village', county }, Rng.fromSeed(1), Rng.fromSeed(2));
  c.spiritRoot = root; c.aptitude = aptitude; c.location = county; c.conditions = [];
  c.health = c.healthMax = 1000; c.stamina = 900;
  return c;
}
const T = 20 * 36 + 4;

describe('công pháp thô (v0.8 S4)', () => {
  it('tàn quyển: chỉ khi đã vào hang, đang tìm cơ duyên ở di tích, chưa có đường tu; đọc cần chữ từ mức "Thạo"', () => {
    expect(ruinScroll.weight(ctxOf(adult(ruin(), [], GOOD)))).toBe(0);
    expect(ruinScroll.weight(ctxOf(adult(PLAIN, ['found_ruin'], GOOD)))).toBe(0);
    const s = adult(ruin(), ['found_ruin'], GOOD);
    expect(ruinScroll.weight(ctxOf(s))).toBeGreaterThan(0);
    s.character.skillXp.literacy = MANUAL_LITERACY_XP - 1;
    expect(choiceLock(ruinScroll, s, 'read')).toBe('lock.literacy');
    s.character.skillXp.literacy = MANUAL_LITERACY_XP;
    expect(choiceLock(ruinScroll, s, 'read')).toBeNull();
    expect(run(ruinScroll, s, 'read')).toBe('event.ruin_scroll.result.read');
    expect(s.events.flags).toContain(CRUDE_MANUAL);
    expect(ruinScroll.weight(ctxOf(s))).toBe(0);
    // Đệ tử tông môn không cần tàn quyển
    const disciple = adult(ruin(), ['found_ruin'], GOOD); disciple.cultivation = { ...newCultivation(), path: 'sect' };
    expect(ruinScroll.weight(ctxOf(disciple))).toBe(0);
  });

  it('tu sĩ chỉ điểm: đã được người ấy xem là có linh căn, trung tuần; trả tiền (vào quỹ quận) hay theo làm việc bốn tuần', () => {
    const at = (root: 'none' | 'fair' | null, tenDay: number) => {
      const s = adult(PLAIN, ['met_cultivator'], FAIR, false); s.tick = 20 * 36 + tenDay; s.cultivation = { ...newCultivation(), root };
      return cultivatorTeach.weight(ctxOf(s));
    };
    expect([at('fair', 0), at('fair', 1), at('fair', 2), at(null, 1), at('none', 1)].map((w) => w > 0)).toEqual([false, true, false, false, false]);
    const paid = adult(PLAIN, ['met_cultivator'], FAIR, false); paid.tick = 20 * 36 + 1; paid.cultivation = { ...newCultivation(), root: 'fair' };
    const total = countyMoney(paid.economy) + paid.character.household.money;
    expect(run(cultivatorTeach, paid, 'pay')).toBe('event.cultivator_teach.result.pay');
    expect(countyMoney(paid.economy) + paid.character.household.money).toBe(total);
    expect(paid.character.household.money).toBe(3_000 - TEACH_FEE);
    expect(paid.events.flags).toContain(CRUDE_MANUAL);
    const poor = adult(PLAIN, ['met_cultivator'], FAIR, false); poor.character.household.money = TEACH_FEE - 1;
    expect(choiceLock(cultivatorTeach, poor, 'pay')).toBe('lock.money');
    const served = adult(PLAIN, ['met_cultivator'], FAIR, false); served.tick = 20 * 36 + 1; served.cultivation = { ...newCultivation(), root: 'fair' };
    expect(run(cultivatorTeach, served, 'serve')).toBe('event.cultivator_teach.result.serve');
    expect(served.active).toMatchObject({ slot: { action: 'action.toil' }, total: TEACH_WEEKS });
    expect(served.events.flags).toContain(CRUDE_MANUAL);
  });
});

describe('tự dẫn khí (v0.8 S4)', () => {
  it('khóa: chưa có công pháp, đã có đường tu, đã biết không có linh căn, đang thương kinh mạch', () => {
    const c = person(FAIR), cult = newCultivation();
    expect(induceLock(c, cult, [])).toBe('lock.no_manual');
    expect(induceLock(c, cult, [CRUDE_MANUAL])).toBeNull();
    expect(induceLock(c, { ...cult, path: 'sect' }, [CRUDE_MANUAL])).toBe('lock.has_path');
    expect(induceLock(c, { ...cult, root: 'none' }, [CRUDE_MANUAL])).toBe('lock.no_root');
    c.conditions.push({ id: MERIDIAN_ILLNESS, kind: 'illness', severity: 'serious', weeksLeft: 8 });
    expect(induceLock(c, cult, [CRUDE_MANUAL])).toBe('lock.meridian');
  });

  it('người không có linh căn: lần đầu đã biết ra "không có", mang ám ảnh, không bao giờ dẫn được khí', () => {
    const c = person(null), cult = newCultivation(), flags = [CRUDE_MANUAL];
    const keys: string[] = [];
    expect(inducePpm(c, wide, T)).toBe(0);
    expect(induce(c, cult, flags, wide, T, Rng.fromSeed(1), (e) => keys.push(e.key))).toBe('no_root');
    expect(cult).toMatchObject({ root: 'none', path: null });
    expect(flags).toContain('haunted');
    expect(induceLock(c, cult, flags)).toBe('lock.no_root');
    const r = Rng.fromSeed(2);
    for (let i = 0; i < 500; i++) expect(induce(c, cult, flags, wide, T, r, () => {})).toBe('no_root');
    expect(keys).toEqual(['log.rogue.no_root']);
  });

  it('cơ hội mỗi ô theo linh căn, linh khí nơi ở, ngộ tính; có trần', () => {
    expect(inducePpm(person(GOOD), wide, T)).toBeGreaterThan(inducePpm(person(FAIR), wide, T));
    expect(inducePpm(person(FAIR), wide, T)).toBeGreaterThan(inducePpm(person(MIXED), wide, T));
    expect(inducePpm(person(FAIR, 9), wide, T)).toBeGreaterThan(inducePpm(person(FAIR, 2), wide, T));
    const place = (k: number) => inducePpm(person(FAIR, 5, k), wide, T);
    expect(qiPlacePct(wide, ruin())).toBe(QI_PLACE_PCT.ruin);
    expect(place(ruin())).toBeGreaterThan(place(PLAIN));
    expect(place(PLAIN)).toBeGreaterThan(place(5)); // thành 80%
    expect(inducePpm(person(GOOD, 10, ruin()), wide, T)).toBeLessThanOrEqual(INDUCE_MAX_PPM);
  });

  it('thành thì là tán tu: không linh thạch, không nghĩa vụ; tông môn không có quyền gì với người ấy', () => {
    const c = person(GOOD, 10, ruin()), cult = newCultivation(), r = Rng.fromSeed(5);
    let out = '';
    for (let i = 0; i < 200 && out !== 'induced'; i++) { out = induce(c, cult, [CRUDE_MANUAL], wide, T, r, () => {}); c.conditions = []; }
    expect(out).toBe('induced');
    expect(cult).toMatchObject({ root: 'good', path: 'rogue', stones: 0, duty: null, realm: 'mortal' });
    expect(dutyLock(cult)).toBe('lock.not_disciple');
    const s = adult(PLAIN, [], GOOD), before = s.character.household.money, keys: string[] = [];
    dutyYear(s.character, cult, s.factions, T + 72, (e) => keys.push(e.key));
    expect([keys, s.character.household.money, cult.stones]).toEqual([[], before, 0]);
    expect(TECHNIQUE_PCT.rogue).toBeLessThan(TECHNIQUE_PCT.sect);
  });

  it('hỏng thì mất ô; một phần là thương kinh mạch: bệnh dài, để lại di chứng giảm sức khỏe tối đa', () => {
    const c = person(MIXED), cult = newCultivation(), r = Rng.fromSeed(11);
    let hurt = 0, failed = 0;
    for (let i = 0; i < 400; i++) {
      const out = induce(c, cult, [CRUDE_MANUAL], wide, T, r, () => {});
      if (out === 'meridian') hurt++; else if (out === 'failed') failed++;
      cult.path = null; // rút tiếp để đếm tỉ lệ
      c.conditions = [];
    }
    expect(hurt).toBeGreaterThan(0);
    expect(failed).toBeGreaterThan(hurt);
    // Diễn tiến như bệnh thường: hết bệnh thì sức khỏe tối đa giảm
    const p = person(FAIR); const cp = newCultivation(); const rr = Rng.fromSeed(3);
    while (!p.conditions.length) { if (induce(p, cp, [CRUDE_MANUAL], wide, T, rr, () => {}) === 'induced') { cp.path = null; } }
    expect(p.conditions[0]).toMatchObject({ id: MERIDIAN_ILLNESS, kind: 'illness', severity: 'serious' });
    expect(p.conditions[0]!.weeksLeft).toBeGreaterThanOrEqual(8);
    const max = p.healthMax, health = Rng.fromSeed(4);
    for (let t = T; p.conditions.length; t++) expect(consequencesPhase(p, t, health, () => {})).toBeNull();
    expect(p.scars).toBeGreaterThan(0);
    expect(p.healthMax).toBeLessThan(max);
  });

  it('thương kinh mạch không bao giờ đến như bệnh thường', () => {
    const c = person(null), r = Rng.fromSeed(8);
    for (let i = 0; i < 20_000; i++) expect(pickIllness(c, T + (i % 36), r).id).not.toBe('meridian');
  });

  it('khó hơn đường tông môn: 2.000 người có linh căn khá, ngộ tính 1–10, ở làng — tốn nhiều ô, một phần bị thương kinh mạch', () => {
    const r = Rng.fromSeed(21), apt = Rng.fromSeed(22);
    let slots = 0, hurt = 0, never = 0;
    for (let i = 0; i < 2_000; i++) {
      const c = person(FAIR, apt.int(1, 10)), cult = newCultivation();
      let k = 0;
      for (; k < 108 && cult.path === null; k++) { if (induce(c, cult, [CRUDE_MANUAL], wide, T, r, () => {}) === 'meridian') hurt++; c.conditions = []; }
      if (cult.path === null) never++;
      slots += k;
    }
    // Đệ tử ký danh được dẫn khí ngay khi đỗ (S3); tán tu trung bình tốn vài ô, trung bình mỗi người nửa lần thương kinh mạch
    expect(slots / 2_000).toBeGreaterThan(3);
    expect(slots / 2_000).toBeLessThan(12);
    expect(hurt / 2_000).toBeGreaterThan(0.3);
    expect(hurt / 2_000).toBeLessThan(1.5);
    expect(never).toBeLessThan(20);
  });
});

describe('chơi thật (v0.8 S4)', () => {
  it('có công pháp, xếp tự dẫn khí: thành tán tu, hiện ở view; lưu tải cùng digest', () => {
    const s = adult(ruin(), [CRUDE_MANUAL], GOOD, false);
    s.character.aptitude = 10;
    const l = Life.restore(s, [], wide);
    expect(l.actions().find((a) => a.id === 'action.induce')).toMatchObject({ locked: null, group: 'seek', gains: ['gain.induce'] });
    expect(l.setPlan({ slots: [0, 1, 2].map(() => ({ action: 'action.induce' })) as never })).toBe(true);
    for (let k = 0; k < 24 && l.snapshot().cultivation.path === null; k++) autoAdvance(l, 'month', lastChoice);
    expect(l.view().cultivation).toMatchObject({ root: 'good', path: 'rogue', realm: 'mortal', qi: 'empty' });
    expect(l.log.some((e) => e.key === 'log.rogue.induced')).toBe(true);
    expect(l.actions().find((a) => a.id === 'action.induce')!.locked).toBe('lock.has_path');
    expect(vLifeSnapshot.check(JSON.parse(JSON.stringify(l.snapshot())), '$')).toBeNull();
    const m = Life.restore(JSON.parse(JSON.stringify(l.snapshot())), [], wide);
    for (let k = 0; k < 2; k++) { autoAdvance(l, 'year', lastChoice); autoAdvance(m, 'year', lastChoice); }
    expect(m.digest()).toBe(l.digest());
  });

  it('chưa có công pháp thì việc tự dẫn khí khóa', () => {
    const l = Life.restore(adult(PLAIN, [], GOOD, false), [], wide);
    expect(l.actions().find((a) => a.id === 'action.induce')!.locked).toBe('lock.no_manual');
  });
});
