import { t } from '@tsvl/content';
import type { HouseholdView, MarketView } from '@tsvl/shared';
import { useEffect, useState } from 'preact/hooks';
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
      <button type="button" class="btn ghost market-open" disabled={locked} onClick={onOpen}>{t('ui.market.open')}</button>
    </div>
  );
}

interface DialogProps { market: MarketView; household: HouseholdView; place: string; canAct: boolean; busy: boolean; onTrade: (grain: number) => void; onClose: () => void }

/**
 * Hộp mua bán (F2): chọn mua hay bán, số đấu, thấy ngay tiền trả hay được và túi còn lại rồi mới xác nhận. Không tốn ô
 * thời gian. Giới hạn theo túi, kho mình, kho và quỹ chợ, nên lệnh gửi đi luôn hợp lệ.
 */
export function MarketDialog({ market, household, place, canAct, busy, onTrade, onClose }: DialogProps) {
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
        </div>
      </section>
    </div>
  );
}
