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
    expect(roots).toBeGreaterThan(240); // ~15% (v0.8 S7, ADR 0023; trước là 5%)
    expect(roots).toBeLessThan(360);
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
    // v0.6 Bước 0: luồng RNG factions, kho thế lực (rỗng) trong snapshot, SIM_VERSION 0.6.0 → digest đổi; tuổi và nguyên nhân giữ.
    // v0.6 S1: quan phủ lấy nửa thuế đinh, thuế điền của quận, chi một phần tư kho mỗi quý ở trị sở → digest đổi, tuổi giữ.
    // v0.6 S2: tổ dòng cha trong liên kết ruột thịt, gia tộc trong snapshot → digest đổi, tuổi giữ.
    // v0.6 S3: lời buôn ghi theo đường, thương hội lấy một phần, chia lãi cho thương nhân → digest đổi, tuổi giữ.
    // v0.6 S4: băng cướp (đời mẫu không gặp: digest giữ). S5: thuế dân nền, quan, sai dịch, phát chẩn, tiễu phỉ, cát cứ
    // (chủ dự án chọn thuế 1% quỹ quận) → digest đổi, tuổi giữ.
    // v0.6 S6: thuế đinh, thuế điền theo độ tham của quan; lương thuê ở trấn có thương hội; rủi ro đường theo người giữ
    // đường → digest đổi; đời thứ ba (chỉ nghỉ, sống bằng của để dành) nộp thuế theo quan khác lệ cũ nên cạn lương sớm
    // một năm (42 → 41), cùng nguyên nhân.
    // v0.6 S7: chín sự kiện thế lực; sáu sự kiện cũ gọi người, kho thế lực thật → đời mẫu (chọn lựa chọn đầu) gặp lệ phí,
    // bắt phu, phát chẩn: tuổi chết đói 51 → 49, 52 → 53, 41 giữ; cùng nguyên nhân.
    // v0.6 S8: dòng họ dựng sẵn lúc dựng vùng (luồng npc-world rút thêm, tên, cha của người lớn ban đầu), gia tộc lập từ 5
    // người lớn, thương hội từ 2 thương nhân → digest đổi; đời 1 chết đói 49 → 51, đời 2, 3 giữ tuổi; cùng nguyên nhân.
    // v0.6 F4: snapshot thêm thế lực đã thấy (`factionsSeen`) → digest đổi; tuổi, nguyên nhân giữ.
    // Đóng v0.6: SIM_VERSION 0.6.0 → 0.6.1 → digest đổi; tuổi, nguyên nhân giữ.
    // v0.7 Bước 0: SIM_VERSION 0.7.0, thân phận nghề (null) trong snapshot, kỹ năng y thuật (0) → digest đổi; tuổi, nguyên nhân giữ.
    // v0.7 S1: snapshot thêm các nghề đã rời (`careers`, rỗng khi chưa vào nghề) → digest đổi; tuổi, nguyên nhân giữ.
    // v0.7 S2: chợ quận thêm số mẫu dân nền đã bán trong năm (`landSold`) → digest đổi; tuổi, nguyên nhân giữ.
    // v0.7 S3b: kho đồ (ADR 0021) — da săn, thuốc hái vào túi đồ thay vì tiền ngay; đời mẫu không bao giờ bán hàng nên
    // mất phần tiền da: đời 1, 2 chết đói sớm hai năm (51 → 49, 53 → 51). Chợ hàng, lái buôn chở hàng đổi dòng tiền giữa
    // các quận nên giá lương lệch; đời 3 (chỉ nghỉ) giữ 41. Cùng nguyên nhân.
    // v0.7 S7: thái độ thế lực với người chơi ghi vào thế lực (`playerAttitude`) khi chọn trong sự kiện thế lực → đời 2
    // đổi digest; tuổi, nguyên nhân giữ.
    // v0.7 S8: 51 sự kiện mới (năm sự kiện mỗi nghề, sáu sự kiện chung). Đời mẫu chọn lựa chọn đầu, ở sự kiện chung mới
    // thường là chi tiền, góp gạo (quà chợ phiên, lễ cơm mới, góp làm cầu, đò ngang): đời 3 (chỉ nghỉ, sống bằng của để
    // dành) cạn sớm, chết đói 41 → 38; đời 1 49 → 50. Cùng nguyên nhân.
    // Đóng v0.7: SIM_VERSION 0.7.0 → 0.7.1 → digest đổi; tuổi, nguyên nhân giữ.
    // v0.8 Bước 0: SIM_VERSION 0.8.0, đường tu (người phàm, chưa kiểm) trong snapshot → digest đổi; tuổi, nguyên nhân giữ.
    // v0.8 S1: tu sĩ lưu lạc có thể ghé cả người thường (400 ppm mỗi tuần) — thêm một sự kiện vào lượt rút nên chuyện mỗi
    // năm đổi: đời 1 chết đói 50 → 52, đời 3 (chỉ nghỉ) 38 → 42, đời 2 giữ 51. Cùng nguyên nhân.
    // v0.8 S2: đời 3 gặp tu sĩ lưu lạc nên được hẹn kiểm linh căn (chọn lựa chọn cuối: thôi) → digest đổi; tuổi, nguyên nhân giữ.
    // v0.8 S3: tông môn lập cùng quan phủ (số hiệu thế lực sau dịch một); trẻ NPC đỗ kỳ tuyển rời vùng → làng đổi người, đời 3
    // chết đói 42 → 44; đời 1, 2 giữ tuổi. Cùng nguyên nhân.
    // v0.8 S6: snapshot đường tu thêm số ô ngồi tu trong năm → digest đổi. Đời 3 đã mang ám ảnh (S2: tu sĩ xem, không có
    // linh căn) nên gặp sự kiện ám ảnh, chọn lựa chọn đầu: bỏ việc lên núi tìm một tháng, chết đói 44 → 41. Cùng nguyên nhân.
    // v0.8 S7 (ADR 0023): linh căn 5% → 15% cho mọi người — lúc dựng NPC rút thêm độ thuần, số hệ nên làng đổi người, kỳ
    // tuyển có trẻ NPC đỗ rời vùng → digest cả ba đời đổi; đời 1 chết đói 52 → 50, đời 2, 3 giữ tuổi. Cùng nguyên nhân.
    expect(out).toMatchInlineSnapshot(`
      [
        "50 starvation e6e4b27e22b8fcbc",
        "51 starvation 9ae77b6c31f69a5b",
        "41 starvation 1f953c7e820b60bc",
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
