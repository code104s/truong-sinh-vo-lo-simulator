import { type ActionOption, type CalendarDate, type CharacterView, type EventCostTag, type MarketView, type MonthPlan, type NpcView, type PendingEvent, type PlanSlot, type SettlementKind, type TravelOption } from '@tsvl/shared';
import { earnPlan, foodWeeks as brainFoodWeeks, GRAIN_RESERVE, hash32, MONEY_RESERVE, Rng, tradeDecision, weakPlan, workChoice, type BrainInput } from '@tsvl/sim';

export const POLICIES = ['lazy', 'balanced', 'overwork', 'scholar', 'wanderer', 'family'] as const;
export type PolicyName = (typeof POLICIES)[number];
export interface PolicyContext {
  character: CharacterView; date: CalendarDate; actions: ActionOption[]; travel: TravelOption[];
  settlements: readonly SettlementKind[]; seed: number; active: boolean;
  /** Chợ quận đang đứng (S7); không có thì chiến lược không mua bán. */
  market?: MarketView | null;
  /**
   * Người trong quận, mỗi người kèm khóa của từng việc xã giao (`NpcView.social`, v0.5 F2) — cho chiến lược `family`;
   * không có thì không xã giao. Hàm, để chỉ dựng khi cần (v0.6 Bước 0: người đã có vợ/chồng mà không túng thì không hỏi).
   */
  people?: () => readonly NpcView[];
}

/**
 * Kinh tế và nhịp làm của người chơi máy dùng chung bộ não nhu cầu với NPC (sim/npc/brain.ts, ADR 0016): giữ một năm
 * ăn, bán phần thừa, giữ tiền thuế; ruộng chỉ cho ăn lúc gặt nên thiếu ăn thì kiếm cái ăn ngay. Ở đây chỉ còn phần
 * riêng của từng chiến lược (lười, lao lực, học giả, lang bạt) và cách chọn sự kiện.
 */
export { GRAIN_RESERVE, MONEY_RESERVE, SELL_ABOVE, SURVIVAL_WEEKS } from '@tsvl/sim';

const household = (c: PolicyContext) => c.character.household;
/** Những gì người chơi máy thấy, quy về đầu vào của bộ não nhu cầu. */
export function brainInput(c: PolicyContext): BrainInput {
  const h = household(c);
  return {
    ageYears: c.character.ageYears, healthPct: c.character.healthPct, sick: c.character.conditions.length > 0,
    independent: h.independent, money: h.money, grain: h.grain, month: c.date.month,
    usable: (id) => c.actions.some((a) => a.id === id && !a.locked), market: c.market ?? null,
  };
}
export const foodWeeks = (c: PolicyContext) => brainFoodWeeks(brainInput(c));
/**
 * Học, ngao du là việc riêng: chỉ làm khi đã dành được hai năm ăn, và trước tuổi về già (sau đó dành dụm như người
 * điều độ, để lúc không làm nổi vẫn còn cái ăn).
 */
export const SETTLE_AGE = 45;
const secure = (c: PolicyContext) => c.character.ageYears < SETTLE_AGE && (!household(c).independent || foodWeeks(c) >= 72);

/** Người chơi máy: chỉ đọc view và lựa chọn được sim công bố. */
export function policyPlan(name: PolicyName, c: PolicyContext): MonthPlan | null {
  if (!c.character.canAct || c.active) return null;
  let plan: MonthPlan = { slots: [{ action: 'action.rest' }, { action: 'action.rest' }, { action: 'action.rest' }] };
  if (name === 'lazy') return plan;
  const b = brainInput(c);
  const usable = b.usable;
  const setAll = (action: string) => { plan.slots = [{ action }, { action }, { action }]; };
  const travelTo = (county: number) => { plan.slots[c.date.tenDay] = { action: 'action.travel', target: county }; };
  const w = workChoice(b);
  const earn = () => { plan = earnPlan(w); };
  if (name !== 'overwork') { const weak = weakPlan(b, w); if (weak) return weak; }
  if (name === 'balanced' || name === 'family') earn();
  // Gia đình (v0.5 S8, Q13): như điều độ, ô nghỉ cuối tháng (tuần thứ ba) dành cho xã giao — nhờ cậy khi túng, cưới
  // khi đủ thân, không thì sang thăm người hợp đôi cho thân dần. Người trong quận chỉ có trong ngữ cảnh tuần thứ hai, ba
  if (name === 'family') {
    const social = familySlot(c);
    if (social) plan.slots[2] = social;
    // Đang tìm người thành đôi mà nhà có của dư: thăm cả ô thứ hai, để thân kịp trước khi người ta cưới người khác
    if (social?.action === 'action.visit' && household(c).foodWeeks >= FAMILY_COURT_WEEKS) plan.slots[1] = social;
  }
  if (name === 'overwork') plan.slots = [{ action: w.first }, { action: w.second }, { action: w.work }];
  if (name === 'scholar') {
    // Học phải trả học phí; một ô làm thuê tự nuôi việc học. Chưa đủ một năm ăn thì đi làm; nơi này không có trường thì lên trấn.
    const lock = c.actions.find((a) => a.id === 'action.study')?.locked;
    const pay = usable('action.hire') ? 'action.hire' : w.work;
    if (!secure(c)) earn();
    else if (usable('action.study')) plan.slots = [{ action: 'action.study' }, { action: 'action.study' }, { action: pay }];
    else if (lock === 'lock.money') setAll(pay);
    else if (usable('action.travel')) {
      const destination = c.travel.find((p) => c.settlements[p.county] !== 'village');
      if (destination) travelTo(destination.county);
    }
  }
  if (name === 'wanderer') {
    if (!secure(c)) earn();
    else if (usable('action.travel') && c.travel.length) {
      const rng = Rng.fromSeed(hash32('policy', c.seed, c.date.tick));
      // Một ô nghỉ giữa các chuyến để hồi sức.
      if (c.date.tick % 3 !== 0) travelTo(c.travel[rng.int(0, c.travel.length - 1)]!.county);
    }
  }
  return plan;
}

/** Túng: của trong nhà (kho cộng tiền) đủ ăn dưới chừng ấy tuần thì đi nhờ người. */
export const FAMILY_ASK_WEEKS = 8;
/** Của trong nhà đủ ăn từ chừng ấy tuần thì thăm người hợp đôi hai ô mỗi tháng. */
export const FAMILY_COURT_WEEKS = 52;
const CLOSENESS_RANK: Record<string, number> = { stranger: 0, acquaintance: 1, friend: 2, close: 3 };

/** Ô xã giao của người chơi máy `family`, hoặc null. Chỉ đọc view và khóa sim công bố (không đoán ai đã có gia đình). */
function familySlot(c: PolicyContext): PlanSlot | null {
  if (!c.people || !household(c).independent) return null;
  const hungry = household(c).foodWeeks < FAMILY_ASK_WEEKS, married = c.character.spouse !== undefined;
  // Đã có vợ/chồng còn sống mà không túng: không còn việc xã giao nào để xếp (cưới hỏi bị khóa với mọi người)
  if (married && !hungry) return null;
  const people = c.people();
  if (!people.length) return null;
  // Khóa sim gửi kèm người ấy; null là làm được (không dùng ?? vì null là giá trị thật), không có thì coi như khóa
  const lock = ({ action, person }: PlanSlot): string | null => {
    const o = people.find((p) => p.id === person)?.social?.find((x) => x.action === action);
    return o ? o.locked : 'lock.action';
  };
  const open = (action: string) => people.filter((p) => lock({ action, person: p.id }) === null);
  if (hungry) {
    // Người thân trước, rồi người thân thiết hơn
    const helpers = open('action.ask_help').sort((a, b) => Number(!a.kin) - Number(!b.kin) || (CLOSENESS_RANK[b.bond?.closeness ?? 'stranger']! - CLOSENESS_RANK[a.bond?.closeness ?? 'stranger']!));
    if (helpers.length) return { action: 'action.ask_help', person: helpers[0]!.id };
  }
  if (married) return null;
  // Khóa cưới hỏi của từng người, tính một lần cho cả hai bước dưới
  const propose = people.map((p) => lock({ action: 'action.propose', person: p.id }));
  const wed = people.find((_, i) => propose[i] === null);
  if (wed) return { action: 'action.propose', person: wed.id };
  // Người hợp đôi mà chưa đủ thân: sang thăm người thân thiết nhất (bằng nhau thì người đứng trước)
  const suitors = people.filter((p, i) => propose[i] === 'lock.not_close' && lock({ action: 'action.visit', person: p.id }) === null);
  if (!suitors.length) return null;
  const best = suitors.reduce((a, b) => (CLOSENESS_RANK[b.bond?.closeness ?? 'stranger']! > CLOSENESS_RANK[a.bond?.closeness ?? 'stranger']! ? b : a));
  return { action: 'action.visit', person: best.id };
}

/** Mua bán lương thực đầu tháng (lệnh TRADE, không tốn ô). "Lười" không mua bán. */
export function policyTrade(name: PolicyName, c: PolicyContext): number {
  return name === 'lazy' ? 0 : tradeDecision(brainInput(c));
}

/** Cái giá của một lựa chọn, theo hoàn cảnh lúc này: thứ đang thiếu thì đắt. */
function costWeight(name: PolicyName, tag: EventCostTag, c: PolicyContext): number {
  const h = household(c);
  switch (tag) {
    case 'money': return h.money < MONEY_RESERVE + 100 ? 10 : 1;
    case 'grain': return h.grain < GRAIN_RESERVE && (h.independent || h.grain > 0) ? 10 : 1;
    case 'health': return c.character.healthPct < 60 ? 10 : name === 'overwork' ? 1 : 3;
    case 'stamina': case 'time': return name === 'overwork' ? 0 : 1;
    case 'risk': return 2;
    case 'opportunity': return 1;
  }
}

/**
 * Người chơi máy gặp sự kiện (ADR 0014): "lười" luôn đi lối ra (lựa chọn cuối, không bao giờ bị khóa). Chiến lược khác
 * chọn lựa chọn đang mở có giá nhẹ nhất theo hoàn cảnh (S7); bằng nhau thì lấy lựa chọn đứng trước. Thiếu ngữ cảnh thì
 * như cũ: lựa chọn đầu tiên đang mở.
 */
export function policyChoose(name: PolicyName, pending: PendingEvent, c?: PolicyContext): string {
  if (name === 'lazy') return pending.choices.at(-1)!.id;
  const open = pending.choices.filter((x) => x.locked === null);
  if (!c) return open[0]!.id;
  let best = open[0]!, bestCost = Infinity;
  for (const x of open) {
    const cost = x.costs.reduce((s, tag) => s + costWeight(name, tag, c), 0);
    if (cost < bestCost) { best = x; bestCost = cost; }
  }
  return best.id;
}
