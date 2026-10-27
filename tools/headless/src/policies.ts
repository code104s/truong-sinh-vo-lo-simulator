import { type ActionOption, type CalendarDate, type CharacterView, type EventCostTag, type MarketView, type MonthPlan, type PendingEvent, type SettlementKind, type TravelOption } from '@tsvl/shared';
import { earnPlan, foodWeeks as brainFoodWeeks, GRAIN_RESERVE, hash32, MONEY_RESERVE, Rng, tradeDecision, weakPlan, workChoice, type BrainInput } from '@tsvl/sim';

export const POLICIES = ['lazy', 'balanced', 'overwork', 'scholar', 'wanderer'] as const;
export type PolicyName = (typeof POLICIES)[number];
export interface PolicyContext {
  character: CharacterView; date: CalendarDate; actions: ActionOption[]; travel: TravelOption[];
  settlements: readonly SettlementKind[]; seed: number; active: boolean;
  /** Chợ quận đang đứng (S7); không có thì chiến lược không mua bán. */
  market?: MarketView | null;
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
  if (name === 'balanced') earn();
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
