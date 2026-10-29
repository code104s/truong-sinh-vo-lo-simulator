import { t } from '@tsvl/content';
import { GOOD_UNITS_PER_PART, GOODS, type GoodId, type HouseholdView, type MarketGoodView, type MarketView } from '@tsvl/shared';
import { useEffect, useState } from 'preact/hooks';
import { goodHave, goodsBlock, goodsCarried, goodsLimit, goodsQty, goodsTotal, partsText } from '../app/goods';
import { afterTrade, pricePerDou, tradeBlock, tradeGrain, tradeLimit, tradeTotal, type TradeSide } from '../app/market';
import { Seal } from '../ui/ink';

const SUPPLY_TONE: Record<MarketView['supply'], string> = { plenty: 'good', normal: 'plain', scarce: 'warn', famine: 'bad' };
const TREND_MARK: Record<MarketView['trend'], string> = { rising: '↑', steady: '→', falling: '↓' };

/** Khối chợ ở cột phải màn Đời người (F2): giá mua, giá bán một đấu, mức lương ở chợ, xu hướng giá. */
export function MarketPanel({ market, place, locked, onOpen }: { market: MarketView; place: string; locked: boolean; onOpen: () => void }) {
  return (
    <div class="dossier-block market-panel">
      <span class="dossier-k">{t('ui.market.title', { place })}</span>
      <dl class="market-prices">
        <dt>{t('ui.market.buy_price')}</dt><dd>{t('ui.market.per_dou', { coin: market.buyPrice })}</dd>
        <dt>{t('ui.market.sell_price')}</dt><dd>{t('ui.market.per_dou', { coin: market.sellPrice })}</dd>
        <dt>{t('ui.market.supply')}</dt><dd class={`tone-${SUPPLY_TONE[market.supply]}`}>{t(`supply.${market.supply}`)}</dd>
        <dt>{t('ui.market.trend')}</dt><dd class={`trend-${market.trend}`}>{TREND_MARK[market.trend]} {t(`trend.${market.trend}`)}</dd>
      </dl>
      {/* Chợ hàng (v0.7 F3b): giá mua / bán mỗi phần, mũi tên xu hướng; màu tên món theo mức hàng ở chợ */}
      <table class="goods-prices">
        <thead><tr><th>{t('ui.goods.item')}</th><th>{t('ui.market.buy_price')}</th><th>{t('ui.market.sell_price')}</th></tr></thead>
        <tbody>
          {market.goods.map((g) => (
            <tr key={g.id}>
              <th class={`tone-${SUPPLY_TONE[g.supply]}`} title={t(`supply.${g.supply}`)}>{t(`good.${g.id}`)}</th>
              <td>{g.buyPrice}</td>
              <td>{g.sellPrice} <span class={`trend-${g.trend}`} title={t(`trend.${g.trend}`)}>{TREND_MARK[g.trend]}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p class="tiny muted">{t('ui.goods.per_part_note')}</p>
      <button type="button" class="btn ghost market-open" disabled={locked} onClick={onOpen}>{t('ui.market.open')}</button>
    </div>
  );
}

interface DialogProps {
  market: MarketView; household: HouseholdView; place: string; canAct: boolean; busy: boolean;
  onTrade: (grain: number) => void; onTradeGoods: (good: GoodId, qty: number) => void; onClose: () => void;
}
type Item = 'grain' | GoodId;

/**
 * Hộp mua bán (F2): chọn mua hay bán, số đấu, thấy ngay tiền trả hay được và túi còn lại rồi mới xác nhận. Không tốn ô
 * thời gian. Giới hạn theo túi, kho mình, kho và quỹ chợ, nên lệnh gửi đi luôn hợp lệ.
 */
export function MarketDialog({ market, household, place, canAct, busy, onTrade, onTradeGoods, onClose }: DialogProps) {
  const [item, setItem] = useState<Item>('grain');
  const [side, setSide] = useState<TradeSide>('buy');
  const [dou, setDou] = useState(1);
  const limit = tradeLimit(side, market, household);
  const block = tradeBlock(side, market, household, canAct);
  const amount = Math.min(Math.max(1, dou), Math.max(1, limit));
  const after = afterTrade(side, amount, market, household);
  // Đổi chiều mua bán hay túi đổi sau lệnh: kéo số đấu về trong giới hạn
  useEffect(() => { if (limit > 0 && dou > limit) setDou(limit); }, [limit]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const set = (n: number) => setDou(Math.min(Math.max(1, n), Math.max(1, limit)));
  return (
    <div class="event-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section class="event-card market-card" role="dialog" aria-modal="true" aria-labelledby="market-title">
        <div class="event-text">
          <h2 id="market-title" class="event-title"><Seal char="市" />{t('ui.market.title', { place })}</h2>
          <p class="hint">{t('ui.market.hint')}</p>
          {/* Món đem mua bán (v0.7 F3b): lương thực hay một trong ba món hàng */}
          <div class="tabs item-tabs" role="tablist" aria-label={t('ui.goods.item')}>
            {(['grain', ...GOODS] as const).map((x) => (
              <button key={x} type="button" role="tab" aria-selected={item === x} class={`tab${item === x ? ' on' : ''}`} onClick={() => { setItem(x); setSide('buy'); setDou(1); }}>
                {x === 'grain' ? t('ui.goods.grain') : t(`good.${x}`)}
              </button>
            ))}
          </div>
          {item !== 'grain'
            ? <GoodsTrade key={item} good={market.goods.find((g) => g.id === item)!} household={household} canAct={canAct} busy={busy} onTrade={onTradeGoods} onClose={onClose} />
            : <>
          <div class="tabs" role="tablist">
            {(['buy', 'sell'] as const).map((s) => (
              <button key={s} type="button" role="tab" aria-selected={side === s} class={`tab${side === s ? ' on' : ''}`} onClick={() => { setSide(s); setDou(1); }}>
                {t(`ui.market.${s}`)} · {t('ui.market.per_dou', { coin: pricePerDou(s, market) })}
              </button>
            ))}
          </div>
          {block
            ? <p class="event-why market-why">{t(block)}</p>
            : <>
                <label class="market-amount">
                  <span class="dossier-k">{t('ui.market.amount')}</span>
                  <span class="stepper">
                    <button type="button" class="btn ghost" disabled={amount <= 1} onClick={() => set(amount - 10)}>−10</button>
                    <button type="button" class="btn ghost" disabled={amount <= 1} onClick={() => set(amount - 1)}>−1</button>
                    <input type="number" min={1} max={limit} value={amount} aria-label={t('ui.market.amount')}
                      onInput={(e) => { const n = Number((e.target as HTMLInputElement).value); if (Number.isFinite(n)) set(Math.floor(n)); }} />
                    <button type="button" class="btn ghost" disabled={amount >= limit} onClick={() => set(amount + 1)}>+1</button>
                    <button type="button" class="btn ghost" disabled={amount >= limit} onClick={() => set(amount + 10)}>+10</button>
                    <button type="button" class="btn ghost" disabled={amount >= limit} onClick={() => set(limit)}>{t('ui.market.max')}</button>
                  </span>
                  <span class="small muted">{t('ui.market.limit', { dou: limit })}</span>
                </label>
                <div class="confirm">
                  <p><strong>{t(`ui.market.total_${side}`, { coin: tradeTotal(side, amount, market) })}</strong></p>
                  <p class="small muted">{t('ui.market.after', { coin: after.money, dou: after.dou })}</p>
                </div>
              </>}
          <div class="market-actions">
            <button type="button" class="btn ghost" onClick={onClose}>{t('ui.market.close')}</button>
            <button type="button" class="btn primary" disabled={busy || !!block} onClick={() => onTrade(tradeGrain(side, amount))}>
              {t(`ui.market.confirm_${side}`, { dou: amount })}
            </button>
          </div>
          </>}
        </div>
      </section>
    </div>
  );
}

/**
 * Mua bán một món hàng (v0.7 F3b, lệnh TRADE_GOODS): bước một phần, "Hết mức" lấy đúng số phân còn được (để bán nốt phần
 * lẻ). Thấy ngay tiền trả hay được, túi và gánh còn lại.
 */
function GoodsTrade({ good, household, canAct, busy, onTrade, onClose }: {
  good: MarketGoodView; household: HouseholdView; canAct: boolean; busy: boolean; onTrade: (good: GoodId, qty: number) => void; onClose: () => void;
}) {
  const U = GOOD_UNITS_PER_PART;
  const [side, setSide] = useState<TradeSide>('buy');
  const [units, setUnits] = useState(U);
  const limit = goodsLimit(side, good, household);
  const block = goodsBlock(side, good, household, canAct);
  const amount = Math.min(Math.max(1, units), Math.max(1, limit));
  useEffect(() => { if (limit > 0 && units > limit) setUnits(limit); }, [limit]);
  const set = (n: number) => setUnits(Math.min(Math.max(1, n), Math.max(1, limit)));
  const total = goodsTotal(side, amount, good);
  const money = side === 'buy' ? household.money - total : household.money + total;
  const have = goodHave(household, good.id) + (side === 'buy' ? amount : -amount);
  const carried = goodsCarried(household) + (side === 'buy' ? amount : -amount);
  return (
    <>
      <div class="tabs" role="tablist">
        {(['buy', 'sell'] as const).map((x) => (
          <button key={x} type="button" role="tab" aria-selected={side === x} class={`tab${side === x ? ' on' : ''}`} onClick={() => { setSide(x); setUnits(U); }}>
            {t(`ui.market.${x}`)} · {t('ui.goods.per_part', { coin: x === 'buy' ? good.buyPrice : good.sellPrice })}
          </button>
        ))}
      </div>
      <p class="small muted">{t('ui.goods.have', { qty: partsText(goodHave(household, good.id)), carried: partsText(goodsCarried(household)), cap: partsText(household.goodsCap) })}</p>
      {block
        ? <p class="event-why market-why">{t(block)}</p>
        : <>
            <label class="market-amount">
              <span class="dossier-k">{t('ui.goods.amount')}</span>
              <span class="stepper">
                <button type="button" class="btn ghost" disabled={amount <= 1} onClick={() => set(amount - 10 * U)}>−10</button>
                <button type="button" class="btn ghost" disabled={amount <= 1} onClick={() => set(amount - U)}>−1</button>
                <output class="goods-amount" aria-label={t('ui.goods.amount')}>{partsText(amount)}</output>
                <button type="button" class="btn ghost" disabled={amount >= limit} onClick={() => set(amount + U)}>+1</button>
                <button type="button" class="btn ghost" disabled={amount >= limit} onClick={() => set(amount + 10 * U)}>+10</button>
                <button type="button" class="btn ghost" disabled={amount >= limit} onClick={() => set(limit)}>{t('ui.market.max')}</button>
              </span>
              <span class="small muted">{t('ui.goods.limit', { qty: partsText(limit) })}</span>
            </label>
            <div class="confirm">
              <p><strong>{t(`ui.market.total_${side}`, { coin: total })}</strong></p>
              <p class="small muted">{t('ui.goods.after', { coin: money, qty: partsText(have), good: t(`good.${good.id}`).toLowerCase(), carried: partsText(carried), cap: partsText(household.goodsCap) })}</p>
            </div>
          </>}
      <div class="market-actions">
        <button type="button" class="btn ghost" onClick={onClose}>{t('ui.market.close')}</button>
        <button type="button" class="btn primary" disabled={busy || !!block} onClick={() => onTrade(good.id, goodsQty(side, amount))}>
          {block ? t(`ui.market.${side}`) : t(`ui.goods.confirm_${side}`, { qty: partsText(amount), good: t(`good.${good.id}`).toLowerCase() })}
        </button>
      </div>
    </>
  );
}

/** Khối "Hành trang" ở hồ sơ (v0.7 F3b): món đang mang, số phần, sức gánh. */
export function PackPanel({ household }: { household: HouseholdView }) {
  const carried = goodsCarried(household);
  const pct = household.goodsCap > 0 ? Math.min(100, Math.round((carried * 100) / household.goodsCap)) : 0;
  return (
    <div class="dossier-block pack-panel">
      <span class="dossier-k">{t('ui.goods.pack')}</span>
      {household.goods.length === 0
        ? <p class="muted small">{t('ui.goods.pack_empty')}</p>
        : <ul class="skill-list">{household.goods.map((g) => <li key={g.id}><span>{t(`good.${g.id}`)}</span><span class="muted">{t('ui.goods.parts', { qty: partsText(g.qty) })}</span></li>)}</ul>}
      <span class="small muted">{t('ui.goods.load', { carried: partsText(carried), cap: partsText(household.goodsCap) })}</span>
      <span class="ink-bar pack-bar"><span class={`ink-bar-fill${pct >= 90 ? ' band-weak' : ''}`} style={{ width: `${pct}%` }} /></span>
    </div>
  );
}
