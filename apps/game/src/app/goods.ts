// Kho đồ (v0.7 F3b, ADR 0021): túi hàng, mua bán hàng ở chợ (lệnh TRADE_GOODS), bảng chuyến buôn. Giao diện tính theo phần
// (10 phân); sim tính theo phân. Giới hạn ở đây khớp luật của sim (tradeGoods): lệnh gửi đi không bị từ chối vì vượt túi,
// sức gánh, kho hay quỹ chợ. Không có luật game khác.
import { GOOD_UNITS_PER_PART, type ContentId, type GoodId, type HaulOption, type HouseholdView, type MarketGoodView } from '@tsvl/shared';
import type { TradeSide } from './market';

const U = GOOD_UNITS_PER_PART;

/** Số phân ra chữ số phần, một chữ số thập phân khi lẻ: 25 → "2,5". */
export function partsText(units: number): string {
  const whole = Math.floor(units / U), rest = units % U;
  return rest === 0 ? String(whole) : `${whole},${rest}`;
}

export const goodsCarried = (h: HouseholdView): number => h.goods.reduce((s, g) => s + g.qty, 0);
export const goodHave = (h: HouseholdView, id: GoodId): number => h.goods.find((g) => g.id === id)?.qty ?? 0;

/**
 * Mua, bán được nhiều nhất bao nhiêu phân lúc này: kho chợ, sức gánh, túi tiền (mua); hàng mình có, quỹ chợ (bán). Khi quỹ
 * chợ là giới hạn, `maxSell` sim gửi có thể thấp hơn mức sim nhận một phân (sim làm tròn tiền bán xuống): an toàn.
 */
export function goodsLimit(side: TradeSide, g: MarketGoodView, h: HouseholdView): number {
  if (side === 'buy') return Math.max(0, Math.min(g.maxBuy, h.goodsCap - goodsCarried(h), Math.floor((h.money * U) / Math.max(1, g.buyPrice))));
  return Math.max(0, Math.min(goodHave(h, g.id), g.maxSell));
}

/** Lý do không mua, bán nổi phân nào; null nếu được. */
export function goodsBlock(side: TradeSide, g: MarketGoodView, h: HouseholdView, canAct: boolean): ContentId | null {
  if (!canAct) return 'ui.market.why.child';
  if (side === 'buy') {
    if (g.maxBuy <= 0) return 'ui.goods.why.no_stock';
    if (goodsCarried(h) >= h.goodsCap) return 'ui.goods.why.full';
    if (goodsLimit('buy', g, h) <= 0) return 'ui.goods.why.no_money';
  } else {
    if (goodHave(h, g.id) <= 0) return 'ui.goods.why.none';
    if (g.maxSell <= 0) return 'ui.market.why.no_coin';
  }
  return null;
}

/** Tiền trả (mua, làm tròn lên) hay được (bán, làm tròn xuống) cho chừng ấy phân — đúng bằng số sim tính. */
export const goodsTotal = (side: TradeSide, units: number, g: MarketGoodView): number =>
  (side === 'buy' ? Math.ceil((units * g.buyPrice) / U) : Math.floor((units * g.sellPrice) / U));

/** Số phân gửi trong lệnh TRADE_GOODS: dương là mua, âm là bán. */
export const goodsQty = (side: TradeSide, units: number): number => (side === 'buy' ? units : -units);

/**
 * Bảng chuyến buôn (F3b): gom theo quận đích, quận có chuyến lời nhất lên đầu; trong quận theo thứ tự hàng sim gửi
 * (lương, rồi ba món). Quận nào cũng còn đủ các hàng để thấy món nào lỗ.
 */
export function haulRows(hauls: readonly HaulOption[]): { county: number; options: HaulOption[]; best: number }[] {
  const rows: { county: number; options: HaulOption[]; best: number }[] = [];
  for (const h of hauls) {
    let r = rows.find((x) => x.county === h.county);
    if (!r) { r = { county: h.county, options: [], best: -Infinity }; rows.push(r); }
    r.options.push(h);
    if (h.locked === null) r.best = Math.max(r.best, h.profit);
  }
  return rows.sort((a, b) => b.best - a.best || a.county - b.county);
}
