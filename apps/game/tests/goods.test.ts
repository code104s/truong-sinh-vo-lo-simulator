// Kho đồ trên giao diện (v0.7 F3b): mua bán hàng khớp luật sim, hành trang, bảng chuyến buôn.
import { hasKey, t } from '@tsvl/content';
import { birthplaceId, GOODS, regionId, type ActionOption, type Birthplace, type GoodId, type HaulOption } from '@tsvl/shared';
import { Life } from '@tsvl/sim';
import { describe, expect, it } from 'vitest';
import { goodHave, goodsBlock, goodsCarried, goodsLimit, goodsQty, goodsTotal, haulRows, partsText } from '../src/app/goods';
import { planDirty, planInvalid } from '../src/app/plan';

const bp: Birthplace = { id: birthplaceId('r0/c0'), name: 'Phố Kỳ', nameHan: '浦岐', kind: 'town', cell: { x: 0, y: 0 }, county: 0 };
/** Người lớn ở chợ thật của sim, túi tiền và túi hàng (phân, theo thứ tự GOODS) cho sẵn. */
function adult(money: number, goods: [number, number, number]) {
  const l = Life.create({ worldSeed: 'goods', regionId: regionId('r0'), birthplaceId: bp.id, lifeSeed: 1 }, bp);
  const s = l.snapshot();
  s.character.birthTick = 0; s.tick = 20 * 36 + 3;
  s.character.household = { ...s.character.household, independent: true, money, goods: [...goods] };
  return Life.restore(s, [], undefined);
}

describe('mua bán hàng (v0.7 F3b)', () => {
  it('giới hạn khớp luật sim: hết mức thì được nhận, thêm một phân thì bị từ chối; tiền trả, được đúng như báo trước', () => {
    for (const [money, goods] of [[5_000, [0, 0, 0]], [137, [25, 3, 7]], [3, [0, 0, 11]], [100_000, [990, 0, 0]]] as const) {
      for (const id of GOODS) for (const side of ['buy', 'sell'] as const) {
        const l = adult(money, [...goods]);
        const g = l.market().goods.find((x) => x.id === id)!, h = l.view().household;
        const n = goodsLimit(side, g, h);
        if (n > 0) {
          const before = h.money;
          expect(l.tradeGoods(id, goodsQty(side, n)), `${side} ${id} ${n}`).toBeNull();
          expect(Math.abs(l.view().household.money - before)).toBe(goodsTotal(side, n, g));
        }
        // Thêm một phân thì bị từ chối — trừ khi quỹ chợ là giới hạn: sim làm tròn tiền bán xuống nên `maxSell` sim gửi có
        // thể thấp hơn mức thật một phân (an toàn: lệnh gửi đi không bao giờ bị từ chối)
        const more = adult(money, [...goods]).tradeGoods(id, goodsQty(side, n + 1));
        if (!(side === 'sell' && n === g.maxSell)) expect(more, `${side} ${id} ${n + 1}`).not.toBeNull();
        expect(goodsBlock(side, g, h, true) === null).toBe(n > 0);
      }
    }
  });

  it('hành trang tính theo phần; gánh đầy thì không mua thêm; trẻ con không mua bán', () => {
    const l = adult(10_000, [25, 0, 3]);
    const h = l.view().household, g = l.market().goods[0]!;
    expect(h.goods).toEqual([{ id: 'hide', qty: 25 }, { id: 'herb', qty: 3 }]);
    expect([partsText(25), partsText(3), partsText(40), goodsCarried(h), goodHave(h, 'wares')]).toEqual(['2,5', '0,3', '4', 28, 0]);
    expect(goodsBlock('buy', g, { ...h, goods: [{ id: 'hide', qty: h.goodsCap }] }, true)).toBe('ui.goods.why.full');
    expect(goodsBlock('sell', l.market().goods[1]!, h, true)).toBe('ui.goods.why.none');
    expect(goodsBlock('buy', g, h, false)).toBe('ui.market.why.child');
    for (const k of ['ui.goods.why.no_stock', 'ui.goods.why.full', 'ui.goods.why.no_money', 'ui.goods.why.none', 'ui.goods.pack', 'ui.goods.pack_empty', 'ui.goods.load',
      'ui.goods.after', 'ui.goods.confirm_buy', 'ui.goods.confirm_sell', 'ui.goods.per_part', 'ui.goods.grain']) expect(hasKey(k), k).toBe(true);
    expect(t('ui.goods.confirm_sell', { qty: partsText(25), good: t('good.hide').toLowerCase() })).toBe('Bán 2,5 phần da thú');
  });
});

describe('chuyến buôn trong kế hoạch (v0.7 F3b)', () => {
  const h = (county: number, cargo: HaulOption['cargo'], profit: number, locked: string | null = null): HaulOption => ({ county, cargo, slots: 4, margin: profit > 0 ? 5 : -2, profit, risk: 'risk.low', locked });

  it('gom theo quận đích, quận lời nhất (trong các chuyến không khóa) lên đầu', () => {
    const rows = haulRows([h(1, 'grain', 300), h(1, 'hide', -40, 'lock.no_profit'), h(2, 'grain', 120), h(2, 'herb', 900, 'lock.money'), h(3, 'grain', -5, 'lock.no_profit')]);
    expect(rows.map((r) => [r.county, r.options.length])).toEqual([[1, 2], [2, 2], [3, 1]]);
    for (const k of ['ui.haul.title', 'ui.haul.hint', 'ui.haul.none', 'ui.haul.danger', 'ui.haul.margin_dou', 'ui.haul.margin_part', 'ui.haul.profit', 'ui.haul.carry', 'ui.haul.pick_hint']) expect(hasKey(k), k).toBe(true);
  });

  it('ô chuyến buôn cần quận đích đi được; đổi hàng chở là bản nháp đã sửa', () => {
    const actions: ActionOption[] = [{ id: 'action.haul', group: 'travel', slots: 1, cost: { stamina: 'cost.medium', risk: 'risk.low', money: 'money.none' }, gains: [], locked: null }, { id: 'action.rest', group: 'rest', slots: 1, cost: { stamina: 'cost.none', risk: 'risk.none', money: 'money.none' }, gains: [], locked: null }];
    const travel = [{ county: 2, slots: 2, risk: 'risk.low' }];
    const plan = (target: number | undefined, cargo?: GoodId) => ({ slots: [{ action: 'action.haul', ...(target === undefined ? {} : { target }), ...(cargo ? { cargo } : {}) }, { action: 'action.rest' }, { action: 'action.rest' }] }) as Parameters<typeof planInvalid>[0];
    expect(planInvalid(plan(2), actions, travel)).toBe(false);
    expect(planInvalid(plan(5), actions, travel)).toBe(true);
    expect(planInvalid(plan(undefined), actions, travel)).toBe(true);
    expect(planDirty(plan(2, 'hide'), plan(2))).toBe(true);
    expect(planDirty(plan(2, 'hide'), plan(2, 'hide'))).toBe(false);
  });
});
