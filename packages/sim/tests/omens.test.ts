// Dấu hiệu tiên duyên tuổi thơ, tỉ lệ linh căn 15% (v0.8 S7, ADR 0023).
import { birthplaceId, type LogEntry } from '@tsvl/shared';
import { t } from '@tsvl/content';
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/index';
import { createCharacter, type CharacterState } from '../src/life/character';
import { rootBand } from '../src/life/cultivation';
import { OMEN_AGES, OMEN_PPM, OMENS, omenYear } from '../src/life/omens';
import { SPIRIT_ROOT_PPM } from '../src/life/params';

const child = (seed: number): CharacterState => createCharacter({ birthTick: 0, birthplaceId: birthplaceId('r0/c0'), birthplaceKind: 'village', county: 0 }, Rng.fromSeed(seed), Rng.fromSeed(seed + 1));
/** Các dấu hiệu lộ ra cả tuổi thơ (đầu mỗi năm từ 0 tới 13 tuổi) của một đứa trẻ, seed đời `seed`. */
function omens(c: CharacterState, seed: number): LogEntry[] {
  const out: LogEntry[] = [];
  for (let age = 0; age <= 13; age++) {
    const tick = c.birthTick + age * 36;
    omenYear(c, seed, tick, (e) => out.push({ ...e, tick }));
  }
  return out;
}

describe('dấu hiệu tiên duyên (S7)', () => {
  it('khoảng 15% trẻ có linh căn, cùng một hàm cho người chơi và NPC', () => {
    expect(SPIRIT_ROOT_PPM).toBe(150_000);
    let rooted = 0;
    for (let i = 0; i < 4_000; i++) if (rootBand(child(i).spiritRoot) !== 'none') rooted++;
    expect(rooted / 4_000).toBeGreaterThan(0.13);
    expect(rooted / 4_000).toBeLessThan(0.17);
  });

  it('chỉ lộ ở tuổi 4–11; tất định theo seed đời; mỗi dấu hiệu có chữ', () => {
    const c = child(7);
    c.spiritRoot = { elements: ['wood'], purity: 90 };
    const a = omens(c, 42), b = omens(c, 42);
    expect(a).toEqual(b);
    for (const e of a) {
      const age = Number(e.params.age);
      expect(age).toBeGreaterThanOrEqual(OMEN_AGES[0]);
      expect(age).toBeLessThanOrEqual(OMEN_AGES[1]);
      expect(OMENS.map((o) => `log.omen.${o}`)).toContain(e.key);
    }
    for (const o of OMENS) expect(t(`log.omen.${o}`, { age: 6 })).toContain('6 tuổi');
  });

  it('linh căn càng tốt càng hay lộ; không có linh căn thì hiếm (trùng hợp), nên hai dấu hiệu trở lên đáng tin', () => {
    const c = child(1);
    const count = (root: CharacterState['spiritRoot']) => {
      c.spiritRoot = root;
      let n = 0, twice = 0;
      for (let seed = 0; seed < 2_000; seed++) { const k = omens(c, seed).length; n += k; if (k >= 2) twice++; }
      return { perChild: n / 2_000, twice: twice / 2_000 };
    };
    const none = count(null), mixed = count({ elements: ['metal', 'wood', 'water'], purity: 30 }), good = count({ elements: ['fire'], purity: 90 });
    const years = OMEN_AGES[1] - OMEN_AGES[0] + 1;
    expect(none.perChild).toBeCloseTo((years * OMEN_PPM.none) / 1e6, 1);
    expect(mixed.perChild).toBeGreaterThan(none.perChild * 5);
    expect(good.perChild).toBeGreaterThan(mixed.perChild);
    expect(none.twice).toBeLessThan(0.05);
    expect(mixed.twice).toBeGreaterThan(0.5);
  });
});
