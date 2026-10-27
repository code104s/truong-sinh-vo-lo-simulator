import { HARVEST_MONTH, type ActionOption, type CalendarDate, type CharacterView, type EventCostTag, type MarketView, type MonthPlan, type PendingEvent, type SettlementKind, type TravelOption } from '@tsvl/shared';
import { hash32, Rng } from '@tsvl/sim';

export const POLICIES = ['lazy', 'balanced', 'overwork', 'scholar', 'wanderer'] as const;
export type PolicyName = (typeof POLICIES)[number];
export interface PolicyContext {
  character: CharacterView; date: CalendarDate; actions: ActionOption[]; travel: TravelOption[];
  settlements: readonly SettlementKind[]; seed: number; active: boolean;
  /** Chợ quận đang đứng (S7); không có thì chiến lược không mua bán. */
  market?: MarketView | null;
}

/**
 * Kinh tế của người chơi máy (v0.3 S7), chỉ đọc view và chợ đang đứng:
 * - giữ một năm ăn trong kho, vì năm đói kém chợ hết lương, có tiền cũng không mua được;
 * - thừa quá hai năm ăn thì bán bớt;
 * - giữ tiền nộp thuế đinh và trả thầy thuốc.
 */
export const GRAIN_RESERVE = 360;
export const SELL_ABOVE = 720;
export const MONEY_RESERVE = 300;
/** Dưới chừng ấy tuần ăn (kho + tiền dư quy ra lương) thì bỏ việc riêng, đi làm kiếm ăn. */
export const SURVIVAL_WEEKS = 12;

const household = (c: PolicyContext) => c.character.household;
/** Kho cộng tiền dư (ngoài phần giữ) quy ra lương theo giá mua, tính bằng tuần ăn. */
export function foodWeeks(c: PolicyContext): number {
  const h = household(c), price = Math.max(1, c.market?.buyPrice ?? 40);
  return Math.floor((h.grain + Math.floor((Math.max(0, h.money - MONEY_RESERVE) * 10) / price)) / 10);
}
const weeksToHarvest = (d: CalendarDate) => ((HARVEST_MONTH - d.month + 12) % 12 || 12) * 3;
const struggling = (c: PolicyContext) => household(c).independent && foodWeeks(c) < SURVIVAL_WEEKS;
/**
 * Học, ngao du là việc riêng: chỉ làm khi đã dành được hai năm ăn, và trước tuổi về già (sau đó dành dụm như người
 * điều độ, để lúc không làm nổi vẫn còn cái ăn).
 */
export const SETTLE_AGE = 45;
const secure = (c: PolicyContext) => c.character.ageYears < SETTLE_AGE && (!household(c).independent || foodWeeks(c) >= 72);

/** Người chơi máy: chỉ đọc view và lựa chọn được sim công bố. */
export function policyPlan(name: PolicyName, c: PolicyContext): MonthPlan | null {
  if (!c.character.canAct || c.active) return null;
  const plan: MonthPlan = { slots: [{ action: 'action.rest' }, { action: 'action.rest' }, { action: 'action.rest' }] };
  const usable = (id: string) => c.actions.some((a) => a.id === id && !a.locked);
  const setAll = (action: string) => { plan.slots = [{ action }, { action }, { action }]; };
  const travelTo = (county: number) => { plan.slots[c.date.tenDay] = { action: 'action.travel', target: county }; };
  if (name === 'lazy') return plan;
  // Cái ăn ngay: làm thuê, săn (ra thịt và da), hái lượm. Mùa đông ruộng nghỉ thì làm việc này.
  const quick = ['action.hire', 'action.hunt', 'action.forage'].find(usable) ?? 'action.rest';
  const work = usable('action.farm') ? 'action.farm' : quick;
  // Ruộng chỉ cho ăn lúc gặt: không đủ ăn tới mùa gặt thì một ô kiếm cái ăn ngay; túng hẳn thì cả hai ô
  const short = work === 'action.farm' && household(c).independent && foodWeeks(c) < weeksToHarvest(c.date);
  const first = short && struggling(c) ? quick : work;
  const second = short ? quick : work;
  const earn = () => { plan.slots = [{ action: first }, { action: second }, { action: 'action.rest' }]; };
  if (name !== 'overwork' && c.character.healthPct < 50) {
    // Yếu: có bệnh và còn của thì chữa; hết của thì vẫn phải làm một ô kiếm ăn, nghỉ hai ô (nằm chờ là chết đói)
    if (c.character.conditions.length > 0 && usable('action.heal') && !struggling(c)) setAll('action.heal');
    else if (struggling(c)) earn();
    else if (household(c).independent) plan.slots = [{ action: first }, { action: 'action.rest' }, { action: 'action.rest' }];
    return plan;
  }
  if (name === 'balanced') earn();
  if (name === 'overwork') plan.slots = [{ action: first }, { action: second }, { action: work }];
  if (name === 'scholar') {
    // Học phải trả học phí; một ô làm thuê tự nuôi việc học. Chưa đủ một năm ăn thì đi làm; nơi này không có trường thì lên trấn.
    const lock = c.actions.find((a) => a.id === 'action.study')?.locked;
    const pay = usable('action.hire') ? 'action.hire' : work;
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

/**
 * Mua bán lương thực đầu tháng (lệnh TRADE, không tốn ô): > 0 mua, < 0 bán, 0 thôi. Chưa ra riêng thì cha mẹ lo;
 * "lười" không mua bán. Không mua lúc đói kém (chợ cạn, giá đỉnh).
 */
export function policyTrade(name: PolicyName, c: PolicyContext): number {
  const h = household(c), m = c.market;
  if (name === 'lazy' || !h.independent || !m) return 0;
  if (h.grain < GRAIN_RESERVE && m.supply !== 'famine') {
    const afford = Math.floor(((h.money - MONEY_RESERVE) * 10) / Math.max(1, m.buyPrice)) - 1;
    return Math.max(0, Math.min(GRAIN_RESERVE - h.grain, afford, m.maxBuy));
  }
  if (h.grain > SELL_ABOVE) return -Math.min(h.grain - SELL_ABOVE, m.maxSell);
  return 0;
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
