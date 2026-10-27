import { describe, expect, it } from 'vitest';
import { birthplaceId, regionId, vCharacterView, type LogEntry } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { Life, Rng } from '../src/index';
import { autoAdvance } from './auto';
import { actionOptions } from '../src/life/actions';
import type { CharacterState } from '../src/life/character';
import {
  becomeIndependent, feedPhase, foodWeeksBand, hungerBand, RATION_ADULT, RATION_CHILD, SHARE_BY_BACKGROUND,
} from '../src/life/household';
import type { Background } from '../src/life/params';
import { recoverStamina } from '../src/life/stamina';

const region: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [{ worldIndex: 0, area: 10, seat: { x: 0, y: 0 }, name: 'Làng' }],
  settlementKind: ['village'], adjacency: [], terrainPct: [], fertilityPct: [100], seatKm: [[0]],
};

/** Người lớn 20 tuổi, khỏe đầy; patch đổi trạng thái trước khi chạy. */
function adult(seed = 'hunger', patch: (c: CharacterState) => void = () => {}) {
  const l = Life.create({ worldSeed: seed, regionId: regionId('r0'), birthplaceId: birthplaceId('r0/c0') }, { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village', cell: { x: 0, y: 0 }, county: 0 }, region);
  const s = l.snapshot();
  s.character.birthTick = 0; s.tick = 20 * 36 + 2;
  s.character.health = s.character.healthMax = 1000; s.character.stamina = 900; s.character.conditions = [];
  patch(s.character);
  return Life.restore(s, [], region);
}

const child = (background: Background, hunger = 0) => {
  const c = adult('child').snapshot().character;
  c.birthTick = 0; c.background = background; c.household.hunger = hunger;
  return c;
};

describe('đói: dải mức và khẩu phần (ADR 0013)', () => {
  it('dải mức theo bộ đếm', () => {
    expect([0, 1, 3, 4, 7, 8, 20].map(hungerBand)).toEqual(['fed', 'hungry', 'hungry', 'starving', 'starving', 'famished', 'famished']);
  });

  it('ra riêng: ăn từ kho; đủ thì bớt đói, thiếu thì đói thêm theo mức thiếu', () => {
    const c = child('commoner', 3);
    c.household.independent = true;
    const tick = 20 * 36;
    const log: Omit<LogEntry, 'tick'>[] = [];
    const rng = Rng.fromSeed(1);
    c.household.grain = 25;
    feedPhase(c, tick, 'normal', rng, (e) => log.push(e));
    expect([c.household.grain, c.household.hunger]).toEqual([25 - RATION_ADULT, 2]);
    c.household.grain = 6; // ≥ 50% khẩu phần
    feedPhase(c, tick, 'normal', rng, (e) => log.push(e));
    expect([c.household.grain, c.household.hunger]).toEqual([0, 3]);
    feedPhase(c, tick, 'normal', rng, (e) => log.push(e)); // không còn gì
    expect(c.household.hunger).toBe(5);
    expect(log.map((e) => [e.key, e.importance])).toEqual([['log.hunger.starving', 'major']]);
  });

  it('trẻ dưới 12 ăn nửa khẩu phần', () => {
    const c = child('commoner');
    c.household.independent = true; c.household.grain = RATION_CHILD;
    feedPhase(c, 5 * 36, 'normal', Rng.fromSeed(1), () => {});
    expect([c.household.grain, c.household.hunger]).toEqual([0, 0]);
  });

  it('người lớn còn ở nhà (trạng thái tạm) không bị bỏ đói kể cả khi đói kém (hồi quy: người 60 tuổi chết đói vì "cha mẹ")', () => {
    const c = child('destitute');
    const rng = Rng.fromSeed(3);
    const before = rng.state();
    for (let i = 0; i < 200; i++) feedPhase(c, 16 * 36 + i, 'famine', rng, () => {});
    expect(c.household.hunger).toBe(0);
    expect(rng.state()).toEqual(before);
  });

  it('cha mẹ nuôi: năm thường không rút RNG, luôn đủ ăn', () => {
    const c = child('destitute', 2);
    const rng = Rng.fromSeed(7);
    const before = rng.state();
    for (let i = 0; i < 100; i++) feedPhase(c, 5 * 36 + i, 'scarce', rng, () => {});
    expect(rng.state()).toEqual(before);
    expect(c.household.hunger).toBe(0);
  });

  it('quận nhà đói kém: con nhà nghèo bị bỏ đói, nhà giàu không bao giờ', () => {
    const skipped = (bg: Background) => {
      const c = child(bg);
      const rng = Rng.fromSeed(42);
      let n = 0;
      for (let i = 0; i < 2000; i++) {
        feedPhase(c, 5 * 36, 'famine', rng, () => {}); // giữ 5 tuổi: luật bỏ đói chỉ áp cho trẻ
        if (c.household.hunger > 0) n++;
        c.household.hunger = 0;
      }
      return n;
    };
    expect(skipped('wealthy')).toBe(0);
    const poor = skipped('destitute'), common = skipped('commoner'), comfy = skipped('comfortable');
    expect(poor).toBeGreaterThan(500); // ~30%
    expect(poor).toBeLessThan(700);
    expect(common).toBeLessThan(poor);
    expect(comfy).toBeLessThan(common);
    expect(comfy).toBeGreaterThan(0);
  });

  it('trẻ còn ở nhà đói nhẹ chỉ ghi nhật ký; người đã ra riêng đói nhẹ thì ngắt tua', () => {
    const log: Omit<LogEntry, 'tick'>[] = [];
    const kid = child('destitute');
    for (let i = 0; i < 50 && !log.length; i++) feedPhase(kid, 5 * 36 + i, 'famine', Rng.fromSeed(i), (e) => log.push(e));
    expect(log[0]).toMatchObject({ key: 'log.hunger.hungry', importance: 'minor' });
    const grown = child('commoner');
    grown.household.independent = true;
    log.length = 0;
    feedPhase(grown, 20 * 36, 'normal', Rng.fromSeed(1), (e) => log.push(e));
    expect(log[0]).toMatchObject({ key: 'log.hunger.hungry', importance: 'major' });
  });
});

describe('ra riêng và hộ người chơi thấy', () => {
  it.each(Object.keys(SHARE_BY_BACKGROUND) as Background[])('%s nhận phần chia theo xuất thân, lấy từ quỹ và kho quận nhà', (bg) => {
    const c = child(bg);
    const home = { mouths: 100, grain: 100_000, money: 50_000, weatherPct: 100, price: 40, prevPrice: 40 };
    becomeIndependent(c, home);
    const share = SHARE_BY_BACKGROUND[bg];
    expect(c.household).toMatchObject({ independent: true, money: share.money, grain: share.grain, landMu: share.landMu, tenure: share.tenure });
    expect([home.money + c.household.money, home.grain + c.household.grain]).toEqual([50_000, 100_000]);
  });

  it('quận nhà cạn thì nhận được bao nhiêu hay bấy nhiêu (không tạo từ hư không)', () => {
    const c = child('wealthy');
    const home = { mouths: 100, grain: 30, money: 700, weatherPct: 100, price: 40, prevPrice: 40 };
    becomeIndependent(c, home);
    expect(c.household).toMatchObject({ money: 700, grain: 30 });
    expect(home).toMatchObject({ money: 0, grain: 0 });
  });

  it('nghèo hơn thì phần chia ít hơn; nhà nghèo không có ruộng, làm tá điền', () => {
    const order: Background[] = ['destitute', 'commoner', 'comfortable', 'wealthy'];
    const worth = order.map((b) => SHARE_BY_BACKGROUND[b].money + SHARE_BY_BACKGROUND[b].grain * 4);
    expect([...worth].sort((a, b) => a - b)).toEqual(worth);
    expect(SHARE_BY_BACKGROUND.destitute).toMatchObject({ landMu: 0, tenure: 'tenant' });
  });

  it('view có dải đói và dải đủ ăn, không lộ bộ đếm', () => {
    const l = adult('view', (c) => { c.household.independent = true; c.household.grain = 100; c.household.hunger = 5; });
    const v = l.view();
    expect(vCharacterView.check(v, '$')).toBeNull();
    expect(v.household).toMatchObject({ independent: true, grain: 100, hungerBand: 'starving', foodWeeksBand: 'season' });
    expect(JSON.stringify(v)).not.toContain('"hunger"');
  });

  it('dải đủ ăn tính cả tiền quy ra lương thực', () => {
    const h = (grain: number, money: number) => ({ independent: true, grain, money, landMu: 0, tenure: 'none' as const, hunger: 0 });
    expect(foodWeeksBand(h(5, 0), RATION_ADULT, 46)).toBe('none');
    expect(foodWeeksBand(h(10, 0), RATION_ADULT, 46)).toBe('short');
    // Giá mua 46 văn/đấu: 300 văn ≈ 65 thăng ≈ 6 tuần; 460 văn = 100 thăng = 10 tuần; chợ đói kém giá 230 thì 460 văn chỉ còn 2 tuần
    expect(foodWeeksBand(h(0, 300), RATION_ADULT, 46)).toBe('short');
    expect(foodWeeksBand(h(0, 460), RATION_ADULT, 46)).toBe('season');
    expect(foodWeeksBand(h(0, 460), RATION_ADULT, 230)).toBe('short');
    expect(foodWeeksBand(h(90, 0), RATION_ADULT, 46)).toBe('season');
    expect(foodWeeksBand(h(200, 900), RATION_ADULT, 46)).toBe('year'); // 200 + 195 thăng ≈ 39 tuần
  });
});

describe('hậu quả của đói', () => {
  it('đói lả khóa việc nặng (khóa tạm thời), không khóa nghỉ ngơi', () => {
    const lockOf = (hunger: number, id: string) => {
      const l = adult('lock', (c) => { c.household.hunger = hunger; });
      return actionOptions(l.character as CharacterState, l.tick, region, l.snapshot().economy).find((a) => a.id === id)!.locked;
    };
    expect(lockOf(3, 'action.hunt')).toBeNull();
    expect(lockOf(4, 'action.hunt')).toBe('lock.hunger');
    expect(lockOf(4, 'action.rest')).toBeNull();
    expect(lockOf(4, 'action.forage')).toBeNull(); // việc nhẹ vẫn làm được để kiếm cái ăn
  });

  it('đói thì hồi thể lực một nửa', () => {
    const gain = (hunger: number) => {
      const c = adult('stamina', (x) => { x.household.hunger = hunger; x.stamina = 100; }).snapshot().character;
      recoverStamina(c, 20 * 36 + 2, true);
      return c.stamina - 100;
    };
    expect(gain(1) * 2).toBeGreaterThanOrEqual(gain(0) - 1);
    expect(gain(1) * 2).toBeLessThanOrEqual(gain(0) + 1);
  });

  it('hết sạch lương thực: ngắt tua khi bắt đầu đói, chết đói sau 6–10 tuần', () => {
    const l = adult('starve', (c) => { c.household.independent = true; c.household.grain = 0; });
    const start = l.tick;
    const first = l.advance('year');
    expect(first.status).toBe('interrupted');
    if (first.status === 'interrupted') expect(first.entry.key).toBe('log.hunger.hungry');
    while (l.alive) l.advance('year');
    expect(l.death).toMatchObject({ cause: 'starvation', detail: 'hunger.starved' });
    const weeks = l.death!.tick - start + 1;
    expect(weeks).toBeGreaterThanOrEqual(6);
    expect(weeks).toBeLessThanOrEqual(10);
    expect(l.log.filter((e) => e.key.startsWith('log.hunger.')).map((e) => e.key)).toEqual(['log.hunger.hungry', 'log.hunger.starving', 'log.hunger.famished']);
  });

  it('ăn nửa khẩu phần thì chết chậm hơn nhịn hẳn', () => {
    const weeksToDie = (grainPerWeek: number) => {
      let l = adult('half', (c) => { c.household.independent = true; c.household.grain = 0; });
      while (l.alive) {
        // Mỗi tuần chỉ có đúng chừng ấy để ăn
        const s = l.snapshot(); s.character.household.grain = grainPerWeek;
        l = Life.restore(s, [], region);
        l.advance('week');
      }
      return { weeks: l.death!.tick - (20 * 36 + 2), cause: l.death!.cause };
    };
    const none = weeksToDie(0), half = weeksToDie(RATION_ADULT / 2);
    expect(half.cause).toBe('starvation');
    expect(half.weeks).toBeGreaterThan(none.weeks);
  });

  it('đủ ăn trở lại thì hết đói và hồi sức', () => {
    const l = adult('recover', (c) => { c.household.independent = true; c.household.grain = 500; c.household.hunger = 6; });
    l.advance('month'); l.advance('month'); l.advance('month');
    expect(l.character.household.hunger).toBe(0);
    expect(l.log.some((e) => e.key === 'log.hunger.recovered')).toBe(true);
  });

  it('chết vì bệnh khi đang đói nhẹ: vẫn là bệnh, nhật ký kể hoàn cảnh', () => {
    const l = adult('ill', (c) => {
      c.household.independent = true; c.household.grain = 500; c.household.hunger = 3;
      c.health = 5; c.conditions = [{ id: 'illness.dysentery', kind: 'illness', severity: 'grave', weeksLeft: 3 }];
    });
    l.advance('week');
    expect(l.death).toMatchObject({ cause: 'illness', detail: 'illness.dysentery' });
    expect(l.log.at(-1)!.key).toBe('log.death.hungry');
  });

  it('lưu giữa cơn đói rồi tải lại: chạy tiếp cùng digest', () => {
    const whole = adult('save', (c) => { c.household.independent = true; c.household.grain = 15; });
    const part = adult('save', (c) => { c.household.independent = true; c.household.grain = 15; });
    for (let i = 0; i < 4; i++) autoAdvance(part, 'week');
    const restored = Life.restore(part.snapshot(), part.log, region);
    whole.runToDeath(); restored.runToDeath();
    expect(restored.digest()).toBe(whole.digest());
    expect(whole.death!.cause).toBe('starvation');
  });
});
