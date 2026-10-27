// Mua bán lương thực ở chợ quận đang đứng (F2, lệnh TRADE — ADR 0012). Giao diện tính theo đấu; sim tính theo thăng.
// Giới hạn ở đây khớp luật của sim (tradeGrain): lệnh gửi đi không bao giờ bị từ chối vì vượt túi, kho hay quỹ chợ.
import { GRAIN_PER_DOU, type ContentId, type HouseholdView, type MarketView } from '@tsvl/shared';

export type TradeSide = 'buy' | 'sell';

/** Giá một đấu theo chiều mua bán (văn). */
export const pricePerDou = (side: TradeSide, m: MarketView) => (side === 'buy' ? m.buyPrice : m.sellPrice);

/** Mua, bán được nhiều nhất bao nhiêu đấu lúc này. */
export function tradeLimit(side: TradeSide, m: MarketView, h: HouseholdView): number {
  if (side === 'buy') return Math.max(0, Math.min(Math.floor(m.maxBuy / GRAIN_PER_DOU), Math.floor(h.money / Math.max(1, m.buyPrice))));
  return Math.max(0, Math.min(Math.floor(h.grain / GRAIN_PER_DOU), Math.floor(m.maxSell / GRAIN_PER_DOU)));
}

/** Lý do không mua, bán nổi một đấu; null nếu được. */
export function tradeBlock(side: TradeSide, m: MarketView, h: HouseholdView, canAct: boolean): ContentId | null {
  if (!canAct) return 'ui.market.why.child';
  if (side === 'buy') {
    if (m.maxBuy < GRAIN_PER_DOU) return 'ui.market.why.no_stock';
    if (h.money < m.buyPrice) return 'ui.market.why.no_money';
  } else {
    if (h.grain < GRAIN_PER_DOU) return 'ui.market.why.no_grain';
    if (m.maxSell < GRAIN_PER_DOU) return 'ui.market.why.no_coin';
  }
  return null;
}

/** Tiền trả (mua) hay được (bán) cho chừng ấy đấu; đúng bằng số sim tính, vì một đấu là trọn mười thăng. */
export const tradeTotal = (side: TradeSide, dou: number, m: MarketView) => dou * pricePerDou(side, m);

/** Túi sau khi mua bán. */
export function afterTrade(side: TradeSide, dou: number, m: MarketView, h: HouseholdView): { money: number; dou: number } {
  const total = tradeTotal(side, dou, m);
  const have = Math.floor(h.grain / GRAIN_PER_DOU);
  return side === 'buy' ? { money: h.money - total, dou: have + dou } : { money: h.money + total, dou: have - dou };
}

/** Số thăng gửi trong lệnh TRADE: dương là mua, âm là bán. */
export const tradeGrain = (side: TradeSide, dou: number) => (side === 'buy' ? dou : -dou) * GRAIN_PER_DOU;
