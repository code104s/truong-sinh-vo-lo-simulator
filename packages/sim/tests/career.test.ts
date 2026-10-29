// v0.7 S1: khung nghề — bảng nghề chung với NPC, xin học việc, lên bậc, rời nghề, đổi nghề (ADR 0020 Q1).
import { CAREERS, birthplaceId, regionId, type MonthPlan } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { describe, expect, it } from 'vitest';
import { Life, Rng } from '../src/index';
import { autoAdvance, lastChoice } from './auto';
import {
  apprenticeAct, apprenticeLock, CAREER_DEFS, CAREER_YEAR_WEEKS, careerOfOccupation, careerWorked, careerYear, enterCareer, entryGift,
  legacyCareers, MENTOR_MIN_CLOSENESS, type ApprenticeWorld,
} from '../src/life/career';
import type { LifeSnapshot } from '../src/life/life';
import { vLifeSnapshot } from '../src/life/validate';
import { ATONE_FEE } from '../src/life/wayward';
import { bondOf, ensureBond } from '../src/social/bonds';

const region: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [0, 1].map((worldIndex) => ({ worldIndex, area: 100, seat: { x: worldIndex, y: 0 }, name: `Quận ${worldIndex}` })),
  settlementKind: ['village', 'town'], adjacency: [[0, 1]], terrainPct: [100], fertilityPct: [100, 100], seatKm: [[0, 60], [60, 0]],
};
const bp = { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village' as const, cell: { x: 0, y: 0 }, county: 0 };

/** Người chơi 20 tuổi đã ra riêng, đủ tiền lương; cha (nông dân trong làng) làm thầy được; một người lạ cùng quận. */
function adult(seed = 'career') {
  const s = Life.create({ worldSeed: seed, regionId: regionId('r0'), birthplaceId: bp.id }, bp, region).snapshot();
  s.character.birthTick = 0; s.tick = 20 * 36 + 1;
  Object.assign(s.character.household, { independent: true, money: 2_000, grain: 500 });
  s.character.health = s.character.healthMax = 1000; s.character.stamina = 900; s.character.conditions = [];
  s.events.once.push('event.coming_of_age');
  const father = s.npcs.people.find((n) => n.id === s.character.kin.father)!;
  Object.assign(father, { occupation: 'farmer', death: null });
  father.character.location = 0;
  const kin = new Set([s.character.kin.father, s.character.kin.mother]);
  const other = s.npcs.people.find((n) => !n.death && n.character.location === 0 && n.character.household.independent && !kin.has(n.id) && n.character.birthTick <= 0)!;
  return { s, father, other };
}
const plan = (action: string, person?: string): MonthPlan => ({ slots: [0, 1, 2].map(() => (person ? { action, person } : { action })) as MonthPlan['slots'] });
const always = { chance: () => true } as unknown as Rng;
const never = { chance: () => false } as unknown as Rng;
const world = (s: LifeSnapshot, rng: Rng = always): ApprenticeWorld => ({ career: s.career, careers: s.careers, npcs: s.npcs, bonds: s.bonds, reputation: s.reputation, tick: s.tick, rng });
const noLog = () => {};

describe('bảng nghề chung với NPC (v0.7 S1)', () => {
  it('chín nghề đều có trong bảng; nghề NPC quy ra nghề người chơi', () => {
    expect(Object.keys(CAREER_DEFS).sort()).toEqual([...CAREERS].sort());
    expect(careerOfOccupation('farmer')).toBe('farmer');
    expect(careerOfOccupation('laborer')).toBe('artisan');
    expect(careerOfOccupation('official')).toBe('soldier');
    expect(careerOfOccupation('bandit')).toBe('outlaw');
    expect(careerOfOccupation('teacher')).toBeNull();
    expect(careerOfOccupation('child')).toBeNull();
    // Học qua thầy: năm nghề; sai dịch, theo cướp qua thế lực; lưu lạc, ẩn dật tự vào (S4, S6)
    expect(CAREERS.filter((id) => CAREER_DEFS[id].entry === 'mentor')).toEqual(['farmer', 'artisan', 'hunter', 'merchant', 'physician']);
  });
});

describe('xin học việc (v0.7 S1)', () => {
  it('khóa: người vắng, người không dạy nghề, người lạ chưa quen, thiếu lễ; người thân không cần quen', () => {
    const { s, father, other } = adult();
    const c = s.character;
    expect(apprenticeLock({ action: 'action.apprentice', person: 'n99999' }, c, world(s))).toBe('lock.person_away');
    expect(apprenticeLock({ action: 'action.apprentice', person: father.id }, c, world(s))).toBeNull();
    other.occupation = 'teacher';
    expect(apprenticeLock({ action: 'action.apprentice', person: other.id }, c, world(s))).toBe('lock.not_master');
    other.occupation = 'hunter';
    expect(apprenticeLock({ action: 'action.apprentice', person: other.id }, c, world(s))).toBe('lock.stranger');
    ensureBond(s.bonds, other.id).closeness = MENTOR_MIN_CLOSENESS;
    expect(apprenticeLock({ action: 'action.apprentice', person: other.id }, c, world(s))).toBeNull();
    c.household.money = entryGift(c, other) - 1;
    expect(apprenticeLock({ action: 'action.apprentice', person: other.id }, c, world(s))).toBe('lock.money');
    // Cha dạy con không lấy lễ: không tiền vẫn xin được
    c.household.money = 0;
    expect(entryGift(c, father)).toBe(0);
    expect(apprenticeLock({ action: 'action.apprentice', person: father.id }, c, world(s))).toBeNull();
    // Đã là thầy mình thì học tiếp, không cần lễ
    s.career = { id: 'hunter', rank: 'apprentice', since: 0, faction: null, mentor: other.id, years: 0, weeks: 0, idle: 0 };
    expect(apprenticeLock({ action: 'action.apprentice', person: other.id }, c, world(s))).toBeNull();
    other.character.location = 1;
    expect(apprenticeLock({ action: 'action.apprentice', person: other.id }, c, world(s))).toBe('lock.person_away');
  });

  it('theo cha học nghề nông: không mất lễ, vào nghề bậc học việc, kỹ năng lên nhanh; sổ cái giữ; lưu/tải cùng digest', () => {
    const { s, father } = adult();
    const l = Life.restore(s, [], region);
    const total = l.totalMoney(), xp = s.character.skillXp.farming;
    expect(l.setPlan(plan('action.apprentice', father.id))).toBe(true);
    autoAdvance(l, 'week', lastChoice);
    const after = l.snapshot();
    expect(after.career).toMatchObject({ id: 'farmer', rank: 'apprentice', mentor: father.id, weeks: 1 });
    expect(l.view().career).toEqual({ id: 'farmer', rank: 'apprentice', since: s.tick, mentor: { id: father.id, name: father.character.name, alive: true }, years: 0, leave: {} });
    // F1: việc của nghề nông tính năm làm nghề; việc riêng nghề khác ghi tên nghề
    const opts = l.actions();
    expect(opts.filter((a) => a.careerWork).map((a) => a.id)).toEqual(['action.farm']);
    expect(opts.find((a) => a.id === 'action.trap')).toMatchObject({ career: 'hunter', locked: 'lock.career' });
    expect(opts.find((a) => a.id === 'action.hunt')!.career).toBeUndefined();
    expect(after.character.skillXp.farming - xp).toBeGreaterThan(35);
    expect(l.log.some((e) => e.key === 'log.career.enter')).toBe(true);
    expect(l.log.some((e) => e.key === 'log.career.gift')).toBe(false);
    expect(l.totalMoney()).toBe(total);
    expect(vLifeSnapshot.check(JSON.parse(JSON.stringify(after)), '$')).toBeNull();
    autoAdvance(l, 'week', lastChoice);
    expect(l.snapshot().career!.weeks).toBe(2);
    // Lưu giữa chừng, tải lại, chạy tiếp: cùng digest với chạy liền
    const mid = Life.restore(JSON.parse(JSON.stringify(l.snapshot())), [], region);
    for (let k = 0; k < 40; k++) { autoAdvance(l, 'week', lastChoice); autoAdvance(mid, 'week', lastChoice); }
    expect(mid.digest()).toBe(l.digest());
  });

  it('bị từ chối: thân thiết −2, không vào nghề, không mất lễ', () => {
    const { s, other } = adult();
    other.occupation = 'hunter';
    const b = ensureBond(s.bonds, other.id);
    b.closeness = 30;
    const money = s.character.household.money;
    const w = world(s, never);
    apprenticeAct({ action: 'action.apprentice', person: other.id }, s.character, w, noLog);
    expect(w.career).toBeNull();
    expect(bondOf(s.bonds, other.id)!.closeness).toBe(28);
    expect(s.character.household.money).toBe(money);
  });

  it('đổi nghề: rời nghề cũ (mất bậc, thầy cũ phật lòng), vào nghề mới ở bậc học việc; đổi thầy cùng nghề thì giữ bậc', () => {
    const { s, father, other } = adult();
    const w = world(s);
    enterCareer(w, 'farmer', 0, { mentor: father.id });
    w.career!.rank = 'journeyman'; w.career!.years = 4;
    const fb = ensureBond(s.bonds, father.id); fb.closeness = 80; fb.trust = 70;
    other.occupation = 'hunter';
    ensureBond(s.bonds, other.id).closeness = 40;
    const otherPurse = other.character.household.money;
    const logs: string[] = [];
    apprenticeAct({ action: 'action.apprentice', person: other.id }, s.character, w, (e) => logs.push(e.key));
    expect(w.career).toMatchObject({ id: 'hunter', rank: 'apprentice', mentor: other.id, years: 0 });
    expect(w.careers).toEqual([{ id: 'farmer', rank: 'journeyman', years: 4 }]);
    expect(bondOf(s.bonds, father.id)).toMatchObject({ closeness: 60, trust: 50 });
    // Thầy người ngoài lấy lễ nhập môn
    expect(other.character.household.money - otherPurse).toBe(entryGift(s.character, other));
    expect(logs).toEqual(['log.career.gift', 'log.career.change']);
    // Cùng nghề, thầy khác: giữ bậc, thầy cũ −10
    w.career!.rank = 'journeyman';
    father.occupation = 'hunter';
    apprenticeAct({ action: 'action.apprentice', person: father.id }, s.character, w, (e) => logs.push(e.key));
    expect(w.career).toMatchObject({ id: 'hunter', rank: 'journeyman', mentor: father.id });
    expect(logs).toContain('log.career.mentor');
    expect(legacyCareers(w)).toEqual([{ id: 'farmer', rank: 'journeyman', years: 4 }, { id: 'hunter', rank: 'journeyman', years: 0, current: true }]);
  });
});

describe('làm nghề, lên bậc, bỏ nghề (v0.7 S1)', () => {
  it('việc của nghề tính vào năm làm nghề; việc nghề khác thì không', () => {
    const { s } = adult();
    const w = world(s);
    enterCareer(w, 'hunter', 0);
    careerWorked(w, 'action.hunt'); careerWorked(w, 'action.forage'); careerWorked(w, 'action.farm');
    expect(w.career!.weeks).toBe(2);
  });

  it('lên bậc khi đủ năm và kỹ năng; thiếu kỹ năng thì chờ', () => {
    const { s } = adult();
    const w = world(s), c = s.character;
    enterCareer(w, 'farmer', 0);
    c.skillXp.farming = 999;
    for (let y = 0; y < 3; y++) { w.career!.weeks = CAREER_YEAR_WEEKS; careerYear(w, c, s.bonds, s.npcs, noLog); }
    expect(w.career).toMatchObject({ rank: 'apprentice', years: 3 });
    c.skillXp.farming = 1_000;
    w.career!.weeks = CAREER_YEAR_WEEKS; careerYear(w, c, s.bonds, s.npcs, noLog);
    expect(w.career).toMatchObject({ rank: 'journeyman', years: 4 });
    c.skillXp.farming = 4_000;
    for (let y = 4; y < 10; y++) { w.career!.weeks = CAREER_YEAR_WEEKS; careerYear(w, c, s.bonds, s.npcs, noLog); }
    expect(w.career).toMatchObject({ rank: 'master', years: 10 });
  });

  it('nghề không có kỹ năng chính lên bậc theo năm làm', () => {
    const { s } = adult();
    const w = world(s);
    enterCareer(w, 'drifter', 0);
    for (let y = 0; y < 3; y++) { w.career!.weeks = CAREER_YEAR_WEEKS; careerYear(w, s.character, s.bonds, s.npcs, noLog); }
    expect(w.career!.rank).toBe('journeyman');
  });

  it('hai năm liền không làm thì bỏ nghề: mất bậc, ghi vào các nghề đã làm, thầy phật lòng', () => {
    const { s, father } = adult();
    const w = world(s);
    enterCareer(w, 'farmer', 0, { mentor: father.id });
    const fb = ensureBond(s.bonds, father.id); fb.closeness = 80; fb.trust = 70;
    const logs: string[] = [];
    w.career!.weeks = CAREER_YEAR_WEEKS - 1; careerYear(w, s.character, s.bonds, s.npcs, (e) => logs.push(e.key));
    expect(w.career).toMatchObject({ idle: 1, weeks: 0 });
    careerYear(w, s.character, s.bonds, s.npcs, (e) => logs.push(e.key));
    expect(w.career).toBeNull();
    expect(w.careers).toEqual([{ id: 'farmer', rank: 'apprentice', years: 0 }]);
    expect(logs).toEqual(['log.career.lapsed']);
    expect(bondOf(s.bonds, father.id)).toMatchObject({ closeness: 60, trust: 50 });
  });

  it('làm ruộng cả tháng thì đếm ô làm nghề; lệnh rời nghề: mất bậc, có trong tổng kết; chưa vào nghề thì bị từ chối', () => {
    const { s, father } = adult();
    s.tick = 20 * 36 + 9; // tháng 4: ruộng không nghỉ đông
    s.career = { id: 'farmer', rank: 'journeyman', since: 0, faction: null, mentor: father.id, years: 5, weeks: 0, idle: 0 };
    const l = Life.restore(s, [], region);
    expect(l.setPlan(plan('action.farm'))).toBe(true);
    autoAdvance(l, 'month', lastChoice);
    expect(l.snapshot().career!.weeks).toBe(3);
    expect(l.leaveCareer()).toBeNull();
    expect(l.view().career).toBeNull();
    expect(l.snapshot().careers).toEqual([{ id: 'farmer', rank: 'journeyman', years: 5 }]);
    expect(l.log.at(-1)!.key).toBe('log.career.leave');
    expect(l.leaveCareer()).toBe('chưa vào nghề nào');
  });
});

describe('bảng chọn nghề, rời nghề mất gì (v0.7 F2)', () => {
  it('đủ chín nghề theo thứ tự; nghề qua thầy kèm thầy ở đây (người thân không lấy lễ, người lạ khóa như ô học việc); không thầy thì khóa', () => {
    const { s, father, other } = adult();
    other.occupation = 'farmer';
    const l = Life.restore(s, [], region);
    const board = l.careerBoard();
    expect(board.map((e) => e.career)).toEqual([...CAREERS]);
    const farm = board.find((e) => e.career === 'farmer')!;
    expect(farm).toMatchObject({ way: 'mentor', action: 'action.apprentice', locked: null });
    expect(farm.mentors.find((m) => m.id === father.id)).toEqual({ id: father.id, gift: 0, locked: null });
    const stranger = farm.mentors.find((m) => m.id === other.id)!;
    expect(stranger.gift).toBeGreaterThan(0);
    expect(stranger.locked).toBe(l.socialLock({ action: 'action.apprentice', person: other.id }));
    expect(stranger.locked).toBe('lock.stranger');
    // Nghề không ai dạy ở quận này
    for (const e of board.filter((x) => x.way === 'mentor' && x.mentors.length === 0)) expect(e.locked).toBe('lock.no_mentor_here');
    // Qua thế lực, tự vào: khóa như việc vào nghề trong bảng chọn việc; theo cướp chỉ qua sự kiện
    const actions = l.actions();
    for (const [career, action] of [['soldier', 'action.enlist'], ['drifter', 'action.drift'], ['recluse', 'action.build_hut']] as const) {
      expect(board.find((e) => e.career === career)).toEqual({ career, way: career === 'soldier' ? 'faction' : 'own', action, mentors: [], locked: actions.find((a) => a.id === action)!.locked });
    }
    expect(board.find((e) => e.career === 'outlaw')).toEqual({ career: 'outlaw', way: 'event', action: null, mentors: [], locked: null });
  });

  it('rời nghề mất gì: nghề thường chỉ bậc và lòng thầy; bỏ nha môn thì quan phủ phật lòng; ra băng chuộc tội nếu đủ tiền, không thì trốn', () => {
    const { s, father } = adult();
    const gov = s.factions.list.find((f) => f.kind === 'government')!;
    const at = (career: LifeSnapshot['career'], money = 2_000) => {
      const x = JSON.parse(JSON.stringify(s)) as LifeSnapshot;
      x.career = career; x.character.household.money = money;
      return Life.restore(x, [], region);
    };
    const k = { rank: 'journeyman' as const, since: 0, mentor: null, years: 4, weeks: 0, idle: 0 };
    expect(at({ ...k, id: 'farmer', faction: null, mentor: father.id }).view().career).toMatchObject({ years: 4, leave: {} });
    expect(at({ ...k, id: 'soldier', faction: gov.id }).view().career!.leave).toEqual({ angers: gov.id });
    expect(at({ ...k, id: 'outlaw', faction: 'f99' }).view().career!.leave).toEqual({ outlaw: { way: 'atone', fee: ATONE_FEE } });
    const poor = at({ ...k, id: 'outlaw', faction: 'f99' }, ATONE_FEE - 1);
    expect(poor.view().career!.leave).toEqual({ outlaw: { way: 'desert', fee: ATONE_FEE } });
    // Lời báo trước khớp với lệnh rời nghề
    expect(poor.leaveCareer()).toBeNull();
    expect(poor.log.some((e) => e.key === 'log.outlaw.desert')).toBe(true);
  });
});
