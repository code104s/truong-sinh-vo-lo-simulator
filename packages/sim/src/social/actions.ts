// Hành động xã giao của người chơi (v0.5 S4, ADR 0017 Q7): thăm hỏi, nhờ cậy, cưới hỏi (S5) — nhắm vào một người cùng
// quận (`PlanSlot.person`). Quan hệ phai dần theo năm. Thuần, tất định; ngẫu nhiên qua luồng `social`.
import { ageYearsAt, type LogEntry, type PlanSlot, type Tick } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import type { Rng } from '../core/rng';
import type { CharacterState } from '../life/character';
import { GIFT_BY_BACKGROUND } from '../economy/income';
import { kinRole, KIN_KEEP_GRAIN, lookup, playerStandIn, single, SPOUSE_AGE_GAP } from '../npc/family';
import { MARRY_AGE, wedPlayer } from '../npc/lifecycle';
import type { NpcState, NpcWorldState } from '../npc/state';
import { BOND_MAX, bondOf, ensureBond, type Bond } from './bonds';
import { repAt } from './reputation';

type Log = (e: Omit<LogEntry, 'tick'>) => void;

export { GIFT_BY_BACKGROUND };
export const giftOf = (c: CharacterState): number => GIFT_BY_BACKGROUND[c.background];

/** Thăm hỏi: thân thiết tăng chậm dần (dưới 50: +10, dưới 80: +5, từ 80: +2); tin cậy +3; thù hận −5; trả bớt nợ ơn +5. */
const VISIT_CLOSENESS: readonly (readonly [number, number])[] = [[50, 10], [80, 5], [BOND_MAX + 1, 2]];
const VISIT_TRUST = 3, VISIT_HOSTILITY = 5, VISIT_REPAY = 5;
/** Nhờ cậy chỉ với người đã quen biết (thân thiết từ 20) hoặc người thân. */
export const ASK_MIN_CLOSENESS = 20;
/** Xác suất nhận lời (ppm) = thân thiết × 6.000 + tin cậy × 4.000 − thù hận × 8.000 − phần mình đang nợ × 5.000 (+300.000 nếu là người thân). */
const ASK_PPM = { closeness: 6_000, trust: 4_000, hostility: 8_000, debt: 5_000, kin: 300_000 } as const;
/** Mỗi lần giúp: tối đa 4 tuần ăn (lương trên một năm ăn của người giúp), không có lương dư thì tối đa 200 văn (tiền trên 300). */
export const ASK_GRAIN = 40;
export const ASK_MONEY = 200;
const HELPER_KEEP_MONEY = 300;
/** Được giúp: mình nợ ơn thêm 15, thân thiết +2; bị từ chối: thân thiết −2. */
const HELPED_DEBT = 15, HELPED_CLOSENESS = 2, REFUSED_CLOSENESS = 2;
/** Tiếng tăm ở quận đang đứng cộng vào xác suất nhận lời nhờ cậy, cưới hỏi (ppm mỗi điểm, S6): tiếng 50 → +15%. */
const REP_PPM = 3_000;
/** Cưới hỏi: bên kia cần coi mình là "bạn" trở lên (thân thiết từ 50). */
export const PROPOSE_MIN_CLOSENESS = 50;
/** Xác suất nhận lời (ppm) = thân thiết × 8.000 + tin cậy × 4.000 − thù hận × 10.000. Bị từ chối: thân thiết −5. */
const PROPOSE_PPM = { closeness: 8_000, trust: 4_000, hostility: 10_000 } as const;
const PROPOSE_REFUSED_CLOSENESS = 5;
/** Nên vợ nên chồng: thân thiết +10, tin cậy +10. */
const WED_CLOSENESS = 10, WED_TRUST = 10;
/** Phai mỗi năm: thân thiết −5 (người thân không dưới 50), tin cậy −3, thù hận −2; nợ ơn để quá một năm: tin cậy −10. */
const FADE = { closeness: 5, trust: 3, hostility: 2, debtTrust: 10, kinFloor: 50 } as const;
const OWING = -20;

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

/** Người chơi và thế giới quanh mình, cho hành động xã giao. */
export interface SocialWorld {
  npcs: NpcWorldState;
  bonds: Bond[];
  rng: Rng;
  /** Cho cưới hỏi (S5): tuổi lúc này, quận nhà và trần dân số khi chuyển nhà. */
  tick?: Tick;
  logic?: RegionLogic;
  /** Tiếng tăm của người chơi theo quận (S6). */
  reputation?: readonly number[];
}

const personOf = (w: SocialWorld, slot: PlanSlot): NpcState | null =>
  (slot.person === undefined ? null : w.npcs.people.find((n) => n.id === slot.person) ?? null);

/** Khóa riêng của ô xã giao: người ấy đã mất, không có, hay không ở cùng quận; nhờ cậy cần đã quen biết. */
export function socialLock(slot: PlanSlot, c: CharacterState, w: SocialWorld): string | null {
  const n = personOf(w, slot);
  if (!n || n.death || n.character.location !== c.location) return 'lock.person_away';
  if (slot.action === 'action.ask_help' && !kinRole(c, n) && (bondOf(w.bonds, n.id)?.closeness ?? 0) < ASK_MIN_CLOSENESS) return 'lock.stranger';
  if (slot.action === 'action.propose') return marryLock(c, n, w);
  return null;
}

/**
 * Cưới hỏi được không (S5), cùng luật ghép đôi của NPC (Q3): mình đã ra riêng, chưa có vợ/chồng còn sống; người kia
 * khác giới, không phải người thân, chưa có gia đình, đã ra riêng; cả hai 18–35 tuổi, chồng hơn vợ từ −3 tới 12 tuổi;
 * người kia coi mình là "bạn" trở lên.
 */
export function marryLock(c: CharacterState, n: NpcState, w: Pick<SocialWorld, 'npcs' | 'bonds' | 'tick'>): string | null {
  const byId = lookup(w.npcs), t = w.tick ?? 0;
  if (!c.household.independent) return 'lock.dependent';
  if (!single(playerStandIn(c), byId)) return 'lock.married';
  const age = (x: CharacterState) => ageYearsAt(x.birthTick, t);
  const inAge = (x: CharacterState) => age(x) >= MARRY_AGE[0] && age(x) <= MARRY_AGE[1];
  const [husband, wife] = c.gender === 'male' ? [c, n.character] : [n.character, c];
  const gap = age(husband) - age(wife);
  if (n.character.gender === c.gender || kinRole(c, n) || !single(n, byId) || !n.character.household.independent
    || !inAge(c) || !inAge(n.character) || gap < SPOUSE_AGE_GAP[0] || gap > SPOUSE_AGE_GAP[1]) return 'lock.no_match';
  if ((bondOf(w.bonds, n.id)?.closeness ?? 0) < PROPOSE_MIN_CLOSENESS) return 'lock.not_close';
  return null;
}

/** Tác dụng lên quan hệ của một ô xã giao đã làm (thể lực, rủi ro đã trừ theo luật chung). */
export function socialAct(slot: PlanSlot, c: CharacterState, w: SocialWorld, log: Log): void {
  const n = personOf(w, slot);
  if (!n) return;
  const rep = repAt(w.reputation ?? [], c.location);
  const b = ensureBond(w.bonds, n.id, rep);
  if (slot.action === 'action.visit') {
    const gift = Math.min(giftOf(c), c.household.money);
    c.household.money -= gift; n.character.household.money += gift;
    b.closeness = clamp(b.closeness + VISIT_CLOSENESS.find(([below]) => b.closeness < below)![1], 0, BOND_MAX);
    b.trust = clamp(b.trust + VISIT_TRUST, 0, BOND_MAX);
    b.hostility = clamp(b.hostility - VISIT_HOSTILITY, 0, BOND_MAX);
    if (b.owed < 0) b.owed = Math.min(0, b.owed + VISIT_REPAY);
    log({ key: 'log.social.visit', params: { name: n.character.name, gift }, importance: 'minor' });
    return;
  }
  if (slot.action === 'action.ask_help') {
    const ppm = b.closeness * ASK_PPM.closeness + b.trust * ASK_PPM.trust - b.hostility * ASK_PPM.hostility
      - Math.max(0, -b.owed) * ASK_PPM.debt + (kinRole(c, n) ? ASK_PPM.kin : 0) + rep * REP_PPM;
    const nh = n.character.household, h = c.household;
    const grain = Math.min(ASK_GRAIN, Math.max(0, nh.grain - KIN_KEEP_GRAIN));
    const money = grain > 0 ? 0 : Math.min(ASK_MONEY, Math.max(0, nh.money - HELPER_KEEP_MONEY));
    // Rút một lần dù kết quả thế nào, để nhịp luồng không phụ thuộc kho người kia
    const yes = w.rng.chance(ppm);
    if (!yes || (grain === 0 && money === 0)) {
      b.closeness = clamp(b.closeness - REFUSED_CLOSENESS, 0, BOND_MAX);
      log({ key: yes ? 'log.social.cannot_help' : 'log.social.refused', params: { name: n.character.name }, importance: 'minor' });
      return;
    }
    nh.grain -= grain; h.grain += grain;
    nh.money -= money; h.money += money;
    b.owed = clamp(b.owed - HELPED_DEBT, -BOND_MAX, BOND_MAX);
    b.closeness = clamp(b.closeness + HELPED_CLOSENESS, 0, BOND_MAX);
    // Người giúp cho lương, hoặc (hết lương dư) cho tiền: tin nói đúng thứ nhận được
    log({ key: grain > 0 ? 'log.social.helped_grain' : 'log.social.helped_money', params: { name: n.character.name, dou: Math.floor(grain / 10), coin: money }, importance: 'major' });
    return;
  }
  if (slot.action === 'action.propose' && w.logic) {
    // Khóa xét lúc đầu tuần; rút một lần dù kết quả thế nào
    const ppm = b.closeness * PROPOSE_PPM.closeness + b.trust * PROPOSE_PPM.trust - b.hostility * PROPOSE_PPM.hostility + rep * REP_PPM;
    if (!w.rng.chance(ppm)) {
      b.closeness = clamp(b.closeness - PROPOSE_REFUSED_CLOSENESS, 0, BOND_MAX);
      log({ key: 'log.marry.refused', params: { name: n.character.name }, importance: 'major' });
      return;
    }
    const { bridePrice, mover } = wedPlayer(w.npcs, playerStandIn(c), n, w.logic);
    b.closeness = clamp(b.closeness + WED_CLOSENESS, 0, BOND_MAX);
    b.trust = clamp(b.trust + WED_TRUST, 0, BOND_MAX);
    const county = w.logic.counties[c.home]?.name ?? 'place.unknown';
    const key = c.gender === 'male' ? 'log.marry.wed_groom' : 'log.marry.wed_bride';
    log({ key: mover === 'player' ? `${key}_moved` : key, params: { name: n.character.name, coin: bridePrice, county }, importance: 'major' });
  }
}

/** Đầu năm: quan hệ phai dần; người thân không nhạt dưới mức "bạn"; nợ ơn để lâu thì mất tin cậy. Người đã mất giữ nguyên. */
export function fadeBonds(c: CharacterState, w: SocialWorld): void {
  for (const b of w.bonds) {
    const n = w.npcs.people.find((x) => x.id === b.id);
    if (!n || n.death) continue;
    const floor = kinRole(c, n) ? FADE.kinFloor : 0;
    b.closeness = Math.max(Math.min(b.closeness, floor), b.closeness - FADE.closeness);
    b.trust = Math.max(0, b.trust - FADE.trust - (b.owed <= OWING ? FADE.debtTrust : 0));
    b.hostility = Math.max(0, b.hostility - FADE.hostility);
  }
}

/** Đổi quan hệ với người thật trong sự kiện (ADR 0017): cộng dồn, giữ trong khoảng. `rep`: tiếng tăm lúc mới quen (S6). */
export function shiftBond(bonds: Bond[], id: string, d: Partial<Omit<Bond, 'id'>>, rep = 0): void {
  const b = ensureBond(bonds, id, rep);
  b.closeness = clamp(b.closeness + (d.closeness ?? 0), 0, BOND_MAX);
  b.trust = clamp(b.trust + (d.trust ?? 0), 0, BOND_MAX);
  b.hostility = clamp(b.hostility + (d.hostility ?? 0), 0, BOND_MAX);
  b.owed = clamp(b.owed + (d.owed ?? 0), -BOND_MAX, BOND_MAX);
}
