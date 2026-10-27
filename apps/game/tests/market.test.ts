import { birthplaceId, regionId, type Birthplace } from '@tsvl/shared';
import { Life } from '@tsvl/sim';
import { describe, expect, it } from 'vitest';
import { afterTrade, tradeBlock, tradeGrain, tradeLimit, tradeTotal } from '../src/app/market';
import { hasKey } from '@tsvl/content';

const bp: Birthplace = { id: birthplaceId('r0/c0'), name: 'Phố Kỳ', nameHan: '浦岐', kind: 'town', cell: { x: 0, y: 0 }, county: 0 };
/** Người lớn có túi riêng ở chợ thật của sim. */
function adult(money: number, grain: number) {
  const l = Life.create({ worldSeed: 'market', regionId: regionId('r0'), birthplaceId: bp.id, lifeSeed: 1 }, bp);
  const s = l.snapshot();
  s.character.birthTick = 0; s.tick = 20 * 36 + 3;
  s.character.household = { ...s.character.household, money, grain };
  return Life.restore(s, [], undefined);
}

describe('chợ (F2)', () => {
  it('giới hạn mua bán khớp luật sim: hết mức thì được nhận, thêm một đấu thì bị từ chối', () => {
    for (const [money, grain] of [[1_000, 500], [137, 95], [5, 3], [100_000, 0]] as const) {
      for (const side of ['buy', 'sell'] as const) {
        const l = adult(money, grain);
        const m = l.market(), h = l.view().household;
        const n = tradeLimit(side, m, h);
        if (n > 0) {
          const before = { money: h.money, grain: h.grain };
          expect(l.trade(tradeGrain(side, n)), `${side} ${n} khi có ${money} văn ${grain} thăng`).toBeNull();
          const now = l.view().household;
          // Tiền trả/được đúng như hộp mua bán báo trước
          expect(Math.abs(now.money - before.money)).toBe(tradeTotal(side, n, m));
          expect(afterTrade(side, n, m, h)).toEqual({ money: now.money, dou: Math.floor(now.grain / 10) });
        }
        const fresh = adult(money, grain);
        expect(fresh.trade(tradeGrain(side, n + 1)), `${side} ${n + 1}`).not.toBeNull();
        expect(tradeBlock(side, fresh.market(), fresh.view().household, true) === null).toBe(n > 0);
      }
    }
  });

  it('lý do khóa có chuỗi hiển thị; trẻ con không mua bán', () => {
    const l = adult(0, 0);
    const m = l.market(), h = l.view().household;
    expect(tradeBlock('buy', m, h, false)).toBe('ui.market.why.child');
    expect(tradeBlock('buy', m, h, true)).toBe('ui.market.why.no_money');
    expect(tradeBlock('sell', m, h, true)).toBe('ui.market.why.no_grain');
    expect(tradeBlock('buy', { ...m, maxBuy: 5 }, { ...h, money: 10_000 }, true)).toBe('ui.market.why.no_stock');
    expect(tradeBlock('sell', { ...m, maxSell: 0 }, { ...h, grain: 100 }, true)).toBe('ui.market.why.no_coin');
    for (const key of ['ui.market.why.child', 'ui.market.why.no_money', 'ui.market.why.no_grain', 'ui.market.why.no_stock', 'ui.market.why.no_coin',
      'supply.plenty', 'supply.normal', 'supply.scarce', 'supply.famine', 'trend.rising', 'trend.steady', 'trend.falling']) expect(hasKey(key), key).toBe(true);
  });
});
