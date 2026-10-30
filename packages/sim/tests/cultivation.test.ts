// v0.8 Bước 0: đường tu trong snapshot, phép chiếu, linh khí nơi ở (ADR 0022).
import { birthplaceId, HIDDEN_CHARACTER_KEYS, regionId, vCharacterView } from '@tsvl/shared';
import { SECT_DUTY_FEE, SECT_DUTY_WEEKS, SECT_EXPEL_MISSED } from '../src/factions/sect';
import type { RegionLogic } from '@tsvl/worldgen';
import { describe, expect, it } from 'vitest';
import { Life, Rng } from '../src/index';
import { autoAdvance, lastChoice, pastComingOfAge } from './auto';
import { cultivationView, hasSite, legacyCultivation, newCultivation, QI_PEAK, QI_PLACE_PCT, qiBand, qiPlacePct, rootBand, seekLock, sitesOf, testRoot } from '../src/life/cultivation';
import { createCharacter, type SpiritRoot } from '../src/life/character';
import { actionDef, actionOptions, placeRiskPpm, SEEK_MOUNTAIN_RISK_PPM } from '../src/life/actions';
import { mountainCounty } from '../src/life/wayward';
import { choose, makeContext, type EventDef } from '../src/events/engine';
import { CULTIVATOR_TEST_FEE, cultivatorTest, hermitHint, hermitStoneTest, ROOT_TEST_LEADS, ruinStone, seekCave, shrineKeeper, wanderingCultivator } from '../src/events/defs/cultivation';
import { EVENTS } from '../src/events/catalog';
import type { LifeSnapshot } from '../src/life/life';
import { vLifeSnapshot } from '../src/life/validate';

/** Quận 0 làng, 1 trấn, 2 thành; đường 0–1 qua núi (địa hình 250%), 1–2 đồng bằng. */
const region: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [0, 1, 2].map((worldIndex) => ({ worldIndex, area: 100, seat: { x: worldIndex, y: 0 }, name: `Quận ${worldIndex}` })),
  settlementKind: ['village', 'town', 'city'], adjacency: [[0, 1], [1, 2]], terrainPct: [250, 100], fertilityPct: [100, 100, 100],
  seatKm: [[0, 60, 120], [60, 0, 60], [120, 60, 0]],
};
const bp = { id: birthplaceId('r0/c2'), name: 'Thành', nameHan: '城', kind: 'city' as const, cell: { x: 2, y: 0 }, county: 2 };

describe('đường tu (v0.8 Bước 0)', () => {
  it('view có nghĩa vụ tông môn khi còn tên trong sổ (F1): tuần tạp dịch, mức gạch tên, tiền nộp thay; qua schema, tải lại vẫn vậy', () => {
    const s = Life.create({ worldSeed: 'tu', regionId: regionId('r0'), birthplaceId: bp.id }, bp, region).snapshot();
    s.cultivation = { ...newCultivation(), root: 'fair', path: 'sect', qi: 1_000, duty: { weeks: 3, missed: 1, since: 0 } };
    const l = Life.restore(s, [], region);
    expect(l.view().cultivation).toEqual({ realm: 'mortal', root: 'fair', path: 'sect', qi: 'low', duty: { weeks: 3, need: SECT_DUTY_WEEKS, missed: 1, expelAt: SECT_EXPEL_MISSED, fee: SECT_DUTY_FEE }, place: 'thin' });
    expect(vCharacterView.check(l.view(), '$')).toBeNull();
    // Bị gạch tên (hay tán tu): không có nghĩa vụ
    s.cultivation = { ...s.cultivation, duty: null };
    expect(Life.restore(s, [], region).view().cultivation).not.toHaveProperty('duty');
  });

  it('đời mới là người phàm chưa kiểm linh căn; view không lộ linh căn, số linh khí; tổng kết có một đời tu', () => {
    const l = Life.create({ worldSeed: 'tu', regionId: regionId('r0'), birthplaceId: bp.id }, bp, region);
    expect(l.snapshot().cultivation).toEqual(newCultivation());
    expect(l.view().cultivation).toEqual({ realm: 'mortal', root: null, path: null, qi: null });
    expect(HIDDEN_CHARACTER_KEYS).toContain('spiritRoot');
    expect(JSON.stringify(l.view())).not.toMatch(/purity|spiritRoot|"qi":\d/);
    autoAdvance(l, 'year', lastChoice);
    const snap: LifeSnapshot = JSON.parse(JSON.stringify(l.snapshot()));
    expect(vLifeSnapshot.check(snap, '$')).toBeNull();
    snap.cultivation.realm = 'qi9' as never;
    expect(vLifeSnapshot.check(snap, '$')).toContain('cultivation');
    // Lưu, tải, chạy tiếp cùng digest
    const a = Life.restore(JSON.parse(JSON.stringify(l.snapshot())), [], region);
    for (let k = 0; k < 3; k++) { autoAdvance(a, 'year', lastChoice); autoAdvance(l, 'year', lastChoice); }
    expect(a.digest()).toBe(l.digest());
  });

  it('dải linh khí: chưa có, ít, nửa, gần đầy, đỉnh; chỉ hiện khi đã dẫn khí', () => {
    const peak = QI_PEAK.qi1;
    expect([0, 1, peak / 2 - 1, peak / 2, (peak * 3) / 4, peak - 1, peak, peak * 2].map((q) => qiBand(q, peak))).toEqual(['empty', 'low', 'low', 'half', 'high', 'high', 'peak', 'peak']);
    const s = { ...newCultivation(), root: 'fair' as const, path: 'sect' as const, realm: 'qi1' as const, qi: peak / 2, entered: 900, breakthroughs: [{ at: 880, ok: false }, { at: 900, ok: true }] };
    expect(cultivationView(s)).toEqual({ realm: 'qi1', root: 'fair', path: 'sect', qi: 'half' });
    expect(cultivationView({ ...newCultivation(), root: 'none' })).toEqual({ realm: 'mortal', root: 'none', path: null, qi: null });
    expect(legacyCultivation(s)).toEqual({ root: 'fair', realm: 'qi1', path: 'sect', entered: 900, breakthroughs: [{ at: 880, ok: false }, { at: 900, ok: true }] });
    expect(legacyCultivation(newCultivation())).toEqual({ root: null, realm: 'mortal', path: null, breakthroughs: [] });
  });

  it('linh khí nơi ở theo bản đồ: di tích 150%, quận có đường núi 120%, thành 80%, trấn 90%, làng 100%', () => {
    const ruin = sitesOf(region).ruins;
    expect(ruin.length).toBeGreaterThanOrEqual(1);
    expect([0, 1, 2].map((k) => qiPlacePct(region, k))).toEqual([0, 1].map((k) => (ruin.includes(k) ? QI_PLACE_PCT.ruin : QI_PLACE_PCT.mountain)).concat(QI_PLACE_PCT.city));
    const flat: RegionLogic = { ...region, terrainPct: [100, 100] };
    expect([0, 1, 2].map((k) => qiPlacePct(flat, k))).toEqual([100, 90, 80]);
  });
});

/** Vùng thật hơn: 6 quận, đường 0–1 qua núi (quận 0, 1 có núi), quận 5 là thành; đủ để có di tích, miếu. */
const wide: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [10, 11, 12, 13, 14, 15].map((worldIndex, k) => ({ worldIndex, area: 100, seat: { x: k, y: 0 }, name: `Quận ${k}` })),
  settlementKind: ['village', 'village', 'village', 'town', 'village', 'city'],
  adjacency: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]], terrainPct: [250, 100, 100, 100, 100], fertilityPct: [100, 100, 100, 100, 100, 100],
  seatKm: [0, 1, 2, 3, 4, 5].map((a) => [0, 1, 2, 3, 4, 5].map((b) => Math.abs(a - b) * 60)),
};

describe('chốn tìm cơ duyên trên bản đồ (v0.8 S1)', () => {
  it('di tích chỉ ở quận có đường núi, ít nhất một; miếu ở làng, trấn (không ở thành), ít nhất một; không núi thì không di tích', () => {
    const s = sitesOf(wide);
    expect(s.ruins.length).toBeGreaterThanOrEqual(1);
    for (const k of s.ruins) expect(mountainCounty(wide, k), `di tích ${k}`).toBe(true);
    expect(s.shrines.length).toBeGreaterThanOrEqual(1);
    for (const k of s.shrines) expect(wide.settlementKind[k], `miếu ${k}`).not.toBe('city');
    expect(sitesOf({ ...wide, terrainPct: [100, 100, 100, 100, 100] }).ruins).toEqual([]);
    // Tất định theo số hiệu quận trong thế giới: dựng lại vùng (đối tượng khác) vẫn ra cùng chỗ
    expect(sitesOf(JSON.parse(JSON.stringify(wide)))).toEqual(s);
  });

  it('tìm cơ duyên: chỉ ở quận có núi hay có miếu; núi sâu rủi ro cao, thăm miếu không rủi ro', () => {
    const seek = actionDef('action.seek')!;
    expect(seekLock(wide, 0)).toBeNull();
    expect(placeRiskPpm(seek, wide, 0)).toBe(SEEK_MOUNTAIN_RISK_PPM);
    const shrineOnly = sitesOf(wide).shrines.find((k) => !mountainCounty(wide, k));
    if (shrineOnly !== undefined) {
      expect(seekLock(wide, shrineOnly)).toBeNull();
      expect(placeRiskPpm(seek, wide, shrineOnly)).toBe(0);
    }
    const nowhere = wide.counties.findIndex((_, k) => !mountainCounty(wide, k) && !hasSite(wide, k, 'shrine'));
    expect(nowhere).toBeGreaterThanOrEqual(0);
    expect(seekLock(wide, nowhere)).toBe('lock.no_seek_place');
  });
});

describe('tiếp xúc với tu tiên (v0.8 S1)', () => {
  const bpWide = { id: birthplaceId('r0/c0'), name: 'Làng núi', nameHan: '村', kind: 'village' as const, cell: { x: 0, y: 0 }, county: 0 };
  /** Người lớn ở quận `county`, kế hoạch cả tháng tìm cơ duyên (hay nghỉ); cờ dấu vết cho sẵn. */
  function seeker(county: number, flags: string[] = [], seek = true): LifeSnapshot {
    const s = Life.create({ worldSeed: 'tiep-xuc', regionId: regionId('r0'), birthplaceId: bpWide.id }, bpWide, wide).snapshot();
    s.character.birthTick = 0; s.tick = 20 * 36 + 3; s.character.location = county;
    s.character.household = { ...s.character.household, independent: true, money: 500, grain: 300 };
    s.character.health = s.character.healthMax = 1000; s.character.stamina = 900; s.character.conditions = [];
    s.plan = { slots: [0, 1, 2].map(() => ({ action: seek ? 'action.seek' : 'action.rest' })) as never };
    s.events.flags = [...flags];
    return pastComingOfAge(s);
  }
  const ctxOf = (s: LifeSnapshot) => makeContext(s.character, s.events, s, s.economy, wide, s.tick, s.npcs, s.bonds, s.reputation, s.factions);
  const pick = (ev: EventDef, s: LifeSnapshot, choice: string, rng = Rng.fromSeed(1)) => {
    s.events.pending = { instance: 0, eventId: ev.id, tick: s.tick, variant: null, params: ev.params?.(ctxOf(s)) ?? {}, figure: null, npcId: null };
    expect(choose(s.events, EVENTS, ctxOf(s), 0, choice, rng, () => {})).toBeNull();
    return s.events.flags;
  };
  const ruin = () => sitesOf(wide).ruins[0]!;

  it('hang đá chỉ hiện khi đang vào núi ở quận có di tích; biết chỗ hang (cờ cũ) thì tìm trúng hơn; vào hang để lại dấu', () => {
    expect(seekCave.weight(ctxOf(seeker(ruin(), [], false)))).toBe(0);
    const base = seekCave.weight(ctxOf(seeker(ruin())));
    expect(base).toBeGreaterThan(0);
    expect(seekCave.weight(ctxOf(seeker(ruin(), ['knows_cave'])))).toBe(base * 3);
    expect(seekCave.weight(ctxOf(seeker(ruin(), ['knows_cave', 'half_map'])))).toBe(base * 6);
    expect(seekCave.weight(ctxOf(seeker(ruin(), ['found_ruin'])))).toBe(0);
    expect(pick(seekCave, seeker(ruin()), 'enter')).toContain('found_ruin');
    expect(pick(seekCave, seeker(ruin()), 'mark')).toEqual(['knows_cave']);
  });

  it('tu sĩ lưu lạc: hiếm với người thường, nhiều hơn khi đang tìm cơ duyên, đã nghe chuyện tiên, quen đường, hay khấn miếu', () => {
    const w = (flags: string[], seek = true) => wanderingCultivator.weight(ctxOf(seeker(0, flags, seek)));
    expect(w([], false)).toBeGreaterThan(0);
    expect(w([])).toBeGreaterThan(w([], false));
    expect(w(['heard_immortal'])).toBe(w([]) * 4);
    expect(w(['road_friend'])).toBe(w([]) * 3);
    expect(w(['temple_prayer'])).toBe(w([]) * 2);
    expect(w(['met_cultivator'])).toBe(0);
    expect(pick(wanderingCultivator, seeker(0), 'treat')).toContain('met_cultivator');
    // Đã nghe chuyện tiên thì hỏi trúng chuyện
    expect(pick(wanderingCultivator, seeker(0, ['heard_immortal']), 'ask')).toContain('met_cultivator');
  });

  it('ông từ giữ miếu kể chuyện hang và kỳ tuyển; ẩn sĩ chỉ gặp lại khi đã từng gặp (cờ v0.7)', () => {
    const shrine = sitesOf(wide).shrines[0]!;
    expect(shrineKeeper.weight(ctxOf(seeker(shrine)))).toBeGreaterThan(0);
    expect(shrineKeeper.weight(ctxOf(seeker(shrine, ['temple_prayer'])))).toBe(shrineKeeper.weight(ctxOf(seeker(shrine))) * 2);
    expect(pick(shrineKeeper, seeker(shrine), 'donate')).toEqual(expect.arrayContaining(['heard_immortal', 'knows_cave', 'heard_trial']));
    expect(hermitHint.weight(ctxOf(seeker(0)))).toBe(0);
    expect(hermitHint.weight(ctxOf(seeker(0, ['met_hermit'])))).toBeGreaterThan(0);
    expect(pick(hermitHint, seeker(0, ['met_hermit']), 'serve')).toContain('hermit_stone');
    expect(pick(hermitHint, seeker(0, ['met_hermit']), 'ask')).not.toContain('hermit_stone');
    expect(pick(hermitHint, seeker(0, ['met_hermit', 'hermit_gift']), 'ask')).toContain('hermit_stone');
  });

  it('ba lối dẫn tới chỗ kiểm linh căn ngoài kỳ tuyển: đá trong hang, tu sĩ lưu lạc, viên đá của ẩn sĩ', () => {
    expect([...ROOT_TEST_LEADS]).toEqual(['found_ruin', 'met_cultivator', 'hermit_stone']);
  });

  it('vào núi tìm cơ duyên vài năm ở quận có di tích: sớm muộn tìm ra hang; chưa ai kiểm linh căn (S2)', () => {
    const l = Life.restore(seeker(ruin(), ['knows_cave']), [], wide);
    for (let w = 0; w < 6 * 36 && l.alive && !l.snapshot().events.flags.includes('found_ruin'); w++) {
      const r = l.advance('week');
      if (r.status === 'event') l.choose(r.pending.instance, r.pending.choices.find((c) => c.id === 'enter')?.id ?? r.pending.choices.at(-1)!.id);
    }
    expect(l.snapshot().events.flags).toContain('found_ruin');
    expect(l.snapshot().cultivation.root).toBeNull();
  });

  it('rủi ro vào núi đo được: mỗi ô núi sâu rút tai nạn, thăm miếu không', () => {
    const seek = actionDef('action.seek')!;
    let hurt = 0;
    for (let i = 0; i < 2_000; i++) if (Rng.fromSeed(i).chance(placeRiskPpm(seek, wide, 0))) hurt++;
    expect(hurt).toBeGreaterThan(0);
    expect(actionOptions(seeker(0).character, 20 * 36 + 3, wide, seeker(0).economy).find((o) => o.id === 'action.seek')!.cost.risk).toBe('risk.high');
  });
});

describe('kiểm tra linh căn (v0.8 S2)', () => {
  it('dải theo độ thuần trừ 15 mỗi hệ thêm: từ 55 tốt, từ 25 khá, dưới tạp; không có linh căn thì "không có"', () => {
    const r = (n: number, purity: number) => ({ elements: (['metal', 'wood', 'water', 'fire', 'earth'] as const).slice(0, n) as never, purity });
    expect(rootBand(null)).toBe('none');
    expect([r(1, 55), r(1, 54), r(2, 70), r(2, 69), r(1, 25), r(1, 24), r(5, 85), r(5, 84)].map(rootBand))
      .toEqual(['good', 'fair', 'good', 'fair', 'fair', 'mixed', 'fair', 'mixed']);
    const s = newCultivation();
    expect(testRoot(s, r(1, 90))).toBe('good');
    // Đã kiểm thì nhớ cả đời, không kiểm lại ra khác
    expect(testRoot(s, null)).toBe('good');
  });

  it('20.000 người sinh ra: khoảng 15% có linh căn (S7, ADR 0023); người không có linh căn luôn ra "không có"; trong người có thì tạp nhiều nhất, tốt ít nhất', () => {
    const bands: Record<string, number> = { none: 0, mixed: 0, fair: 0, good: 0 };
    let rooted = 0;
    const r = Rng.fromSeed(7), names = Rng.fromSeed(8);
    for (let i = 0; i < 20_000; i++) {
      const c = createCharacter({ birthTick: 0, birthplaceId: birthplaceId('r0/c0'), birthplaceKind: 'village', county: 0 }, r, names);
      const b = rootBand(c.spiritRoot);
      bands[b]!++;
      if (c.spiritRoot) rooted++; else expect(b).toBe('none');
    }
    expect(rooted / 20_000).toBeGreaterThan(0.14);
    expect(rooted / 20_000).toBeLessThan(0.16);
    expect(bands.mixed! + bands.fair! + bands.good!).toBe(rooted);
    expect(bands.mixed!).toBeGreaterThan(bands.fair!);
    expect(bands.fair!).toBeGreaterThan(bands.good!);
    expect(bands.good!).toBeGreaterThan(0);
  });
});

describe('ba lối kiểm linh căn (v0.8 S2)', () => {
  const bpWide = { id: birthplaceId('r0/c0'), name: 'Làng núi', nameHan: '村', kind: 'village' as const, cell: { x: 0, y: 0 }, county: 0 };
  function adult(county: number, flags: string[], root: SpiritRoot | null, seek = true): LifeSnapshot {
    const s = Life.create({ worldSeed: 'kiem-linh-can', regionId: regionId('r0'), birthplaceId: bpWide.id }, bpWide, wide).snapshot();
    s.character.birthTick = 0; s.tick = 20 * 36 + 4; s.character.location = county;
    s.character.household = { ...s.character.household, independent: true, money: 1_000, grain: 300 };
    s.character.health = s.character.healthMax = 1000; s.character.stamina = 900; s.character.conditions = [];
    s.character.spiritRoot = root; s.character.luck = 5;
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
  const good: SpiritRoot = { elements: ['wood'], purity: 80 };
  const ruin = () => sitesOf(wide).ruins[0]!;

  it('đá trong hang: chỉ khi đã vào hang (S1), đang tìm cơ duyên ở di tích, chưa kiểm; phúc duyên làm dễ gặp hơn', () => {
    expect(ruinStone.weight(ctxOf(adult(ruin(), [], good)))).toBe(0);
    const w = ruinStone.weight(ctxOf(adult(ruin(), ['found_ruin'], good)));
    expect(w).toBeGreaterThan(0);
    const lucky = adult(ruin(), ['found_ruin'], good); lucky.character.luck = 10;
    expect(ruinStone.weight(ctxOf(lucky))).toBeGreaterThan(w);
    const s = adult(ruin(), ['found_ruin'], good);
    expect(run(ruinStone, s, 'touch')).toBe('event.ruin_stone.result.good');
    expect(s.cultivation.root).toBe('good');
    expect(ruinStone.weight(ctxOf(s))).toBe(0);
  });

  it('tu sĩ hẹn trăng tròn: trung tuần, đã gặp người ấy; trả tiền hay làm đỡ việc đều ra cùng dải', () => {
    const at = (tenDay: number) => { const s = adult(0, ['met_cultivator'], good, false); s.tick = 20 * 36 + tenDay; return cultivatorTest.weight(ctxOf(s)); };
    expect([at(0), at(1), at(2)].map((w) => w > 0)).toEqual([false, true, false]);
    const paid = adult(0, ['met_cultivator'], good, false); paid.tick = 20 * 36 + 1;
    const before = paid.character.household.money;
    expect(run(cultivatorTest, paid, 'pay')).toBe('event.cultivator_test.result.good');
    expect(before - paid.character.household.money).toBe(CULTIVATOR_TEST_FEE);
    const worked = adult(0, ['met_cultivator'], good, false); worked.tick = 20 * 36 + 1;
    expect(run(cultivatorTest, worked, 'work')).toBe('event.cultivator_test.result.good');
    expect(worked.active).not.toBeNull();
  });

  it('viên đá ẩn sĩ; người không có linh căn ra "không có" ở mọi lối và mang ám ảnh', () => {
    const s = adult(0, ['hermit_stone'], null);
    expect(hermitStoneTest.weight(ctxOf(s))).toBeGreaterThan(0);
    expect(run(hermitStoneTest, s, 'hold')).toBe('event.hermit_stone.result.none');
    expect(s.cultivation.root).toBe('none');
    expect(s.events.flags).toContain('haunted');
    const r = adult(ruin(), ['found_ruin'], null);
    run(ruinStone, r, 'touch');
    expect(r.cultivation.root).toBe('none');
    expect(r.events.flags).toContain('haunted');
  });

  it('dải đã kiểm hiện ở view, tổng kết; lưu tải cùng digest', () => {
    const s = adult(0, ['hermit_stone'], { elements: ['fire', 'earth', 'water'], purity: 40 });
    run(hermitStoneTest, s, 'hold');
    const l = Life.restore(JSON.parse(JSON.stringify(s)), [], wide);
    expect(l.view().cultivation).toEqual({ realm: 'mortal', root: 'mixed', path: null, qi: null });
    const m = Life.restore(JSON.parse(JSON.stringify(l.snapshot())), [], wide);
    for (let k = 0; k < 2; k++) { autoAdvance(l, 'year', lastChoice); autoAdvance(m, 'year', lastChoice); }
    expect(m.digest()).toBe(l.digest());
    expect(vLifeSnapshot.check(JSON.parse(JSON.stringify(l.snapshot())), '$')).toBeNull();
  });
});
