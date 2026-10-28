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
    // v0.3 S6: 29 sự kiện, tai họa và dịch theo quận, nợ vay (ADR 0014); đời mẫu nay gặp sự kiện (chọn lựa chọn đầu tiên đang mở).
    // v0.3 S7: bật lập thân; đời mẫu chọn "ở lại" (lựa chọn đầu), hai mươi tuổi ra riêng, chỉ nghỉ nên chết đói sớm.
    // v0.3 F5: hộ thêm bộ đếm năm đói cho màn tổng kết, SIM_VERSION 0.3.1 → digest đổi; tuổi và nguyên nhân chết giữ nguyên.
    // v0.4 Bước 0: snapshot thêm danh sách NPC (rỗng), luồng npc-world, SIM_VERSION 0.4.0 → digest đổi; tuổi và nguyên nhân chết giữ nguyên.
    // v0.4 S1: dân số NPC ban đầu theo hạn mức, trừ khỏi dân nền, người lớn nhận phần chia từ quỹ quận (ADR 0016) → digest đổi; tuổi và nguyên nhân chết giữ nguyên.
    // v0.4 S2: NPC ở quận người chơi sống mỗi tuần (tầng L0), người lớn có kho dành dụm theo tuổi → digest đổi.
    // v0.4 S4: snapshot NPC thêm seed gốc, vùng; trẻ sinh giữ hạn mức, lập thân NPC, nghề đổi theo kỹ năng → digest đổi.
    // v0.4 S6: sự kiện gọi người thật (thẻ, lựa chọn đổi túi, kho, thương tích NPC), trạng thái sự kiện thêm người đã gặp,
    // nhật ký thêm tin sinh, mất → digest đổi; tuổi và nguyên nhân chết giữ nguyên.
    // v0.5 Bước 0: SIM_VERSION 0.5.0 → digest đổi; tuổi và nguyên nhân chết giữ nguyên.
    // v0.5 S1: cha mẹ thật (chọn hoặc dựng thêm bằng luồng npc-world), liên kết ruột thịt, kho quan hệ trong snapshot;
    // người chơi mang họ cha → digest đổi; tuổi và nguyên nhân chết giữ nguyên.
    // v0.5 S2: hôn nhân NPC, trẻ có cha mẹ, con ăn vào kho cha mẹ, người thân giúp khi đói (cả người chơi) → đời mẫu
    // chỉ nghỉ được cha mẹ mang gạo sang khi đói nên sống lâu hơn (21 → 31–43 tuổi); vẫn chết đói khi cha mẹ hết dư hoặc mất.
    // v0.5 S3: thừa kế (cha mẹ mất thì người chơi được chia), phí thầy thuốc vào túi thầy thuốc, chi dùng 4%/năm phần
    // tiền trên 5.000 văn → đời mẫu chỉ nghỉ sống bằng của thừa kế lâu hơn (31–43 → 42–53 tuổi), vẫn chết đói khi hết.
    // v0.5 S4: luồng RNG social, quan hệ đổi theo lựa chọn sự kiện có người thật, phai đầu năm → digest đổi.
    // v0.5 S5: NPC cưới thì nhà trai đưa sính lễ (của cải cha mẹ, phần thừa kế đổi), sự kiện cha mẹ ốm, lo tang người
    // thân → đời mẫu chỉ nghỉ sống 49/53/42 → 52/53/42 tuổi, vẫn chết đói khi hết của.
    // v0.5 S6: tiếng tăm theo quận (thiếu thuế mất tiếng, quen người mới theo tiếng), tin đồn → digest đổi, tuổi giữ.
    // v0.5 S7: chín sự kiện quan hệ (đời mẫu chọn lựa chọn đầu đang mở, phần lớn tốn tiền), trộm kho có tên
    // → 51/52/42 tuổi.
    // v0.5 S8: chi dùng hằng năm tính trên phần tiền vượt 15.000 văn (trước 5.000) → digest đổi, tuổi giữ.
    expect(out).toMatchInlineSnapshot(`
      [
        "51 starvation 97d749eea598d497",
        "52 starvation 3f4472cd29e9e4cb",
        "42 starvation 0bd0fa7f295b5397",
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
