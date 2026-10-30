import { describe, expect, it } from 'vitest';
import { birthplaceId, regionId } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { Life, Rng } from '../src/index';
import { EVENTS, COMING_OF_AGE_LIVE } from '../src/events/catalog';
import { makeContext } from '../src/events/engine';
import { harvestPlayer } from '../src/economy/farming';
import { createEconomy, DISASTER_MONTHS, DISASTER_WEATHER_PCT, epidemicAt, labelDisasters, rollWeather } from '../src/economy/market';
import { eventsPhase } from '../src/life/health';
import type { CharacterState } from '../src/life/character';
import type { LifeSnapshot } from '../src/life/life';
import { autoAdvance, lastChoice } from './auto';

const region: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [0, 1].map((worldIndex) => ({ worldIndex, area: 100, seat: { x: worldIndex, y: 0 }, name: `Quận ${worldIndex}` })),
  settlementKind: ['village', 'town'], adjacency: [[0, 1]], terrainPct: [100], fertilityPct: [100, 100], seatKm: [[0, 60], [60, 0]],
};
function snap(patch: (c: CharacterState, s: LifeSnapshot) => void = () => {}, age = 20): LifeSnapshot {
  const l = Life.create({ worldSeed: 'catalog', regionId: regionId('r0'), birthplaceId: birthplaceId('r0/c0') }, { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village', cell: { x: 0, y: 0 }, county: 0 }, region);
  const s = l.snapshot();
  s.character.birthTick = 0; s.tick = age * 36 + 3;
  s.character.health = s.character.healthMax = 1000; s.character.stamina = 900; s.character.conditions = [];
  patch(s.character, s);
  return s;
}
const def = (id: string) => EVENTS.find((d) => d.id === id)!;
const ctxOf = (s: LifeSnapshot, tick = s.tick) => makeContext(s.character, s.events, s, s.economy, region, tick);

describe('tuyển tập S6', () => {
  it('khoảng 30 sự kiện, đủ sáu nhóm (v0.8 thêm nhóm đường tiên)', () => {
    expect(EVENTS.length).toBeGreaterThanOrEqual(28);
    expect(new Set(EVENTS.map((d) => d.category))).toEqual(new Set(['daily', 'economy', 'disaster', 'road', 'health', 'opportunity', 'cultivation']));
  });

  it('G2: lập thân bật từ S7 — mười sáu tuổi chưa ra riêng thì gặp, một lần trong đời; đã ra riêng hay đã hẹn ở lại thì thôi', () => {
    expect(COMING_OF_AGE_LIVE).toBe(true);
    const coming = def('event.coming_of_age');
    expect(coming.oncePerLife).toBe(true);
    expect(coming.weight(ctxOf(snap(undefined, 15)))).toBe(0);
    expect(coming.weight(ctxOf(snap(undefined, 16)))).toBeGreaterThan(0);
    expect(coming.weight(ctxOf(snap((c) => { c.household.stayUntil = 20; }, 16)))).toBe(0);
    expect(coming.weight(ctxOf(snap((c) => { c.household.independent = true; }, 16)))).toBe(0);
    const s = snap(undefined, 16);
    const leave = def('event.coming_of_age').choices.at(-1)!;
    const out = leave.apply(ctxOf(s), Rng.fromSeed(1));
    expect(out.result).toBe('leave');
    expect(s.character.household.independent).toBe(true);
  });

  it('đời thật: mười sáu tuổi gặp lập thân, chọn xong thì ra riêng hoặc hẹn ở lại', () => {
    for (const pick of ['leave', 'stay'] as const) {
      const s = snap((c) => { c.background = 'commoner'; }, 16);
      s.tick = 16 * 36;
      const l = Life.restore(s, [], region);
      let seen = false;
      for (let k = 0; k < 12 && !seen; k++) {
        const r = l.advance('week');
        if (r.status === 'event' && r.pending.eventId === 'event.coming_of_age') { seen = true; expect(l.choose(r.pending.instance, pick)).toBeNull(); }
        else if (r.status === 'event') l.choose(r.pending.instance, r.pending.choices.at(-1)!.id);
      }
      expect(seen).toBe(true);
      expect(l.character.household.independent).toBe(pick === 'leave');
      if (pick === 'stay') expect(l.character.household.stayUntil).toBe(20);
    }
  });

  it('G3: hạn hán chỉ hỏi người có ruộng ở quận bị hạn, đúng tháng phát', () => {
    const s = snap((c, x) => { x.economy.counties[0]!.disaster = 'drought'; x.economy.counties[0]!.disasterMonth = 6; });
    const june = 5 * 3; // tick đầu tháng Sáu của năm 1
    expect(def('event.drought').weight(ctxOf(s, june + 20 * 36))).toBe(0); // chưa làm ruộng
    s.character.household.farmWeeks = 6; s.character.household.farmCounty = 0;
    expect(def('event.drought').weight(ctxOf(s, june + 20 * 36))).toBeGreaterThan(0);
    expect(def('event.drought').weight(ctxOf(s, june + 3 + 20 * 36))).toBe(0); // tháng Bảy: đã qua
  });
});

describe('tai họa theo quận (G3)', () => {
  it('năm xấu được gọi tên, tháng phát đúng mùa; thời tiết không đổi; tất định', () => {
    const a = createEconomy(region, 0), b = createEconomy(region, 0);
    const ra = Rng.fromSeed(4), rb = Rng.fromSeed(4);
    let named = 0;
    for (let y = 0; y < 80; y++) {
      rollWeather(a, ra); rollWeather(b, rb);
      const weather = a.counties.map((c) => c.weatherPct);
      labelDisasters(a, ra, y * 36); labelDisasters(b, rb, y * 36);
      expect(a.counties.map((c) => c.weatherPct)).toEqual(weather);
      for (const c of a.counties) {
        expect(c.disaster !== null).toBe(c.weatherPct <= DISASTER_WEATHER_PCT);
        if (c.disaster) { named++; const [lo, hi] = DISASTER_MONTHS[c.disaster]; expect(c.disasterMonth).toBeGreaterThanOrEqual(lo); expect(c.disasterMonth).toBeLessThanOrEqual(hi); }
        if (c.epidemicFrom >= 0) expect(c.epidemicUntil - c.epidemicFrom).toBe(9);
      }
    }
    expect(named).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  it('dịch làm dễ mắc bệnh hơn; phòng rồi thì như thường', () => {
    const count = (epidemic: boolean) => {
      let n = 0;
      for (let i = 0; i < 400; i++) {
        const c = snap().character;
        eventsPhase(c, 20 * 36 + 3, Rng.fromSeed(i), Rng.fromSeed(i + 9999), () => {}, epidemic);
        if (c.conditions.some((x) => x.kind === 'illness')) n++;
      }
      return n;
    };
    expect(count(true)).toBeGreaterThan(count(false) * 2);
    const s = snap((c, x) => { x.economy.counties[0]!.epidemicFrom = 0; x.economy.counties[0]!.epidemicUntil = 9_999; c.household.shieldUntil = 9_999; });
    expect(epidemicAt(s.economy.counties[0]!, s.tick)).toBe(true);
    expect(def('event.epidemic').weight(ctxOf(s))).toBe(0); // đã phòng thì không hỏi nữa
  });
});

describe('mùa vụ: cứu được phần thiệt, tô tăng', () => {
  it('gánh nước cứu nửa phần thiệt; tô tăng thêm; cả hai hết sau mùa gặt', () => {
    const run = (relief: number, hike: number) => {
      const s = snap((c) => { c.skillXp.farming = 0; c.household = { ...c.household, farmWeeks: 10, farmCounty: 0, tenure: 'tenant', reliefPct: relief, rentHikePct: hike }; });
      s.economy.counties[0]!.weatherPct = 50;
      const r = harvestPlayer(s.character, s.economy, region);
      expect([s.character.household.reliefPct, s.character.household.rentHikePct]).toEqual([0, 0]);
      return r;
    };
    // Thời tiết 50%: mỗi tuần công 25 thăng; cứu nửa phần thiệt thành 75% = 37 thăng (sim làm tròn từng tuần)
    expect(run(0, 0).gross).toBe(10 * 25);
    expect(run(50, 0).gross).toBe(10 * 37);
    expect(run(0, 10).rent).toBe((10 * 25 * 60) / 100);
  });
});

describe('nợ vay nặng lãi', () => {
  it('tới hạn: trả tiền trước, thiếu thì lấy lương, còn thiếu thì khất năm sau lãi 36%; sổ cái không thủng', () => {
    const paid = Life.restore(snap((c) => { c.household = { ...c.household, independent: true, money: 500, grain: 1_000, loan: 408, loanDue: 20 * 36 + 3 }; }), [], region);
    const total = paid.totalMoney();
    while (paid.tick % 3 !== 0) paid.advance('week');
    paid.advance('week');
    expect(paid.character.household.loan).toBe(0);
    expect(paid.character.household.money).toBe(500 - 408);
    expect(paid.totalMoney()).toBe(total);

    const broke = Life.restore(snap((c) => { c.household = { ...c.household, independent: true, money: 100, grain: 0, loan: 408, loanDue: 20 * 36 + 3 }; }), [], region);
    while (broke.tick % 3 !== 0) broke.advance('week');
    broke.advance('week');
    expect(broke.character.household.loan).toBe(Math.trunc((308 * 136) / 100));
    expect(broke.character.household.loanDue).toBeGreaterThan(20 * 36 + 3);
    expect(broke.log.some((e) => e.key === 'log.loan.rolled')).toBe(true);
  });

  it('vay: tiền lấy từ quỹ quận nhà, nợ gồm lãi, hạn một năm', () => {
    const s = snap((c) => { c.household = { ...c.household, money: 0, grain: 0, hunger: 2 }; });
    const ctx = ctxOf(s);
    expect(def('event.usurer').weight(ctx)).toBeGreaterThan(0);
    const fund = s.economy.counties[0]!.money;
    def('event.usurer').choices[0]!.apply(ctx, Rng.fromSeed(1));
    expect(s.character.household).toMatchObject({ money: 300, loan: 408, loanDue: s.tick + 36 });
    expect(s.economy.counties[0]!.money).toBe(fund - 300);
  });
});

describe('lập thân "ở lại" (ADR 0013)', () => {
  it('mỗi đầu năm nửa túi về quận nhà; tới hai mươi tuổi ra riêng với phần chia lớn hơn', () => {
    const s = snap((c) => { c.background = 'commoner'; c.household = { ...c.household, money: 400, grain: 100, stayUntil: 20 }; });
    s.tick = 19 * 36; // tuần đầu năm, mười chín tuổi
    const l = Life.restore(s, [], region);
    autoAdvance(l, 'week', lastChoice);
    expect([l.character.household.money, l.character.household.grain]).toEqual([200, 50]);
    expect(l.character.household.independent).toBe(false);
    for (let k = 0; k < 60 && !l.character.household.independent; k++) autoAdvance(l, 'week', lastChoice);
    expect(l.character.household).toMatchObject({ independent: true, landMu: 6, tenure: 'owner', stayUntil: 0 });
    expect(l.log.some((e) => e.key === 'log.coming_of_age.leave_late')).toBe(true);
  });
});
