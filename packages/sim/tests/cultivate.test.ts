// v0.8 S5: tu luyện, đột phá vào Luyện Khí tầng 1 (ADR 0022 Q7–Q9).
import { birthplaceId, regionId, TICKS_PER_YEAR } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { describe, expect, it } from 'vitest';
import { Life, Rng } from '../src/index';
import { autoAdvance, lastChoice, pastComingOfAge } from './auto';
import { newCultivation, QI_PEAK, type CultivationState } from '../src/life/cultivation';
import { createCharacter, type CharacterState, type SpiritRoot } from '../src/life/character';
import { computeHealthMax } from '../src/life/health';
import { MERIDIAN_ILLNESS } from '../src/life/rogue';
import {
  BREAKTHROUGH_PPM_RANGE, BREAKTHROUGH_STONES, breakthrough, breakthroughLock, breakthroughPpm, cultivate, cultivateLock, FAIL_SHAKEN_TICKS, mindOf,
  QI1_LIFESPAN_TICKS, QI_BODY, qiPerSlot, SEVERE_LIFESPAN_TICKS, STONE_QI_PCT,
} from '../src/life/cultivate';
import type { LifeSnapshot } from '../src/life/life';
import { vLifeSnapshot } from '../src/life/validate';

/** Quận 0, 3 làng có núi (đường 0–3 qua núi), 1 làng đồng bằng, 2 thành. */
const region: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [20, 21, 22, 23].map((worldIndex, k) => ({ worldIndex, area: 100, seat: { x: k, y: 0 }, name: `Quận ${k}` })),
  settlementKind: ['village', 'village', 'city', 'village'], adjacency: [[0, 3], [0, 1], [1, 2]], terrainPct: [250, 100, 100], fertilityPct: [100, 100, 100, 100],
  seatKm: [0, 1, 2, 3].map((a) => [0, 1, 2, 3].map((b) => Math.abs(a - b) * 60)),
};
const PLAIN = 1;
const GOOD: SpiritRoot = { elements: ['wood'], purity: 80 };
const FAIR: SpiritRoot = { elements: ['wood', 'fire'], purity: 50 };
const MIXED: SpiritRoot = { elements: ['wood', 'fire', 'earth'], purity: 30 };
const T = 25 * TICKS_PER_YEAR + 4;

function person(root: SpiritRoot | null = FAIR, opts: { aptitude?: number; county?: number; personality?: string; age?: number } = {}): CharacterState {
  const c = createCharacter({ birthTick: 0, birthplaceId: birthplaceId('r0/c1'), birthplaceKind: 'village', county: PLAIN }, Rng.fromSeed(1), Rng.fromSeed(2));
  c.spiritRoot = root; c.aptitude = opts.aptitude ?? 5; c.location = opts.county ?? PLAIN; c.personality = opts.personality ?? 'kind';
  c.birthTick = T - (opts.age ?? 25) * TICKS_PER_YEAR; c.conditions = []; c.health = c.healthMax = 900; c.stamina = 900;
  c.household.hunger = 0;
  return c;
}
const disciple = (over: Partial<CultivationState> = {}): CultivationState => ({ ...newCultivation(), root: 'fair', path: 'sect', ...over });
const PEAK = QI_PEAK.qi1;

describe('tu luyện (v0.8 S5, Q7)', () => {
  it('khóa: chưa dẫn khí, đang thương kinh mạch, linh khí đầy (phàm nhân: phải đột phá; tầng 1: trần v0.8)', () => {
    const c = person();
    expect(cultivateLock(c, newCultivation())).toBe('lock.no_path');
    expect(cultivateLock(c, disciple())).toBeNull();
    expect(cultivateLock(c, disciple({ qi: PEAK }))).toBe('lock.qi_peak');
    expect(cultivateLock(c, disciple({ realm: 'qi1', qi: PEAK }))).toBe('lock.realm_cap');
    c.conditions.push({ id: MERIDIAN_ILLNESS, kind: 'illness', severity: 'serious', weeksLeft: 8 });
    expect(cultivateLock(c, disciple())).toBe('lock.meridian');
  });

  it('linh khí mỗi ô theo linh căn, ngộ tính, công pháp (tán tu 60%), nơi ở; linh căn khá ở làng tu một nửa số ô thì 3–6 năm tới đỉnh', () => {
    const at = (root: SpiritRoot, cult: CultivationState, o = {}) => qiPerSlot(person(root, o), cult, region, T);
    expect(at(GOOD, disciple())).toBeGreaterThan(at(FAIR, disciple()));
    expect(at(FAIR, disciple())).toBeGreaterThan(at(MIXED, disciple()));
    expect(at(FAIR, disciple(), { aptitude: 9 })).toBeGreaterThan(at(FAIR, disciple(), { aptitude: 2 }));
    expect(at(FAIR, disciple({ path: 'rogue' }))).toBe(Math.floor((at(FAIR, disciple()) * 60) / 100));
    expect(at(FAIR, disciple(), { county: 0 })).toBeGreaterThan(at(FAIR, disciple()));
    expect(at(FAIR, disciple(), { county: 2 })).toBeLessThan(at(FAIR, disciple()));
    expect(qiPerSlot(person(null), disciple(), region, T)).toBe(0);
    const years = PEAK / at(FAIR, disciple()) / (TICKS_PER_YEAR / 2);
    expect(years).toBeGreaterThanOrEqual(3);
    expect(years).toBeLessThanOrEqual(6);
  });

  it('tích tới đỉnh thì dừng, báo một lần; đốt linh thạch dư, giữ lại phần cho đột phá', () => {
    const c = person(), cult = disciple({ stones: BREAKTHROUGH_STONES + 2 }), keys: string[] = [];
    const base = qiPerSlot(c, cult, region, T);
    cultivate(c, cult, region, T, (e) => keys.push(e.key));
    expect(cult).toMatchObject({ qi: Math.floor((base * STONE_QI_PCT) / 100), stones: BREAKTHROUGH_STONES + 1 });
    cultivate(c, cult, region, T, () => {}); cultivate(c, cult, region, T, () => {});
    expect(cult.stones).toBe(BREAKTHROUGH_STONES);
    cult.qi = PEAK - 1;
    cultivate(c, cult, region, T, (e) => keys.push(e.key));
    expect(cult.qi).toBe(PEAK);
    cultivate(c, cult, region, T, (e) => keys.push(e.key));
    expect(cult.qi).toBe(PEAK);
    expect(keys).toEqual(['log.cultivate.peak']);
  });
});

describe('đột phá (v0.8 S5, Q8–Q9)', () => {
  it('tâm cảnh: tính cách, đói, bệnh, tang người thân; vừa hỏng thì chưa yên, một năm sau mới thử lại được', () => {
    const cult = disciple({ qi: PEAK });
    expect(mindOf(person(FAIR, { personality: 'calm' }), cult, T, false)).toBe('calm');
    expect(mindOf(person(), cult, T, false)).toBe('steady');
    expect(mindOf(person(FAIR, { personality: 'hot_tempered' }), cult, T, false)).toBe('troubled');
    expect(mindOf(person(), cult, T, true)).toBe('troubled');
    const hungry = person(); hungry.household.hunger = 2;
    expect(mindOf(hungry, cult, T, true)).toBe('shaken');
    const failed = disciple({ qi: PEAK, breakthroughs: [{ at: T - 10, ok: false }] });
    expect(breakthroughLock(person(FAIR, { personality: 'calm' }), failed, T, false)).toBe('lock.unsettled');
    expect(breakthroughLock(person(FAIR, { personality: 'calm' }), failed, T - 10 + FAIL_SHAKEN_TICKS, false)).toBeNull();
  });

  it('khóa: chưa dẫn khí, chưa đầy, đã vào tầng 1, đang thương kinh mạch', () => {
    const c = person();
    expect(breakthroughLock(c, newCultivation(), T, false)).toBe('lock.no_path');
    expect(breakthroughLock(c, disciple({ qi: PEAK - 1 }), T, false)).toBe('lock.qi_not_peak');
    expect(breakthroughLock(c, disciple({ qi: PEAK }), T, false)).toBeNull();
    expect(breakthroughLock(c, disciple({ realm: 'qi1', qi: PEAK }), T, false)).toBe('lock.realm_cap');
    c.conditions.push({ id: MERIDIAN_ILLNESS, kind: 'illness', severity: 'serious', weeksLeft: 8 });
    expect(breakthroughLock(c, disciple({ qi: PEAK }), T, false)).toBe('lock.meridian');
  });

  it('cơ hội: tâm cảnh, linh thạch cộng; tuổi từ 30, tán tu trừ; có sàn và trần', () => {
    const p = (o: Parameters<typeof person>[1] = {}, cult = disciple({ qi: PEAK })) => breakthroughPpm(person(FAIR, o), cult, T, false);
    expect(p({ personality: 'calm' })).toBeGreaterThan(p());
    expect(p()).toBeGreaterThan(p({ personality: 'greedy' }));
    expect(p({}, disciple({ qi: PEAK, stones: 3 }))).toBeGreaterThan(p());
    expect(p({}, disciple({ qi: PEAK, stones: 9 }))).toBe(p({}, disciple({ qi: PEAK, stones: 3 })));
    expect(p({ age: 30 })).toBe(p());
    expect(p({ age: 40 })).toBeLessThan(p());
    expect(p({}, disciple({ qi: PEAK, path: 'rogue' }))).toBeLessThan(p());
    expect(p({ age: 80, personality: 'greedy' }, disciple({ qi: PEAK, path: 'rogue' }))).toBe(BREAKTHROUGH_PPM_RANGE[0]);
  });

  it('thành: vào tầng 1, linh khí về 0, thọ +5 năm, thân thể đổi (sức khỏe tối đa cao hơn); tu tiếp tới đỉnh tầng 1 rồi dừng', () => {
    const c = person(GOOD, { personality: 'calm' }), r = Rng.fromSeed(1);
    let cult = disciple(), before = 0, out = null as string | null;
    for (let i = 0; out !== 'ok' && i < 50; i++) {
      cult = disciple({ root: 'good', qi: PEAK, stones: 5 }); c.conditions = []; before = c.lifespanBonus;
      out = breakthrough(c, cult, T, false, r, () => {});
    }
    expect(out).toBe('ok');
    expect(cult).toMatchObject({ realm: 'qi1', entered: T, qi: 0, stones: 2 });
    expect(cult.breakthroughs).toEqual([{ at: T, ok: true }]);
    expect(c.lifespanBonus - before).toBe(QI1_LIFESPAN_TICKS);
    expect(c.traits).toContain(QI_BODY);
    const plain = person(GOOD); plain.lifespanBonus = c.lifespanBonus;
    expect(c.healthMax).toBeGreaterThan(computeHealthMax(plain, T));
    expect(breakthroughLock(c, { ...cult, qi: PEAK }, T, false)).toBe('lock.realm_cap');
    cult.qi = PEAK - 1; cultivate(c, cult, region, T, () => {});
    expect([cult.qi, cultivateLock(c, cult)]).toEqual([PEAK, 'lock.realm_cap']);
  });

  it('hỏng: thương kinh mạch, linh khí còn nửa, linh thạch mất, tâm cảnh tụt; hỏng nặng thì tổn thọ ba năm', () => {
    const r = Rng.fromSeed(7);
    let seen = { failed: 0, severe: 0 };
    for (let i = 0; i < 2_000; i++) {
      const c = person(MIXED, { age: 60, personality: 'greedy' }), cult = disciple({ path: 'rogue', qi: PEAK, stones: 2 });
      const span = c.lifespanBonus;
      const out = breakthrough(c, cult, T, false, r, () => {});
      if (out === 'ok') continue;
      seen = { ...seen, [out!]: seen[out as 'failed' | 'severe'] + 1 };
      expect(cult).toMatchObject({ realm: 'mortal', qi: PEAK / 2, stones: 0 });
      expect(c.conditions[0]!.id).toBe(MERIDIAN_ILLNESS);
      expect(breakthroughLock(c, { ...cult, qi: PEAK }, T, false)).not.toBeNull();
      expect(c.lifespanBonus).toBe(out === 'severe' ? span - SEVERE_LIFESPAN_TICKS : span);
    }
    expect(seen.severe / (seen.failed + seen.severe)).toBeGreaterThan(0.06);
    expect(seen.severe / (seen.failed + seen.severe)).toBeLessThan(0.14);
  });

  it('lần đầu hỏng 30–60% với người 25 tuổi tính bình thường, mang ba khối linh thạch, cả hai đường; tán tu hỏng nhiều hơn', () => {
    const failRate = (path: 'sect' | 'rogue', stones: number) => {
      const r = Rng.fromSeed(31); let fail = 0;
      for (let i = 0; i < 4_000; i++) if (breakthrough(person(), disciple({ path, qi: PEAK, stones }), T, false, r, () => {}) !== 'ok') fail++;
      return fail / 4_000;
    };
    const sect = failRate('sect', 3), rogue = failRate('rogue', 0);
    expect(sect).toBeGreaterThan(0.3); expect(sect).toBeLessThan(0.6);
    expect(rogue).toBeGreaterThan(sect); expect(rogue).toBeLessThan(0.6);
  });

  it('thân thể tầng 1 không bao giờ có lúc sinh', () => {
    const r = Rng.fromSeed(3), names = Rng.fromSeed(4);
    for (let i = 0; i < 5_000; i++) expect(createCharacter({ birthTick: 0, birthplaceId: birthplaceId('r0/c1'), birthplaceKind: 'village', county: PLAIN }, r, names).traits).not.toContain(QI_BODY);
  });
});

describe('chơi thật (v0.8 S5)', () => {
  const bp = { id: birthplaceId('r0/c1'), name: 'Làng', nameHan: '村', kind: 'village' as const, cell: { x: 1, y: 0 }, county: PLAIN };
  function life(cult: Partial<CultivationState>, plan: string): Life {
    const s: LifeSnapshot = Life.create({ worldSeed: 'tu-luyen', regionId: regionId('r0'), birthplaceId: bp.id }, bp, region).snapshot();
    s.character.birthTick = 0; s.tick = 20 * TICKS_PER_YEAR + 4; s.character.location = PLAIN;
    s.character.household = { ...s.character.household, independent: true, money: 3_000, grain: 600 };
    s.character.health = s.character.healthMax = 1000; s.character.stamina = 900; s.character.conditions = [];
    s.character.spiritRoot = GOOD; s.character.aptitude = 8; s.character.personality = 'calm';
    s.cultivation = { ...newCultivation(), root: 'good', path: 'rogue', ...cult };
    s.plan = { slots: [0, 1, 2].map(() => ({ action: plan })) as never };
    return Life.restore(pastComingOfAge(s), [], region);
  }

  it('xếp tu luyện: linh khí tăng dần, dải hiện ở view', () => {
    const l = life({}, 'action.cultivate');
    expect(l.actions().find((a) => a.id === 'action.cultivate')).toMatchObject({ locked: null, gains: ['gain.qi'] });
    expect(l.actions().find((a) => a.id === 'action.breakthrough')!.locked).toBe('lock.qi_not_peak');
    autoAdvance(l, 'year', lastChoice);
    expect(l.snapshot().cultivation.qi).toBeGreaterThan(0);
    expect(l.view().cultivation.qi).not.toBe('empty');
  });

  it('đầy thì đột phá: có kết quả, ghi vào đường tu và tổng kết; lưu tải cùng digest', () => {
    const l = life({ qi: PEAK, stones: 3 }, 'action.breakthrough');
    expect(l.actions().find((a) => a.id === 'action.breakthrough')!.locked).toBeNull();
    autoAdvance(l, 'month', lastChoice);
    const cult = l.snapshot().cultivation;
    expect(cult.breakthroughs).toHaveLength(1);
    expect(l.log.some((e) => e.key.startsWith('log.breakthrough.'))).toBe(true);
    expect(cult.realm).toBe(cult.breakthroughs[0]!.ok ? 'qi1' : 'mortal');
    expect(vLifeSnapshot.check(JSON.parse(JSON.stringify(l.snapshot())), '$')).toBeNull();
    const m = Life.restore(JSON.parse(JSON.stringify(l.snapshot())), [], region);
    for (let k = 0; k < 2; k++) { autoAdvance(l, 'year', lastChoice); autoAdvance(m, 'year', lastChoice); }
    expect(m.digest()).toBe(l.digest());
  });
});
