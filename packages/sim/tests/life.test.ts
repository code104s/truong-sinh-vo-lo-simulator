import { HIDDEN_CHARACTER_KEYS, TICKS_PER_YEAR, birthplaceId, regionId, vCharacterView, type Birthplace, type NewLifeConfig, type SettlementKind } from '@tsvl/shared';
import { describe, expect, it } from 'vitest';
import { Life, lifeRoot } from '../src/index';
import { autoAdvance } from './auto';

const bp = (n: number, kind: SettlementKind = 'village'): Birthplace => ({ id: birthplaceId(`r0/c${n}`), name: 'Phố Kỳ', nameHan: '浦岐', kind, cell: { x: 1, y: 1 }, county: 0 });
const cfg = (seed: string, n: number, lifeSeed?: number): NewLifeConfig => ({
  worldSeed: seed, regionId: regionId('r0'), birthplaceId: birthplaceId(`r0/c${n}`), ...(lifeSeed === undefined ? {} : { lifeSeed }),
});
const life = (seed: string, n = 1, lifeSeed?: number, kind: SettlementKind = 'village') => Life.create(cfg(seed, n, lifeSeed), bp(n, kind));

describe('tạo nhân vật', () => {
  it('cùng cấu hình cùng nhân vật; khác lifeSeed khác nhân vật', () => {
    expect(life('tsvl-01').snapshot()).toEqual(life('tsvl-01').snapshot());
    expect(life('tsvl-01', 1, 5).snapshot().character).not.toEqual(life('tsvl-01', 1, 6).snapshot().character);
  });

  it('lifeSeed mặc định suy ra từ worldSeed + nơi sinh', () => {
    expect(lifeRoot(cfg('a', 1))).toBe(lifeRoot(cfg('a', 1)));
    expect(lifeRoot(cfg('a', 1))).not.toBe(lifeRoot(cfg('a', 2)));
    expect(lifeRoot(cfg('a', 1))).not.toBe(lifeRoot(cfg('b', 1)));
  });

  it('view đúng hợp đồng và không lộ trường ẩn', () => {
    for (let i = 0; i < 50; i++) {
      const l = life('view', 1, i);
      const v = l.view();
      expect(vCharacterView.check(v, '$view')).toBeNull();
      for (const k of HIDDEN_CHARACTER_KEYS) expect(k in v).toBe(false);
      expect(JSON.stringify(v)).not.toMatch(/metal|wood|water|fire|earth|longevity_mark/);
    }
  });

  it('thuộc tính phân bố hợp lý trên 2000 nhân vật', () => {
    const kinds: Record<string, number> = {};
    let roots = 0;
    let girls = 0;
    for (let i = 0; i < 2000; i++) {
      const c = life('dist', 1, i).character;
      kinds[c.background] = (kinds[c.background] ?? 0) + 1;
      if (c.spiritRoot) roots++;
      if (c.gender === 'female') girls++;
      expect(c.constitution).toBeGreaterThanOrEqual(1);
      expect(c.constitution).toBeLessThanOrEqual(10);
      expect(c.lifespanBase).toBeGreaterThanOrEqual(45 * TICKS_PER_YEAR);
      expect(c.lifespanBase).toBeLessThan(96 * TICKS_PER_YEAR);
      expect(c.traits.includes('hardy') && c.traits.includes('sickly')).toBe(false);
    }
    expect(roots).toBeGreaterThan(50); // ~5%
    expect(roots).toBeLessThan(160);
    expect(Math.abs(girls - 1000)).toBeLessThan(120);
    expect(Object.keys(kinds).sort()).toEqual(['comfortable', 'commoner', 'destitute', 'wealthy']);
  });
});

describe('vòng tick và tua', () => {
  it('tua dừng ở ranh giới lịch hoặc sớm hơn khi có biến', () => {
    const l = life('tua', 1, 1);
    for (let k = 0; k < 200 && l.alive; k++) {
      const mode = (['week', 'month', 'year'] as const)[k % 3];
      const before = l.tick;
      const target = l.targetOf(mode);
      const res = autoAdvance(l, mode);
      if (res.status === 'done') expect(l.tick).toBe(target);
      else expect(l.tick).toBeLessThanOrEqual(target);
      expect(l.tick).toBeGreaterThan(before);
      if (mode === 'month' && res.status === 'done') expect(l.tick % 3).toBe(0);
      if (mode === 'year' && res.status === 'done') expect(l.tick % 36).toBe(0);
      if (res.status === 'interrupted') expect(res.entry.importance).toBe('major');
    }
  });

  it('untilEvent dừng ở mục quan trọng và chỉ ở đó', () => {
    const l = life('until', 1, 2);
    for (let k = 0; k < 30 && l.alive; k++) {
      const res = autoAdvance(l, 'untilEvent');
      expect(['interrupted', 'died', 'event']).toContain(res.status);
      if (res.status === 'event') continue; // sự kiện có lựa chọn cũng là chỗ dừng (ADR 0014)
      const majors = res.entries.filter((e) => e.importance === 'major');
      expect(majors.length).toBeGreaterThan(0);
      // Mọi mục quan trọng thuộc tick cuối cùng đã chạy
      for (const m of majors) expect(m.tick).toBe(l.tick - 1);
    }
  });

  it('chết thì dừng, không tua tiếp được', () => {
    const l = life('die', 1, 3);
    l.runToDeath();
    expect(l.alive).toBe(false);
    expect(() => l.advance('week')).toThrow();
    const s = l.summary();
    expect(s.ageYears).toBeGreaterThanOrEqual(0);
    expect(l.log.at(-1)!.key).toBe('log.death');
    expect(s.milestones.every((e) => e.importance === 'major')).toBe(true);
  });
});

describe('tất định và lưu/tải (nghiệm thu Sim)', () => {
  const seeds = Array.from({ length: 10 }, (_, i) => `seed-${i}`);

  it('10 seed × 2 lần chạy cho cùng digest', () => {
    for (const s of seeds) {
      const a = life(s), b = life(s);
      a.runToDeath();
      b.runToDeath();
      expect(a.digest()).toBe(b.digest());
      expect(a.log).toEqual(b.log);
    }
  });

  it('lưu giữa đời → tải → chạy tiếp cho cùng digest với chạy liền mạch', () => {
    for (const s of seeds) {
      const whole = life(s);
      whole.runToDeath();
      const half = life(s);
      const mid = half.character.birthTick + Math.floor((whole.death!.tick - half.character.birthTick) / 2);
      while (half.alive && half.tick < mid) autoAdvance(half, 'week');
      const restored = Life.restore(JSON.parse(JSON.stringify(half.snapshot())), JSON.parse(JSON.stringify(half.log)));
      expect(restored.digest()).toBe(half.digest());
      restored.runToDeath();
      expect(restored.digest()).toBe(whole.digest());
      expect(restored.log).toEqual(whole.log);
    }
  });

  it('digest pin (bắt trôi luật vô tình; cố ý đổi cân bằng thì cập nhật kèm ghi chú)', () => {
    const out = ['tsvl-01', 'tsvl-02', 'tsvl-03'].map((s) => {
      const l = life(s);
      l.runToDeath();
      return `${l.summary().ageYears} ${l.summary().cause} ${l.digest()}`;
    });
    // v0.3 Bước 0: thêm luồng RNG economy, events, weather → digest đổi; tuổi và nguyên nhân chết giữ nguyên.
    // v0.3 S1: snapshot thêm hộ (ADR 0013) → digest đổi; chưa ra riêng, chưa đói kém nên tuổi và nguyên nhân giữ nguyên.
    // v0.3 S2: chợ quận vào snapshot, thời tiết năm; trẻ nhà nghèo có thể đói trong nạn đói (ADR 0012, 0013).
    // v0.3 S3: hộ thêm tuần công, mùa vụ (ADR 0012); 3 đời mẫu không xếp kế hoạch (chỉ nghỉ) nên tuổi và nguyên nhân giữ nguyên.
    // v0.3 S4: thêm kỹ năng buôn bán, nợ thuế vào snapshot (ADR 0012).
    // v0.3 S5: snapshot thêm trạng thái sự kiện (ADR 0014); đời mẫu chỉ nghỉ, túi không có lương nên không gặp sự kiện mẫu.
    expect(out).toMatchInlineSnapshot(`
      [
        "75 illness a85c6b22723556c6",
        "67 old_age ae5ed1311c7e184a",
        "71 illness e65a44cb95613f55",
      ]
    `);
  });
});

describe('thọ nguyên và tử vong (300 đời)', () => {
  it('không đời nào vượt trần, không kẹt; đủ các nguyên nhân', () => {
    const causes = new Set<string>();
    const kinds: SettlementKind[] = ['village', 'town', 'city'];
    for (let i = 0; i < 300; i++) {
      const l = life('mortality', i % 9, i, kinds[i % 3]);
      l.runToDeath();
      expect(l.alive).toBe(false);
      const c = l.character;
      expect(l.death!.tick - c.birthTick).toBeLessThanOrEqual(c.lifespanBase + c.lifespanBonus);
      causes.add(l.death!.cause);
    }
    // Từ S2 trẻ nhà nghèo có thể chết đói trong nạn đói quận nhà (ADR 0013)
    expect([...causes].sort()).toEqual(['accident', 'illness', 'old_age', 'starvation']);
  });
});
