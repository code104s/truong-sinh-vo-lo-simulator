// Tiền và lương trong hành động: lương làm thuê, học phí, phí thầy thuốc, tiền đường, hái lượm, săn, buôn bán nhỏ,
// thuế đinh, mua bán lương thực (ADR 0012). Mọi đồng tiền đi giữa túi người chơi và quỹ một quận: tổng tiền vùng không đổi.
import { ageYearsAt, calendarOf, GOOD_UNITS_PER_PART, GOODS, GRAIN_PER_DOU, seasonOf, type ContentId, type GoodId, type Season, type Tick } from '@tsvl/shared';
import { idiv, mulDiv } from '../core/math';
import type { Rng } from '../core/rng';
import type { CharacterState } from '../life/character';
import type { Background } from '../life/params';
import { GOODS_CAP, goodsTotal, type HouseholdState } from '../life/household';
import { buyPrice, epidemicAt, GOOD_SPOIL_PERMILLE, goodBuyPrice, goodSellPrice, sellPrice, supplyOf, type CountyEconomy } from './market';
import { rankStep, type CareerState } from '../life/career';

export const HIRE_WAGE = 60;
export const TUITION = 20;
/** Học phí võ đường mỗi ô (v0.7 S4), vào quỹ quận như học phí học chữ. */
export const DOJO_FEE = 40;
export const HEAL_FEE = { none: 30, mild: 30, serious: 100, grave: 300 } as const;
export const LODGING_PER_SLOT = 10;
/** Thiếu tiền trọ thì ngủ bụi: rủi ro đường (%) tăng. */
export const ROUGH_SLEEP_RISK_PCT = 150;
export const FORAGE_BY_SEASON: Record<Season, number> = { spring: 4, summer: 6, autumn: 5, winter: 2 };
export const HUNT_MEAT = 10;
/** Da mỗi ô săn (phân; 10 phân = 1 phần, giá gốc 20 văn): vào túi đồ, bán khi muốn (v0.7 S3b; trước đó trả ngay 20 văn). */
export const HUNT_HIDE = 10;
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

/**
 * Việc riêng của nghề và bậc nghề (v0.7 S2, ADR 0020). Chỉ người chơi có thân phận nghề; NPC chưa có nên mọi hệ số giữ
 * 100% (batch, thế giới không đổi). Bậc theo thứ tự học việc / làm được / có tiếng.
 * - Thợ thủ công: làm thuê lương cao hơn theo bậc; từ "làm được" nhận việc xưởng ở trấn, thành: bỏ vốn vật liệu trước,
 *   có đơn thì được trả gấp ba lương thuê, không có đơn thì mất vật liệu. "Có tiếng" có học trò phụ việc: công cao hơn,
 *   nuôi học trò bằng lương.
 * - Thợ săn: thịt, da theo bậc; bậc cao rủi ro thấp hơn. Đặt bẫy (thợ săn mọi bậc): ít sức, ít rủi ro, được ăn tùy may.
 */
export const HIRE_RANK_PCT = [100, 110, 120] as const;
export const CRAFT_MATERIAL = 40;
export const CRAFT_PAY = HIRE_WAGE * 3;
/** Có đơn (ppm): làm được 70%, có tiếng 85%. Học trò của thợ có tiếng: công ×130%, ăn 2 thăng mỗi ô. */
export const CRAFT_ORDER_PPM = [0, 700_000, 850_000] as const;
export const CRAFT_MASTER_PCT = 130;
export const CRAFT_PUPIL_GRAIN = 2;
export const HUNT_RANK_PCT = [100, 115, 130] as const;
/**
 * Rủi ro săn, bẫy theo bậc (%). v0.7 S9 (chủ dự án chọn hướng A): thợ săn có bậc vào rừng sâu, săn thú lớn — được nhiều
 * hơn (`HUNT_RANK_PCT`) mà nạn cũng nhiều hơn (S2 là 85, 70%: thợ săn lành nghề an toàn hơn người thường, nên nông dân đi
 * săn mùa nông nhàn và thợ săn sống, chết như nhau). Người không theo nghề săn (bậc 0) giữ 100%.
 */
export const HUNT_RANK_RISK_PCT = [100, 160, 220] as const;
/** Bẫy: được (ppm) 40% + kỹ năng săn × 4 / 100 (tới 80%); được thì thịt 6 thăng, da nửa phần, theo kỹ năng và bậc. */
export const TRAP_CATCH_PPM = 400_000;
export const TRAP_MEAT = 6;
export const TRAP_HIDE = 5;
/** Việc xưởng không có đơn (S3b, Q16): làm ra một phần đồ thủ công thay vì mất trắng vật liệu. */
export const CRAFT_WARES = 10;
/**
 * Thảo dược hái được mỗi ô (phân) theo mùa, nhân kỹ năng săn như phần lương (S3b, Q16). ADR ghi "có cơ hội"; ở đây lấy
 * đúng kỳ vọng, không rút thêm RNG, để luồng `actions` của mọi người hái lượm không lệch.
 */
export const FORAGE_HERB_BY_SEASON: Record<Season, number> = { spring: 3, summer: 3, autumn: 1, winter: 0 };
/**
 * Hành nghề y (v0.7 S5, ADR 0020 Q6): người bệnh trong dân nền tìm tới (ppm), trả phí từ quỹ quận như đơn hàng của việc
 * xưởng; phí theo y thuật và bậc, mùa dịch đông khách gấp đôi. Mỗi ca dùng nửa phần thảo dược (S3b): lấy trong túi, thiếu
 * thì mua ở chợ đang đứng; không có thuốc thì chữa qua loa, phí còn một nửa. Kỳ vọng mỗi ô (người làm được, y thuật
 * "Thạo", có thuốc): 80% × 100 × 106% ≈ 85 văn, trừ thuốc ≈ 9 văn — hơn làm thuê (60), kém việc xưởng có tiếng.
 */
export const PRACTICE_FEE = 100;
export const PRACTICE_PATIENT_PPM = 800_000;
export const PRACTICE_RANK_PCT = [100, 100, 130] as const;
export const PRACTICE_EPIDEMIC_PCT = 200;
export const PRACTICE_HERB = 5;
export const PRACTICE_NO_HERB_PCT = 50;

/** Ẩn dật (v0.7 S6, Q7): hái lượm ở quận có lều được nhiều hơn (%) theo bậc — học việc, làm được, có tiếng. */
export const RECLUSE_FORAGE_PCT = [150, 170, 200] as const;

/** Việc ra hàng: gánh đầy thì khóa tạm (Q17). Hái lượm không khóa (cái ăn là chính), chỉ không nhặt thêm thuốc. */
const GOODS_ACTIONS: ReadonlySet<string> = new Set(['action.hunt', 'action.trap', 'action.craft']);

/**
 * Mua ruộng (v0.7 S2): ở quận nhà, của dân nền, tiền vào quỹ quận (sổ cái giữ). Mỗi quận mỗi năm dân nền bán tối đa 3
 * mẫu; năm đói kém người ta bán tháo, giá còn 60%. Giá một mẫu bằng thước đo uy thế gia tộc (1.000 văn, v0.6). Từ 20 mẫu
 * thì thành địa chủ: phần ruộng không tự làm cho tá điền cấy, thu tô.
 */
export const LAND_PRICE = 1_000;
export const LAND_FAMINE_PCT = 60;
export const LAND_SALE_MU = 3;
export const LANDLORD_MU = 20;
export const landPrice = (home: CountyEconomy): number => (supplyOf(home) === 'famine' ? mulDiv(LAND_PRICE, LAND_FAMINE_PCT, 100) : LAND_PRICE);

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

/** Quà khi thăm hỏi, theo xuất thân người thăm (văn): vào túi người được thăm (v0.5 S4, ADR 0017 Q7). */
export const GIFT_BY_BACKGROUND: Record<Background, number> = { destitute: 10, commoner: 30, comfortable: 100, wealthy: 300 };
/**
 * Sính lễ theo xuất thân nhà trai (văn), gấp mười quà thăm hỏi (v0.5 S5, ADR 0018 Q8): nhà trai đưa sang túi người vợ.
 * Cùng luật cho người chơi và NPC. Nhà trai giữ lại 1.000 văn để lo cửa nhà; không đủ thì chỉ đưa phần dư ("cưới
 * chạy"). Đo ở S5 (`pnpm sim world`, chết đói NPC; trước S5 10,0%): đưa hết 10,2%, giữ 300 văn 10,1%, giữ 1.000 văn 9,8%.
 */
export const BRIDE_PRICE_BY_BACKGROUND: Record<Background, number> = { destitute: 100, commoner: 300, comfortable: 1_000, wealthy: 3_000 };
export const BRIDE_PRICE_KEEP = 1_000;
export function payBridePrice(groom: CharacterState, bride: CharacterState): number {
  const n = Math.max(0, Math.min(BRIDE_PRICE_BY_BACKGROUND[groom.background], groom.household.money - BRIDE_PRICE_KEEP));
  groom.household.money -= n; bride.household.money += n;
  return n;
}

/** Phí theo bệnh nặng nhất; không bệnh thì phí khám. */
export function healFee(c: CharacterState): number {
  return c.conditions.reduce<number>((fee, x) => Math.max(fee, HEAL_FEE[x.severity]), HEAL_FEE.none);
}

/** Lương một ô làm thuê của người chưa có tay nghề ở chợ này (văn): trấn có thương hội trả cao hơn (v0.6 S6). */
export const wageOf = (market: CountyEconomy): number => mulDiv(HIRE_WAGE, market.wagePct, 100);

/** Khóa vì tiền ở chợ đang đứng; null nếu không vướng. Là khóa tạm: hết khi có tiền hoặc quận có việc. */
export function moneyLock(id: string, c: CharacterState, market: CountyEconomy): ContentId | null {
  const money = c.household.money;
  if (GOODS_ACTIONS.has(id) && goodsTotal(c.household) >= GOODS_CAP) return 'lock.goods_full';
  switch (id) {
    case 'action.craft': return money < CRAFT_MATERIAL ? 'lock.money' : null;
    case 'action.buy_land':
      if (!c.household.independent) return 'lock.dependent';
      if (c.location !== c.home) return 'lock.not_home';
      if (market.landSold >= LAND_SALE_MU) return 'lock.no_land';
      return money < landPrice(market) ? 'lock.money' : null;
    case 'action.hire': return market.money < wageOf(market) ? 'lock.no_work' : null;
    case 'action.study': return money < TUITION ? 'lock.money' : null;
    case 'action.dojo': return money < DOJO_FEE ? 'lock.money' : null;
    case 'action.heal': return money < healFee(c) ? 'lock.money' : null;
    case 'action.trade': return money < TRADE_MIN_CAPITAL ? 'lock.money' : null;
    case 'action.visit': return money < GIFT_BY_BACKGROUND[c.background] ? 'lock.money' : null;
    default: return null;
  }
}

/** Mức tiền để hiển thị trong kế hoạch. */
export function moneyCost(id: string): ContentId {
  switch (id) {
    case 'action.study': case 'action.travel': case 'action.visit': case 'action.dojo': case 'action.practice': return 'money.low';
    case 'action.haul': case 'action.join_guild': return 'money.capital';
    case 'action.propose': return 'money.medium';
    case 'action.apprentice': return 'money.low';
    case 'action.heal': return 'money.medium';
    case 'action.trade': case 'action.buy_land': return 'money.capital';
    case 'action.craft': return 'money.low';
    default: return 'money.none';
  }
}

export function moneyGains(id: string): ContentId[] {
  switch (id) {
    case 'action.hire': case 'action.trade': case 'action.practice': return ['gain.money'];
    case 'action.forage': return ['gain.food'];
    case 'action.visit': return ['gain.bond'];
    case 'action.ask_help': return ['gain.food', 'gain.money'];
    case 'action.propose': return ['gain.family'];
    case 'action.apprentice': case 'action.enlist': case 'action.drift': case 'action.build_hut': return ['gain.career'];
    case 'action.hunt': case 'action.trap': return ['gain.food', 'gain.goods'];
    case 'action.craft': return ['gain.money', 'gain.goods'];
    case 'action.haul': return ['gain.money'];
    case 'action.join_guild': return ['gain.guild'];
    case 'action.buy_land': return ['gain.land'];
    default: return [];
  }
}

/**
 * Thanh toán và thu hoạch của một ô đã làm, ở chợ quận đang đứng. Trả về hệ số rủi ro (%) cho phần rủi ro thân thể
 * (ngủ bụi khi đi đường). Buôn bán nhỏ rút lãi/lỗ trên luồng actions.
 */
export function settleAction(id: string, c: CharacterState, tick: Tick, market: CountyEconomy, rng: Rng, physician: { money: number } | null = null, career: CareerState | null = null): number {
  const h = c.household;
  switch (id) {
    case 'action.hire': {
      // Trấn có thương hội thuê thêm (v0.6 S6): phần trả thêm quỹ quận ứng trước, ghi lại để thương hội hoàn
      const base = mulDiv(mulDiv(HIRE_WAGE, skillPct(c.skillXp.crafting), 100), HIRE_RANK_PCT[rankStep(career, 'artisan')], 100);
      const got = receive(h, market, mulDiv(base, market.wagePct, 100));
      market.wageBonus += Math.max(0, got - base);
      return 100;
    }
    case 'action.study':
      pay(h, market, TUITION);
      return 100;
    case 'action.dojo':
      pay(h, market, DOJO_FEE);
      return 100;
    case 'action.heal': {
      // Quận có thầy thuốc NPC thì phí vào túi thầy thuốc (v0.5 S3, Q5); không có thì vào quỹ quận như v0.3
      const fee = healFee(c);
      if (physician) { const n = Math.max(0, Math.min(fee, h.money)); h.money -= n; physician.money += n; }
      else pay(h, market, fee);
      return 100;
    }
    case 'action.travel': case 'action.haul':
      // Người lưu lạc kiếm ăn dọc đường như hái lượm (S6, Q7)
      if (id === 'action.travel' && career?.id === 'drifter') h.grain += mulDiv(FORAGE_BY_SEASON[seasonOf(tick)], skillPct(c.skillXp.hunting), 100);
      return pay(h, market, LODGING_PER_SLOT) < LODGING_PER_SLOT ? ROUGH_SLEEP_RISK_PCT : 100;
    case 'action.forage':
      // Người ẩn dật hái lượm quanh lều được nhiều hơn: nương rẫy, vườn rau (S6, Q7)
      h.grain += mulDiv(mulDiv(FORAGE_BY_SEASON[seasonOf(tick)], skillPct(c.skillXp.hunting), 100), career?.id === 'recluse' && c.location === c.home ? RECLUSE_FORAGE_PCT[rankStep(career, 'recluse')] : 100, 100);
      addGoods(h, HERB, mulDiv(FORAGE_HERB_BY_SEASON[seasonOf(tick)], skillPct(c.skillXp.hunting), 100));
      return 100;
    case 'action.hunt': {
      const pct = mulDiv(skillPct(c.skillXp.hunting), HUNT_RANK_PCT[rankStep(career, 'hunter')], 100);
      h.grain += mulDiv(HUNT_MEAT, pct, 100);
      addGoods(h, HIDE, mulDiv(HUNT_HIDE, pct, 100));
      return 100;
    }
    case 'action.trap': {
      // Rút một lần dù được hay không
      if (!rng.chance(TRAP_CATCH_PPM + c.skillXp.hunting * 40)) return 100;
      const pct = mulDiv(skillPct(c.skillXp.hunting), HUNT_RANK_PCT[rankStep(career, 'hunter')], 100);
      h.grain += mulDiv(TRAP_MEAT, pct, 100);
      addGoods(h, HIDE, mulDiv(TRAP_HIDE, pct, 100));
      return 100;
    }
    case 'action.craft': {
      // Vật liệu trả trước vào chợ; có đơn thì quỹ quận trả công. Thợ có tiếng nuôi học trò bằng lương
      const step = rankStep(career, 'artisan');
      pay(h, market, CRAFT_MATERIAL);
      if (step === 2) { const g = Math.min(CRAFT_PUPIL_GRAIN, h.grain); h.grain -= g; market.grain += g; }
      if (rng.chance(CRAFT_ORDER_PPM[step])) receive(h, market, mulDiv(mulDiv(CRAFT_PAY, skillPct(c.skillXp.crafting), 100), step === 2 ? CRAFT_MASTER_PCT : 100, 100));
      else addGoods(h, WARES, CRAFT_WARES);
      return 100;
    }
    case 'action.practice': {
      // Rút một lần dù có khách hay không
      if (!rng.chance(PRACTICE_PATIENT_PPM)) return 100;
      const herb = useHerb(h, market);
      const pct = mulDiv(epidemicAt(market, tick) ? PRACTICE_EPIDEMIC_PCT : 100, herb ? 100 : PRACTICE_NO_HERB_PCT, 100);
      receive(h, market, mulDiv(mulDiv(mulDiv(PRACTICE_FEE, skillPct(c.skillXp.medicine), 100), PRACTICE_RANK_PCT[rankStep(career, 'physician')], 100), pct, 100));
      return 100;
    }
    case 'action.buy_land': {
      if (market.landSold >= LAND_SALE_MU || h.money < landPrice(market)) return 100;
      pay(h, market, landPrice(market));
      market.landSold++;
      h.landMu++;
      if (h.tenure === 'none' || h.tenure === 'tenant') h.tenure = 'owner';
      if (h.landMu >= LANDLORD_MU) h.tenure = 'landlord';
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

/**
 * Chi dùng trong năm (v0.5 S3, chủ dự án chọn): người đã ra riêng tiêu mỗi năm một phần số tiền vượt ngưỡng — áo quần,
 * nhà cửa, giỗ chạp, quà cáp. Tiền vào quỹ quận đang ở. Cùng luật cho người chơi và NPC. Không có chỗ tiêu này thì của
 * dồn mãi vào túi người có tên qua thừa kế (đo ở S3: NPC nắm 45–60% tổng tiền sau 100 năm).
 * Ngưỡng 15.000 văn (S8, chủ dự án duyệt; S3 là 5.000): chi dùng trên 5.000 văn làm mỏng của dưỡng già, người chơi máy
 * điều độ chết đói 5,5% (3.000 đời); trên 15.000 văn còn 3,3%, NPC vẫn chỉ nắm 15–31% tổng tiền sau 100 năm.
 */
export const LIVING_SPEND_KEEP = 15_000;
export const LIVING_SPEND_PERMILLE = 40;
export function yearlySpending(c: CharacterState, here: CountyEconomy): number {
  const h = c.household;
  if (!h.independent || h.money <= LIVING_SPEND_KEEP) return 0;
  return pay(h, here, Math.floor(((h.money - LIVING_SPEND_KEEP) * LIVING_SPEND_PERMILLE) / 1000));
}

/** Thuế đinh ở một quận theo mức thuế người giữ quận đặt (v0.6 S6): 100–300 văn, lệ cũ 200. */
export const headTaxOf = (home: CountyEconomy): number => mulDiv(HEAD_TAX, home.taxPct, 100);

/** Đầu năm: người đã ra riêng từ 16 tuổi nộp thuế đinh cho quận nhà; thiếu thì ghi nợ (sự kiện thu thuế ở S5). */
export function headTax(c: CharacterState, home: CountyEconomy, tick: Tick): number {
  const h = c.household;
  if (!h.independent || ageYearsAt(c.birthTick, tick) < HEAD_TAX_AGE) return 0;
  const due = headTaxOf(home);
  const paid = pay(h, home, due);
  home.taxMoney += paid;
  h.taxDebt += due - paid;
  return paid;
}

const HIDE = GOODS.indexOf('hide'), WARES = GOODS.indexOf('wares'), HERB = GOODS.indexOf('herb');

/** Hàng làm ra vào túi đồ, trong sức gánh (phần vượt bỏ lại); trả số phân đã nhận. */
export function addGoods(h: HouseholdState, g: number, qty: number): number {
  const n = Math.max(0, Math.min(qty, GOODS_CAP - goodsTotal(h)));
  h.goods[g]! += n;
  return n;
}

/**
 * Lệnh TRADE_GOODS (v0.7 S3b, ADR 0021): mua (> 0) hoặc bán (< 0) đúng số phân một món ở chợ đang đứng, giá mỗi phần; mua
 * làm tròn lên, bán làm tròn xuống như lương. Không đủ tiền, hàng, quỹ quận hay sức gánh thì từ chối cả lệnh.
 */
export function tradeGoods(h: HouseholdState, market: CountyEconomy, good: GoodId, qty: number): string | null {
  const g = GOODS.indexOf(good), cg = market.goods[g]!;
  if (qty > 0) {
    const cost = idiv(qty * goodBuyPrice(cg) + GOOD_UNITS_PER_PART - 1, GOOD_UNITS_PER_PART);
    if (qty > cg.stock) return 'chợ không đủ hàng';
    if (goodsTotal(h) + qty > GOODS_CAP) return 'không gánh nổi';
    if (cost > h.money) return 'không đủ tiền';
    h.money -= cost; market.money += cost;
    h.goods[g]! += qty; cg.stock -= qty;
    return null;
  }
  const n = -qty;
  const proceeds = idiv(n * goodSellPrice(cg), GOOD_UNITS_PER_PART);
  if (n > h.goods[g]!) return 'không đủ hàng để bán';
  if (proceeds > market.money) return 'chợ không đủ tiền mua';
  h.goods[g]! -= n; cg.stock += n;
  market.money -= proceeds; h.money += proceeds;
  return null;
}

/** Thuốc cho một ca (S5): lấy trong túi, thiếu thì mua đủ phần thiếu ở chợ theo giá mua; trả về có thuốc hay không. */
function useHerb(h: HouseholdState, market: CountyEconomy): boolean {
  const own = Math.min(h.goods[HERB]!, PRACTICE_HERB), need = PRACTICE_HERB - own;
  const cg = market.goods[HERB]!, cost = idiv(need * goodBuyPrice(cg) + GOOD_UNITS_PER_PART - 1, GOOD_UNITS_PER_PART);
  if (need > 0 && (need > cg.stock || cost > h.money)) return false;
  h.goods[HERB]! -= own;
  if (need > 0) { cg.stock -= need; h.money -= cost; market.money += cost; }
  return true;
}

/** NPC bán hết hàng ở chợ đang đứng cuối lượt (Q15), trong giới hạn quỹ quận; trả số tiền nhận được. */
export function sellAllGoods(h: HouseholdState, market: CountyEconomy): number {
  let got = 0;
  for (let g = 0; g < GOODS.length; g++) {
    const q = h.goods[g]!;
    if (q === 0) continue;
    const cg = market.goods[g]!, price = Math.max(1, goodSellPrice(cg));
    const n = Math.min(q, idiv(market.money * GOOD_UNITS_PER_PART, price));
    if (n <= 0) continue;
    const proceeds = idiv(n * price, GOOD_UNITS_PER_PART);
    h.goods[g]! -= n; cg.stock += n;
    market.money -= proceeds; h.money += proceeds;
    got += proceeds;
  }
  return got;
}

/** Hư hao túi đồ mỗi tháng (Q17), cùng tỉ lệ với kho quận, làm tròn tới phân gần nhất. */
export function spoilGoods(h: HouseholdState): void {
  for (let g = 0; g < GOODS.length; g++) if (h.goods[g]! > 0) h.goods[g]! -= idiv(h.goods[g]! * GOOD_SPOIL_PERMILLE[g]! + 500, 1000);
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
