// v0.7 S3b: kho đồ — ba món hàng, chợ hàng mỗi quận, túi đồ của hộ, lệnh TRADE_GOODS, chuyến buôn chở hàng (ADR 0021).
import { birthplaceId, GOODS, regionId, type CareerRank, type GoodId } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { describe, expect, it } from 'vitest';
import { Life, Rng, simulateWorld } from '../src/index';
import { pastComingOfAge } from './auto';
import {
  createEconomy, economyMonth, GOOD_BASE_PRICE, GOOD_INITIAL_MONTHS, goodBuyPrice, goodSellPrice, goodUse, marketView, PRICE_BY_STOCK, type EconomyState,
} from '../src/economy/market';
import {
  CRAFT_WARES, HUNT_HIDE, moneyLock, sellAllGoods, settleAction, spoilGoods, tradeGoods, TRAP_HIDE,
} from '../src/economy/income';
import { haulLock, haulMargin, haulTrip, HAUL_ROBBED_PPM, type HaulWorld } from '../src/life/merchant';
import { bequeath } from '../src/npc/lifecycle';
import { GOODS_CAP, goodsTotal, newHousehold } from '../src/life/household';
import { previewTravel } from '../src/life/travel';
import type { CareerState } from '../src/life/career';
import type { FactionState } from '../src/factions/state';
import type { LifeSnapshot } from '../src/life/life';
import { vLifeSnapshot } from '../src/life/validate';

/** Quận 0 làng, quận 1 trấn, kề nhau 60 km. */
const region: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [0, 1].map((worldIndex) => ({ worldIndex, area: 100, seat: { x: worldIndex, y: 0 }, name: `Quận ${worldIndex}` })),
  settlementKind: ['village', 'town'], adjacency: [[0, 1]], terrainPct: [100], fertilityPct: [100, 100], seatKm: [[0, 60], [60, 0]],
};
const bp = { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village' as const, cell: { x: 0, y: 0 }, county: 0 };
const HIDE = GOODS.indexOf('hide'), WARES = GOODS.indexOf('wares'), HERB = GOODS.indexOf('herb');
const always = { chance: () => true } as unknown as Rng;
const never = { chance: () => false } as unknown as Rng;
const noLog = () => {};
const career = (id: CareerState['id'], rank: CareerRank): CareerState => ({ id, rank, since: 0, faction: null, mentor: null, years: 0, weeks: 0, idle: 0 });

function adult(): LifeSnapshot {
  const s = Life.create({ worldSeed: 'goods', regionId: regionId('r0'), birthplaceId: bp.id }, bp, region).snapshot();
  s.character.birthTick = 0; s.tick = 25 * 36 + 10;
  s.character.health = s.character.healthMax = 1000; s.character.stamina = 900; s.character.conditions = [];
  Object.assign(s.character.household, { independent: true, money: 20_000, grain: 500 });
  s.character.skillXp.hunting = 0; s.character.skillXp.crafting = 0;
  return pastComingOfAge(s);
}
const money = (s: LifeSnapshot) => s.character.household.money + s.economy.counties.reduce((x, ce) => x + ce.money, 0) + s.factions.list.reduce((x, f) => x + f.money, 0);

describe('chợ hàng mỗi quận (S3b, Q14)', () => {
  it('lúc đầu mỗi món đủ dùng 4 tháng; giá theo tồn như lương', () => {
    const eco = createEconomy(region, 0);
    GOODS.forEach((_, g) => {
      const ce = eco.counties[0]!, use = goodUse(ce, g, 'village');
      expect(ce.goods[g]!.stock).toBe(use * GOOD_INITIAL_MONTHS);
      // 4 tháng tồn: 150% − (50 × 1/3) giá gốc
      expect(ce.goods[g]!.price).toBe(Math.trunc((GOOD_BASE_PRICE[g]! * (150 - Math.trunc((50 * 1000) / 3000))) / 100));
    });
    expect(PRICE_BY_STOCK[0]![1]).toBe(500);
  });

  it('100 năm: kho không âm, không món nào kẹt ở trần hay đáy; làng rẻ thuốc, trấn rẻ đồ thủ công', () => {
    const eco = createEconomy(region, 0);
    let stuck = 0, months = 0;
    for (let t = 0; t < 100 * 36; t += 3) {
      economyMonth(eco, region, t);
      for (const ce of eco.counties) for (let g = 0; g < GOODS.length; g++) {
        expect(ce.goods[g]!.stock).toBeGreaterThanOrEqual(0);
        const pct = Math.trunc((ce.goods[g]!.price * 100) / GOOD_BASE_PRICE[g]!);
        if (pct >= 400 || pct <= 75) stuck++;
        months++;
      }
    }
    expect(stuck / months).toBeLessThan(0.2);
    const [v, town] = eco.counties as [EconomyState['counties'][0], EconomyState['counties'][0]];
    // Da: dân nền làng làm ra thiếu, phần còn lại do thợ săn bán vào (không có ở test này)
    expect(v.goods[HERB]!.price).toBeLessThan(town.goods[HERB]!.price);
    expect(town.goods[WARES]!.price).toBeLessThan(v.goods[WARES]!.price);
  });

  it('lái buôn chở hàng từ quận rẻ sang quận đắt khi chênh vượt phí chở; tiền vùng không đổi', () => {
    const eco = createEconomy(region, 0);
    const [v, town] = eco.counties;
    v!.goods[WARES]!.price = 20; town!.goods[WARES]!.price = 200; v!.goods[WARES]!.stock = 10_000;
    const before = v!.money + town!.money, margin = eco.tradeMargin[0]![1];
    const tv = town!.goods[WARES]!.stock;
    economyMonth(eco, region, 3);
    expect(v!.money + town!.money).toBe(before);
    expect(eco.tradeMargin[0]![1]).toBeGreaterThan(margin);
    // Trấn nhận thêm hàng chở sang (dân nền trấn làm ra nhiều hơn dùng nên kho chỉ tăng)
    expect(town!.goods[WARES]!.stock).toBeGreaterThan(tv);
  });

  it('chợ hàng trong MarketView: giá mua 115%, bán 85% giá niêm yết mỗi phần', () => {
    const eco = createEconomy(region, 0);
    const m = marketView(eco, 0);
    expect(m.goods.map((x) => x.id)).toEqual([...GOODS]);
    const g = eco.counties[0]!.goods[HIDE]!;
    expect(m.goods[HIDE]).toMatchObject({ buyPrice: goodBuyPrice(g), sellPrice: goodSellPrice(g), maxBuy: g.stock });
    expect(goodBuyPrice(g)).toBe(Math.trunc((g.price * 115) / 100));
  });
});

describe('túi đồ của hộ (S3b, Q15–Q17)', () => {
  it('lệnh mua bán hàng: mua làm tròn lên, bán làm tròn xuống; thiếu tiền, hàng, quỹ hay sức gánh thì từ chối cả lệnh', () => {
    const s = adult(), h = s.character.household, ce = s.economy.counties[0]!;
    const before = money(s), stock = ce.goods[HIDE]!.stock, buy = goodBuyPrice(ce.goods[HIDE]!);
    expect(tradeGoods(h, ce, 'hide', 15)).toBeNull();
    expect(h.goods[HIDE]).toBe(15);
    expect(ce.goods[HIDE]!.stock).toBe(stock - 15);
    expect(h.money).toBe(20_000 - Math.ceil((15 * buy) / 10));
    expect(money(s)).toBe(before);
    expect(tradeGoods(h, ce, 'hide', -16)).not.toBeNull();
    expect(tradeGoods(h, ce, 'hide', ce.goods[HIDE]!.stock + 1)).not.toBeNull();
    expect(tradeGoods(h, ce, 'hide', GOODS_CAP)).not.toBeNull();
    const purse = h.money;
    h.money = 0;
    expect(tradeGoods(h, ce, 'herb', 1)).not.toBeNull();
    h.money = purse;
    const m = h.money;
    expect(tradeGoods(h, ce, 'hide', -15)).toBeNull();
    expect(h.money - m).toBe(Math.trunc((15 * goodSellPrice(ce.goods[HIDE]!)) / 10));
    expect(h.goods[HIDE]).toBe(0);
    expect(money(s)).toBe(before);
    ce.money = 0; h.goods[WARES] = 10;
    expect(tradeGoods(h, ce, 'wares', -10)).not.toBeNull();
    expect(h.goods[WARES]).toBe(10);
  });

  it('săn, bẫy ra da vào túi thay vì tiền; việc xưởng không có đơn ra đồ thủ công; hái lượm mùa xuân ra thảo dược', () => {
    const s = adult(), c = s.character, h = c.household, ce = s.economy.counties[0]!;
    const m = h.money;
    settleAction('action.hunt', c, s.tick, ce, never);
    expect(h.goods[HIDE]).toBe(HUNT_HIDE);
    expect(h.money).toBe(m);
    settleAction('action.trap', c, s.tick, ce, always, null, career('hunter', 'apprentice'));
    expect(h.goods[HIDE]).toBe(HUNT_HIDE + TRAP_HIDE);
    settleAction('action.craft', c, s.tick, ce, never, null, career('artisan', 'journeyman'));
    expect(h.goods[WARES]).toBe(CRAFT_WARES);
    const herb = h.goods[HERB]!;
    // Tháng 2 (xuân)
    settleAction('action.forage', c, 36 * 25 + 3, ce, never);
    expect(h.goods[HERB]!).toBeGreaterThan(herb);
    // Mùa đông không có thảo dược
    const winter = h.goods[HERB]!;
    settleAction('action.forage', c, 36 * 25 + 33, ce, never);
    expect(h.goods[HERB]).toBe(winter);
  });

  it('gánh đầy thì việc ra hàng bị khóa tạm; hái lượm vẫn làm được', () => {
    const s = adult(), c = s.character, ce = s.economy.counties[0]!;
    c.household.goods[WARES] = GOODS_CAP;
    expect(goodsTotal(c.household)).toBe(GOODS_CAP);
    expect(moneyLock('action.hunt', c, ce)).toBe('lock.goods_full');
    expect(moneyLock('action.trap', c, ce)).toBe('lock.goods_full');
    expect(moneyLock('action.craft', c, ce)).toBe('lock.goods_full');
    expect(moneyLock('action.forage', c, ce)).toBeNull();
    const herb = c.household.goods[HERB];
    settleAction('action.forage', c, 36 * 25 + 3, ce, never);
    expect(c.household.goods[HERB]).toBe(herb);
  });

  it('hư hao mỗi tháng theo món: da 1%, đồ thủ công không hư, thảo dược 3%', () => {
    const h = newHousehold();
    h.goods = [1000, 1000, 1000];
    spoilGoods(h);
    expect(h.goods).toEqual([990, 1000, 970]);
  });

  it('bán hết ở chợ (NPC cuối lượt): quỹ quận không đủ thì giữ phần còn lại', () => {
    const s = adult(), h = s.character.household, ce = s.economy.counties[0]!;
    h.goods = [100, 0, 30];
    const before = money(s);
    sellAllGoods(h, ce);
    expect(h.goods).toEqual([0, 0, 0]);
    expect(money(s)).toBe(before);
    h.goods = [100, 0, 0]; ce.money = goodSellPrice(ce.goods[HIDE]!) * 3;
    sellAllGoods(h, ce);
    expect(h.goods[HIDE]).toBe(70);
  });

  it('thừa kế chia cả hàng như tiền, lương', () => {
    const from = newHousehold(), a = newHousehold(), b = newHousehold();
    from.goods = [11, 4, 0];
    bequeath(from, [a, b]);
    expect(a.goods).toEqual([6, 2, 0]);
    expect(b.goods).toEqual([5, 2, 0]);
  });

  it('snapshot có túi đồ hợp lệ; túi đồ sai số món bị từ chối', () => {
    const s = adult();
    s.character.household.goods = [3, 0, 7];
    expect(vLifeSnapshot.check(JSON.parse(JSON.stringify(s)), '$')).toBeNull();
    s.character.household.goods = [3, 0];
    expect(vLifeSnapshot.check(JSON.parse(JSON.stringify(s)), '$')).toContain('goods');
  });

  it('HouseholdView chỉ liệt kê món đang có, kèm sức gánh', () => {
    const s = adult();
    s.character.household.goods = [0, 12, 0];
    const life = Life.restore(s, [], region);
    expect(life.view().household.goods).toEqual([{ id: 'wares', qty: 12 }]);
    expect(life.view().household.goodsCap).toBe(GOODS_CAP);
  });
});

describe('chuyến buôn chở hàng (S3b, Q18)', () => {
  const route = [0, 1];
  const preview = () => previewTravel(region, 0, 1)!;
  const world = (s: LifeSnapshot, rng: Rng): HaulWorld => ({ eco: s.economy, logic: region, factions: s.factions, roads: null, career: career('merchant', 'apprentice'), rng });
  function priced(s: LifeSnapshot, good: GoodId, from: number, to: number) {
    const g = GOODS.indexOf(good);
    s.economy.counties[0]!.goods[g]!.price = from; s.economy.counties[1]!.goods[g]!.price = to;
    s.economy.counties[0]!.goods[g]!.stock = 100_000; s.economy.counties[1]!.money = 1_000_000;
  }

  it('lời theo giá hàng đã chọn; hàng đi từ kho quận nguồn sang kho quận đích; sổ cái giữ', () => {
    const s = adult();
    priced(s, 'wares', 40, 90);
    expect(haulMargin(s.economy, region, route, 'wares')).toBe(90 - 40 - 3);
    expect(haulLock(s.character, s.economy, route, region, 'wares')).toBeNull();
    const before = money(s), s0 = s.economy.counties[0]!.goods[WARES]!.stock, s1 = s.economy.counties[1]!.goods[WARES]!.stock;
    const r = haulTrip(s.character, preview(), world(s, never), noLog, 'wares');
    expect(r.grain).toBe(Math.floor((1000 * 10) / 43));
    expect(s.economy.counties[0]!.goods[WARES]!.stock).toBe(s0 - r.grain);
    expect(s.economy.counties[1]!.goods[WARES]!.stock).toBe(s1 + r.grain);
    expect(money(s)).toBe(before);
    priced(s, 'hide', 30, 31);
    expect(haulLock(s.character, s.economy, route, region, 'hide')).toBe('lock.no_profit');
  });

  it('bị cướp: hàng bán tháo ở chợ quận sào huyệt, quỹ quận trả nửa giá vào kho băng', () => {
    const s = adult();
    priced(s, 'wares', 40, 90);
    const bandits: FactionState = { id: 'f7', kind: 'bandits', name: { key: 'faction.bandits.name', params: { place: 'Quận 1' } }, seat: 1, counties: [], holds: [], roads: [0], members: [], leader: null, power: 0, losses: 0, greed: 0, termEnds: 0, relations: [], money: 0, grain: 0, founded: 0, ended: null };
    s.factions.list.push(bandits);
    const before = money(s), seat = s.economy.counties[1]!, stock = seat.goods[WARES]!.stock;
    expect(HAUL_ROBBED_PPM).toBeGreaterThan(0);
    const r = haulTrip(s.character, preview(), world(s, always), noLog, 'wares');
    expect(r.loss).toBe('robbed');
    expect(seat.goods[WARES]!.stock).toBe(stock + r.grain);
    expect(bandits.money).toBe(Math.trunc(Math.trunc((r.grain * seat.goods[WARES]!.price) / 10) * 50 / 100));
    expect(bandits.grain).toBe(0);
    expect(money(s)).toBe(before);
  });
});

describe('NPC cùng luật (S3b, Q15)', () => {
  it('thế giới tự chạy 5 năm: NPC bán hết hàng cuối lượt, sổ cái giữ', () => {
    const stats = simulateWorld(region, 5, 'goods-world');
    expect(stats.ledgerBreaks).toBe(0);
    expect(stats.moneyEnd).toBe(stats.moneyStart);
    expect(stats.npcGoodsEnd).toBe(0);
  });
});
