// Thân phận nghề của người chơi (v0.7, ADR 0020 Q1): nghề, bậc, lúc vào nghề, nơi nhận, thầy. S1: bảng nghề chung với
// NPC, vào nghề bằng xin học việc, lên bậc theo năm làm và kỹ năng, rời nghề, đổi nghề. Thuần, tất định.
import { ageYearsAt, CAREER_RANKS, type CareerId, type CareerLeaveView, type CareerRank, type CareerRecord, type CareerView, type FactionId, type LogEntry, type NpcId, type PlanSlot, type Tick } from '@tsvl/shared';
import type { Rng } from '../core/rng';
import type { CharacterState } from './character';
import type { Skill } from './skills';
import { gainSkill, SKILL_BASE_GAIN } from './skills';
import { GIFT_BY_BACKGROUND } from '../economy/income';
import { kinRole, lookup } from '../npc/family';
import type { NpcState, NpcWorldState, Occupation } from '../npc/state';
import { BOND_MAX, bondOf, ensureBond, type Bond } from '../social/bonds';
import { repAt } from '../social/reputation';

type Log = (e: Omit<LogEntry, 'tick'>) => void;

/**
 * Bảng nghề (Q1, Q3), chung cho người chơi và NPC: nghề NPC tương ứng (thầy dạy nghề, người cùng nghề), kỹ năng chính,
 * việc tính là "làm nghề", cách vào nghề. `mentor`: xin học việc với NPC cùng nghề (S1); `faction`: thế lực nhận (sai
 * dịch S4, theo cướp S6); `own`: tự vào (lưu lạc, ẩn dật S6). NPC làm thuê ở trấn, thành (`laborer`) là thợ thủ công.
 */
export interface CareerDef {
  occupation: Occupation | null;
  skill: Skill | null;
  works: readonly string[];
  entry: 'mentor' | 'faction' | 'own';
}
export const CAREER_DEFS: Readonly<Record<CareerId, CareerDef>> = {
  farmer: { occupation: 'farmer', skill: 'farming', works: ['action.farm'], entry: 'mentor' },
  artisan: { occupation: 'laborer', skill: 'crafting', works: ['action.hire', 'action.craft'], entry: 'mentor' },
  hunter: { occupation: 'hunter', skill: 'hunting', works: ['action.hunt', 'action.forage', 'action.trap'], entry: 'mentor' },
  merchant: { occupation: 'merchant', skill: 'trade', works: ['action.trade', 'action.haul'], entry: 'mentor' },
  physician: { occupation: 'physician', skill: 'medicine', works: ['action.practice'], entry: 'mentor' },
  soldier: { occupation: 'official', skill: 'martial', works: ['action.patrol'], entry: 'faction' },
  // S6: lưu lạc sống dọc đường (đi đường, làm thuê, săn, hái lượm); ẩn dật tự cung quanh lều; theo cướp ngày thường hái lượm, luyện võ
  drifter: { occupation: null, skill: null, works: ['action.travel', 'action.hire', 'action.hunt', 'action.forage'], entry: 'own' },
  recluse: { occupation: null, skill: 'hunting', works: ['action.forage', 'action.hunt', 'action.farm'], entry: 'own' },
  outlaw: { occupation: 'bandit', skill: 'martial', works: ['action.forage', 'action.hunt', 'action.train'], entry: 'faction' },
};

/** Nghề của một NPC theo bảng chung; trẻ con, thầy đồ (v0.8) không có nghề người chơi. */
export function careerOfOccupation(o: Occupation): CareerId | null {
  for (const [id, d] of Object.entries(CAREER_DEFS) as [CareerId, CareerDef][]) if (d.occupation === o) return id;
  return null;
}

/**
 * Lên bậc (Q1) đầu năm: đủ số năm làm nghề và kỹ năng chính (nghề không có kỹ năng chính thì chỉ xét năm). Một năm làm
 * nghề là năm có từ 12 ô làm việc của nghề hoặc học việc (một phần ba số ô). Hai năm liền không làm thì coi như bỏ nghề.
 */
export const RANK_RULES: Readonly<Record<Exclude<CareerRank, 'apprentice'>, { years: number; xp: number }>> = {
  journeyman: { years: 3, xp: 1_000 },
  master: { years: 10, xp: 4_000 },
};
export const CAREER_YEAR_WEEKS = 12;
export const CAREER_IDLE_YEARS = 2;

/** Thầy: NPC cùng nghề từ 25 tuổi. Người lạ phải quen biết (thân thiết từ 20) mới xin được; người thân thì không cần. */
export const MENTOR_MIN_AGE = 25;
export const MENTOR_MIN_CLOSENESS = 20;
/** Lễ nhập môn: ba lần quà thăm hỏi theo xuất thân, vào túi thầy; người thân dạy nghề cho con cháu thì không lấy lễ. */
export const ENTRY_GIFT_TIMES = 3;
/** Nhận học trò (ppm) = 200.000 + thân thiết × 6.000 + tin cậy × 4.000 − thù hận × 8.000 + tiếng tăm × 3.000 (+300.000 nếu là người thân). */
const ACCEPT_PPM = { base: 200_000, closeness: 6_000, trust: 4_000, hostility: 8_000, rep: 3_000, kin: 300_000 } as const;
/** Xác suất được nhận (ppm) theo quan hệ: dùng cho xin học việc và xin vào thương hội (S3). */
export const acceptPpm = (b: Bond, rep: number, kin: boolean): number =>
  ACCEPT_PPM.base + b.closeness * ACCEPT_PPM.closeness + b.trust * ACCEPT_PPM.trust - b.hostility * ACCEPT_PPM.hostility + rep * ACCEPT_PPM.rep + (kin ? ACCEPT_PPM.kin : 0);
/** Bị từ chối: thân thiết −2. Mỗi ô học việc: thân thiết, tin cậy +1; kỹ năng chính lên gấp đôi ô làm thường. */
const REFUSED_CLOSENESS = 2;
const LESSON_BOND = 1;
const LESSON_GAIN = SKILL_BASE_GAIN * 2;
/** Rời nghề, đổi nghề: thầy cũ phật lòng (thân thiết, tin cậy −20); đổi thầy trong cùng nghề: −10. */
const LEAVE_BOND = 20;
const SWITCH_BOND = 10;

export interface CareerState {
  id: CareerId;
  rank: CareerRank;
  /** Tick vào nghề. */
  since: Tick;
  /** Thế lực nhận người chơi (thương hội, nha môn, băng cướp); null nếu nghề không gắn thế lực. */
  faction: FactionId | null;
  /** Thầy đang theo học; null nếu vào nghề không qua thầy. Thầy mất, đi xa thì id vẫn giữ (ô học việc bị khóa). */
  mentor: NpcId | null;
  /** Số năm đã làm nghề (năm đủ ô), số ô làm nghề trong năm nay, số năm liền không làm. */
  years: number;
  weeks: number;
  idle: number;
}

/** Nghề của người chơi: thân phận hiện tại và các nghề đã rời (cho tổng kết đời, F4). */
export interface CareerWorld {
  career: CareerState | null;
  careers: CareerRecord[];
}

/** Bậc trong một nghề cho việc của nghề ấy (S2): không làm nghề ấy hay học việc 0, làm được 1, có tiếng 2. */
export function rankStep(k: CareerState | null | undefined, id: CareerId): 0 | 1 | 2 {
  if (!k || k.id !== id) return 0;
  return k.rank === 'master' ? 2 : k.rank === 'journeyman' ? 1 : 0;
}

/** Đủ bậc để làm việc riêng của nghề không (S2): đúng nghề, từ bậc `min` trở lên. */
export function hasRank(k: CareerState | null | undefined, id: CareerId, min: CareerRank): boolean {
  return !!k && k.id === id && CAREER_RANKS.indexOf(k.rank) >= CAREER_RANKS.indexOf(min);
}

/** Bỏ nha môn, bỏ hội (S7): thế lực nhận mình phật lòng. Nghề khác không gắn thế lực, hay theo cướp (ra băng riêng), thì null. */
export function leaveAngers(k: CareerState): FactionId | null {
  return (k.id === 'soldier' || k.id === 'merchant') && k.faction ? k.faction : null;
}

/**
 * Thân phận nghề như người chơi thấy; null khi chưa vào nghề. Thầy đã mất quá một năm (sim không giữ nữa) thì bỏ.
 * `leave`: rời nghề lúc này mất gì ngoài bậc và lòng thầy (F2), do đời người chơi tính.
 */
export function careerView(c: CareerState | null, npcs: NpcWorldState, leave: CareerLeaveView = {}): CareerView | null {
  if (!c) return null;
  const m = c.mentor ? lookup(npcs).get(c.mentor) : undefined;
  return {
    id: c.id, rank: c.rank, since: c.since, ...(c.faction ? { faction: c.faction } : {}),
    ...(m ? { mentor: { id: m.id, name: m.character.name, alive: m.death === null } } : {}),
    years: c.years, leave,
  };
}

/** Một đời làm nghề: các nghề đã rời rồi nghề đang làm (ghi `current`, F4). */
export function legacyCareers(w: CareerWorld): CareerRecord[] {
  return [...w.careers.map((r) => ({ ...r })), ...(w.career ? [{ id: w.career.id, rank: w.career.rank, years: w.career.years, current: true as const }] : [])];
}

export const entryGift = (c: CharacterState, mentor: NpcState): number => (kinRole(c, mentor) ? 0 : GIFT_BY_BACKGROUND[c.background] * ENTRY_GIFT_TIMES);

/** Vào nghề ở bậc học việc (Q1: mỗi lúc một nghề; đang làm nghề khác thì rời trước). */
export function enterCareer(w: CareerWorld, id: CareerId, tick: Tick, opts: { mentor?: NpcId; faction?: FactionId } = {}): void {
  w.career = { id, rank: 'apprentice', since: tick, faction: opts.faction ?? null, mentor: opts.mentor ?? null, years: 0, weeks: 0, idle: 0 };
}

/** Rời nghề: mất bậc (quay lại phải học việc lại), thầy phật lòng. Ghi vào các nghề đã làm. */
export function leaveCareer(w: CareerWorld, bonds: Bond[], npcs: NpcWorldState): CareerState | null {
  const old = w.career;
  if (!old) return null;
  w.careers.push({ id: old.id, rank: old.rank, years: old.years });
  w.career = null;
  if (old.mentor) cool(bonds, npcs, old.mentor, LEAVE_BOND);
  return old;
}

/** Người ấy dạy được nghề gì; null nếu không phải thầy (nghề không học qua thầy, chưa đủ tuổi). */
export function mentorCareer(n: NpcState, tick: Tick): CareerId | null {
  const id = careerOfOccupation(n.occupation);
  if (!id || CAREER_DEFS[id].entry !== 'mentor' || ageYearsAt(n.character.birthTick, tick) < MENTOR_MIN_AGE) return null;
  return id;
}

export interface ApprenticeWorld extends CareerWorld {
  npcs: NpcWorldState;
  bonds: Bond[];
  reputation: readonly number[];
  tick: Tick;
  rng: Rng;
}

/** Tra người theo id qua bảng đệm (bảng chọn người xét khóa cho từng người trong quận mỗi tuần). */
const personOf = (w: Pick<ApprenticeWorld, 'npcs'>, slot: PlanSlot): NpcState | null =>
  (slot.person === undefined ? null : lookup(w.npcs).get(slot.person) ?? null);

/** Khóa riêng của ô học việc: người ấy có ở đây, có dạy được nghề không; xin lần đầu thì phải quen biết và đủ lễ. */
export function apprenticeLock(slot: PlanSlot, c: CharacterState, w: ApprenticeWorld): string | null {
  const n = personOf(w, slot);
  if (!n || n.death || n.character.location !== c.location) return 'lock.person_away';
  if (!mentorCareer(n, w.tick)) return 'lock.not_master';
  if (w.career?.mentor === n.id) return null;
  if (!kinRole(c, n) && (bondOf(w.bonds, n.id)?.closeness ?? 0) < MENTOR_MIN_CLOSENESS) return 'lock.stranger';
  return c.household.money < entryGift(c, n) ? 'lock.money' : null;
}

/**
 * Một ô học việc (thể lực, rủi ro đã trừ theo luật chung). Người chưa là thầy mình thì đây là lần xin: rút một lần trên
 * luồng `social`; nhận thì nộp lễ, vào nghề (hoặc đổi thầy, đổi nghề). Đã là thầy thì học: kỹ năng chính lên nhanh,
 * thầy trò thân hơn, tính là một ô làm nghề.
 */
export function apprenticeAct(slot: PlanSlot, c: CharacterState, w: ApprenticeWorld, log: Log): void {
  const n = personOf(w, slot);
  const id = n ? mentorCareer(n, w.tick) : null;
  if (!n || !id) return;
  const rep = repAt(w.reputation, c.location);
  const b = ensureBond(w.bonds, n.id, rep);
  if (w.career?.mentor !== n.id) {
    if (!w.rng.chance(acceptPpm(b, rep, kinRole(c, n) !== null))) {
      b.closeness = Math.max(0, b.closeness - REFUSED_CLOSENESS);
      log({ key: 'log.career.refused', params: { name: n.character.name, career: `career.${id}` }, importance: 'major' });
      return;
    }
    const gift = Math.min(entryGift(c, n), c.household.money);
    c.household.money -= gift; n.character.household.money += gift;
    if (gift > 0) log({ key: 'log.career.gift', params: { name: n.character.name, coin: gift }, importance: 'minor' });
    if (w.career?.id === id) {
      // Đổi thầy trong cùng nghề: giữ bậc, thầy cũ phật lòng ít hơn
      if (w.career.mentor) cool(w.bonds, w.npcs, w.career.mentor, SWITCH_BOND);
      w.career.mentor = n.id;
      log({ key: 'log.career.mentor', params: { name: n.character.name, career: `career.${id}` }, importance: 'major' });
    } else {
      const old = leaveCareer(w, w.bonds, w.npcs);
      enterCareer(w, id, w.tick, { mentor: n.id });
      const params = { name: n.character.name, career: `career.${id}` };
      log(old ? { key: 'log.career.change', params: { ...params, old: `career.${old.id}` }, importance: 'major' } : { key: 'log.career.enter', params, importance: 'major' });
    }
  }
  const skill = CAREER_DEFS[id].skill;
  if (skill) gainSkill(c, skill, w.tick, LESSON_GAIN);
  b.closeness = Math.min(BOND_MAX, b.closeness + LESSON_BOND);
  b.trust = Math.min(BOND_MAX, b.trust + LESSON_BOND);
  w.career!.weeks++;
}

/** Ô vừa làm (không bị khóa) có phải việc của nghề đang làm không: tính vào năm làm nghề. Học việc tính ở `apprenticeAct`. */
export function careerWorked(w: CareerWorld, action: string): void {
  if (w.career && CAREER_DEFS[w.career.id].works.includes(action)) w.career.weeks++;
}

/**
 * Đầu năm: năm vừa qua đủ ô thì cộng một năm làm nghề, rồi xét lên bậc; hai năm liền không làm thì bỏ nghề (mất bậc, thầy
 * phật lòng). Không rút RNG.
 */
export function careerYear(w: CareerWorld, c: CharacterState, bonds: Bond[], npcs: NpcWorldState, log: Log): void {
  const k = w.career;
  if (!k) return;
  if (k.weeks >= CAREER_YEAR_WEEKS) { k.years++; k.idle = 0; } else k.idle++;
  k.weeks = 0;
  if (k.idle >= CAREER_IDLE_YEARS) {
    leaveCareer(w, bonds, npcs);
    log({ key: 'log.career.lapsed', params: { career: `career.${k.id}` }, importance: 'major' });
    return;
  }
  const next: CareerRank | null = k.rank === 'apprentice' ? 'journeyman' : k.rank === 'journeyman' ? 'master' : null;
  if (!next) return;
  const rule = RANK_RULES[next as Exclude<CareerRank, 'apprentice'>];
  const skill = CAREER_DEFS[k.id].skill;
  if (k.years < rule.years || (skill && c.skillXp[skill] < rule.xp)) return;
  k.rank = next;
  log({ key: 'log.career.rank', params: { career: `career.${k.id}`, rank: `career.rank.${next}` }, importance: 'major' });
}

/** Thầy cũ phật lòng: thân thiết, tin cậy giảm (người đã mất, đã dọn khỏi danh sách thì thôi). */
function cool(bonds: Bond[], npcs: NpcWorldState, id: NpcId, by: number): void {
  const n = npcs.people.find((x) => x.id === id);
  if (!n || n.death) return;
  const b = ensureBond(bonds, id);
  b.closeness = Math.max(0, b.closeness - by);
  b.trust = Math.max(0, b.trust - by);
}
