// Tiền và lương trong hành động: lương làm thuê, học phí, phí thầy thuốc, tiền đường, hái lượm, săn, buôn bán nhỏ,
// thuế đinh, mua bán lương thực (ADR 0012). Mọi đồng tiền đi giữa túi người chơi và quỹ một quận: tổng tiền vùng không đổi.
import { ageYearsAt, calendarOf, GRAIN_PER_DOU, type ContentId, type Season, type Tick } from '@tsvl/shared';
import { idiv, mulDiv } from '../core/math';
import type { Rng } from '../core/rng';
import type { CharacterState } from '../life/character';
import type { HouseholdState } from '../life/household';
import { buyPrice, sellPrice, type CountyEconomy } from './market';

export const HIRE_WAGE = 60;
export const TUITION = 20;
export const HEAL_FEE = { none: 30, mild: 30, serious: 100, grave: 300 } as const;
export const LODGING_PER_SLOT = 10;
/** Thiếu tiền trọ thì ngủ bụi: rủi ro đường (%) tăng. */
export const ROUGH_SLEEP_RISK_PCT = 150;
export const FORAGE_BY_SEASON: Record<Season, number> = { spring: 4, summer: 6, autumn: 5, winter: 2 };
export const HUNT_MEAT = 10;
export const HUNT_HIDE = 20;
/** Kỹ năng cao nhất cộng thêm (%) vào lương, hái lượm, săn. */
export const SKILL_INCOME_MAX_PCT = 60;
/**
 * Buôn bán nhỏ: vốn tối thiểu, vốn tính lãi tối đa; lãi, lỗ mỗi tuần (‰ vốn) và xác suất lỗ (ppm), từ người mới tới
 * người thạo. Kỳ vọng mỗi tuần: người mới +1,25‰ (gần hòa vốn, nhiều rủi ro), người thạo +34‰.
 */
export const TRADE_MIN_CAPITAL = 200;
export const TRADE_CAPITAL_CAP = 5_000;
export const TRADE_GAIN_PERMILLE = [15, 40] as const;
export const TRADE_LOSS_PERMILLE = [40, 20] as const;
export const TRADE_LOSS_PPM = [250_000, 100_000] as const;
export const HEAD_TAX = 200;
export const HEAD_TAX_AGE = 16;

const skillPct = (xp: number) => 100 + mulDiv(xp, SKILL_INCOME_MAX_PCT, 10_000);
/** Nội suy theo kỹ năng 0..10000. */
const bySkill = (range: readonly [number, number], xp: number) => range[0] + mulDiv(range[1] - range[0], xp, 10_000);

/** Trả từ túi vào quỹ quận; trả về số đã trả. */
function pay(h: HouseholdState, ce: CountyEconomy, amount: number): number {
  const n = Math.max(0, Math.min(amount, h.money));
  h.money -= n; ce.money += n;
  return n;
}
/** Quỹ quận trả cho người chơi, trong giới hạn quỹ. */
function receive(h: HouseholdState, ce: CountyEconomy, amount: number): number {
  const n = Math.max(0, Math.min(amount, ce.money));
  ce.money -= n; h.money += n;
  return n;
}

/** Phí theo bệnh nặng nhất; không bệnh thì phí khám. */
export function healFee(c: CharacterState): number {
  return c.conditions.reduce<number>((fee, x) => Math.max(fee, HEAL_FEE[x.severity]), HEAL_FEE.none);
}

/** Khóa vì tiền ở chợ đang đứng; null nếu không vướng. Là khóa tạm: hết khi có tiền hoặc quận có việc. */
export function moneyLock(id: string, c: CharacterState, market: CountyEconomy): ContentId | null {
  const money = c.household.money;
  switch (id) {
    case 'action.hire': return market.money < HIRE_WAGE ? 'lock.no_work' : null;
    case 'action.study': return money < TUITION ? 'lock.money' : null;
    case 'action.heal': return money < healFee(c) ? 'lock.money' : null;
    case 'action.trade': return money < TRADE_MIN_CAPITAL ? 'lock.money' : null;
    default: return null;
  }
}

/** Mức tiền để hiển thị trong kế hoạch. */
export function moneyCost(id: string): ContentId {
  switch (id) {
    case 'action.study': case 'action.travel': return 'money.low';
    case 'action.heal': return 'money.medium';
    case 'action.trade': return 'money.capital';
    default: return 'money.none';
  }
}

export function moneyGains(id: string): ContentId[] {
  switch (id) {
    case 'action.hire': case 'action.trade': return ['gain.money'];
    case 'action.forage': return ['gain.food'];
    case 'action.hunt': return ['gain.food', 'gain.money'];
    default: return [];
  }
}

/**
 * Thanh toán và thu hoạch của một ô đã làm, ở chợ quận đang đứng. Trả về hệ số rủi ro (%) cho phần rủi ro thân thể
 * (ngủ bụi khi đi đường). Buôn bán nhỏ rút lãi/lỗ trên luồng actions.
 */
export function settleAction(id: string, c: CharacterState, tick: Tick, market: CountyEconomy, rng: Rng): number {
  const h = c.household;
  switch (id) {
    case 'action.hire':
      receive(h, market, mulDiv(HIRE_WAGE, skillPct(c.skillXp.crafting), 100));
      return 100;
    case 'action.study':
      pay(h, market, TUITION);
      return 100;
    case 'action.heal':
      pay(h, market, healFee(c));
      return 100;
    case 'action.travel':
      return pay(h, market, LODGING_PER_SLOT) < LODGING_PER_SLOT ? ROUGH_SLEEP_RISK_PCT : 100;
    case 'action.forage':
      h.grain += mulDiv(FORAGE_BY_SEASON[calendarOf(tick).season], skillPct(c.skillXp.hunting), 100);
      return 100;
    case 'action.hunt': {
      const pct = skillPct(c.skillXp.hunting);
      h.grain += mulDiv(HUNT_MEAT, pct, 100);
      receive(h, market, mulDiv(HUNT_HIDE, pct, 100));
      return 100;
    }
    case 'action.trade': {
      const capital = Math.min(h.money, TRADE_CAPITAL_CAP);
      const xp = c.skillXp.trade;
      if (rng.chance(bySkill(TRADE_LOSS_PPM, xp))) pay(h, market, mulDiv(capital, bySkill(TRADE_LOSS_PERMILLE, xp), 1000));
      else receive(h, market, mulDiv(capital, bySkill(TRADE_GAIN_PERMILLE, xp), 1000));
      return 100;
    }
    default:
      return 100;
  }
}

/** Đầu năm: người đã ra riêng từ 16 tuổi nộp thuế đinh cho quận nhà; thiếu thì ghi nợ (sự kiện thu thuế ở S5). */
export function headTax(c: CharacterState, home: CountyEconomy, tick: Tick): number {
  const h = c.household;
  if (!h.independent || ageYearsAt(c.birthTick, tick) < HEAD_TAX_AGE) return 0;
  const paid = pay(h, home, HEAD_TAX);
  h.taxDebt += HEAD_TAX - paid;
  return paid;
}

/**
 * Lệnh TRADE: mua (> 0) hoặc bán (< 0) đúng số thăng ở chợ đang đứng. Không đủ tiền, kho, quỹ thì từ chối cả lệnh.
 * Trả về lý do từ chối hoặc null.
 */
export function tradeGrain(h: HouseholdState, market: CountyEconomy, grain: number): string | null {
  if (grain > 0) {
    const cost = idiv(grain * buyPrice(market) + GRAIN_PER_DOU - 1, GRAIN_PER_DOU);
    if (grain > market.grain) return 'chợ không đủ lương';
    if (cost > h.money) return 'không đủ tiền';
    h.money -= cost; market.money += cost;
    h.grain += grain; market.grain -= grain;
    return null;
  }
  const n = -grain;
  const proceeds = idiv(n * sellPrice(market), GRAIN_PER_DOU);
  if (n > h.grain) return 'không đủ lương để bán';
  if (proceeds > market.money) return 'chợ không đủ tiền mua';
  h.grain -= n; market.grain += n;
  market.money -= proceeds; h.money += proceeds;
  return null;
}
