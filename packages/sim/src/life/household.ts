// Hộ, khẩu phần tuần, đói (ADR 0013). Toàn số nguyên; lương thực tính bằng thăng, tiền bằng văn.
import { ageYearsAt, GOODS, GRAIN_PER_DOU, type FoodWeeksBand, type HouseholdView, type HungerBand, type LogEntry, type SupplyBand, type Tenure, type Tick } from '@tsvl/shared';
import { mulDiv } from '../core/math';
import type { Rng } from '../core/rng';
import { buyGrain, type CountyEconomy } from '../economy/market';
import type { CharacterState } from './character';
import type { Background } from './params';

export interface HouseholdState {
  /** Đã ra riêng: tự nuôi mình. Trước đó hộ cha mẹ trừu tượng nuôi (ADR 0013). */
  independent: boolean;
  money: number;
  grain: number;
  landMu: number;
  tenure: Tenure;
  /** Bộ đếm đói, ẩn; giao diện chỉ thấy dải mức. */
  hunger: number;
  /** Tuần công mùa này và quận có ruộng đang làm (−1: chưa làm) (ADR 0012). */
  farmWeeks: number;
  farmCounty: number;
  /** Thuế đinh còn nợ (văn); sự kiện quan sai đòi thuế ở S5 (ADR 0014). */
  taxDebt: number;
  /** Nợ vay nặng lãi còn phải trả (văn, đã gồm lãi) và tick tới hạn (−1 = không nợ) (S6). */
  loan: number;
  loanDue: number;
  /** Thế lực cho vay (v0.6 S7: thương hội); null là chủ nợ trong làng, trả về quỹ quận nhà. */
  lender: string | null;
  /** Mùa này: phần thiệt do tai họa đã cứu được (%), và tô bị tăng thêm (%) (S6). Đặt lại sau mùa gặt. */
  reliefPct: number;
  rentHikePct: number;
  /** Phòng dịch tới tick này (−1 = không). */
  shieldUntil: number;
  /** Lập thân: ở lại làm cho nhà tới tuổi này rồi mới ra riêng (0 = không) (ADR 0013). */
  stayUntil: number;
  /** Số năm tuổi có tuần ăn thiếu, và năm tuổi gần nhất đã đếm (−1 = chưa) — cho màn tổng kết (F5). */
  hungerYears: number;
  lastHungerYear: number;
  /** Túi đồ (v0.7 S3b, ADR 0021): phân mỗi món theo thứ tự `GOODS`. */
  goods: number[];
}

/** Sức gánh tối đa (phân, tổng mọi món): 100 phần (ADR 0021 Q17). */
export const GOODS_CAP = 1_000;
export const goodsTotal = (h: HouseholdState): number => h.goods.reduce((s, q) => s + q, 0);

/** Khẩu phần một tuần (thăng): người lớn 1 đấu, dưới 12 tuổi nửa đấu. */
export const RATION_ADULT = 10;
export const RATION_CHILD = 5;
export const CHILD_RATION_AGE = 12;
/** Tuổi lập thân (ADR 0013): luật bỏ đói của hộ cha mẹ chỉ áp cho trẻ dưới tuổi này. */
export const COMING_OF_AGE = 16;
export const HUNGER_MAX = 20;

/** Xác suất (ppm) trẻ bị bỏ đói một tuần khi quận nhà đói kém, theo xuất thân. */
export const FAMINE_SKIP_PPM: Record<Background, number> = { destitute: 300_000, commoner: 150_000, comfortable: 40_000, wealthy: 0 };

/** Phần chia khi ra riêng, theo xuất thân (ADR 0013; số khởi điểm, chốt bằng batch). */
export const SHARE_BY_BACKGROUND: Record<Background, { money: number; grain: number; landMu: number; tenure: Tenure }> = {
  destitute: { money: 0, grain: 50, landMu: 0, tenure: 'tenant' },
  commoner: { money: 300, grain: 200, landMu: 6, tenure: 'owner' },
  comfortable: { money: 2_000, grain: 400, landMu: 15, tenure: 'owner' },
  wealthy: { money: 10_000, grain: 800, landMu: 40, tenure: 'landlord' },
};

/** Hồi sức khỏe (%) và mất sức khỏe mỗi tuần theo bộ đếm đói. */
export const HUNGRY_RECOVERY_PCT = 50;
export const STARVING_DAMAGE = [30, 15] as const;   // 30 + 15 × (đói − 4)
export const FAMISHED_DAMAGE = [100, 20] as const;  // 100 + 20 × (đói − 8)
export const FAMISHED_SCAR_PPM = 250_000;
export const FAMISHED_SCAR = [10, 30] as const;

type Log = (e: Omit<LogEntry, 'tick'>) => void;

export function newHousehold(): HouseholdState {
  return { independent: false, money: 0, grain: 0, landMu: 0, tenure: 'none', hunger: 0, farmWeeks: 0, farmCounty: -1, taxDebt: 0,
    loan: 0, loanDue: -1, lender: null, reliefPct: 0, rentHikePct: 0, shieldUntil: -1, stayUntil: 0, hungerYears: 0, lastHungerYear: -1, goods: GOODS.map(() => 0) };
}

export function hungerBand(hunger: number): HungerBand {
  return hunger === 0 ? 'fed' : hunger <= 3 ? 'hungry' : hunger <= 7 ? 'starving' : 'famished';
}

/** Đang đói lả trở lên: chết lúc này là chết đói; khóa việc nặng. */
export const isStarving = (h: HouseholdState) => h.hunger >= 4;

export function rationOf(c: CharacterState, tick: Tick): number {
  return ageYearsAt(c.birthTick, tick) < CHILD_RATION_AGE ? RATION_CHILD : RATION_ADULT;
}

/**
 * Ra riêng: nhận phần chia theo xuất thân. Tiền và lương lấy từ quỹ, kho của quận nhà (không tạo từ hư không, ADR 0012);
 * quận cạn thì nhận được bao nhiêu hay bấy nhiêu.
 */
export function becomeIndependent(c: CharacterState, home: CountyEconomy, opts: { sharePct?: number; landless?: boolean } = {}): { money: number; grain: number; landMu: number } {
  const share = SHARE_BY_BACKGROUND[c.background];
  const pct = opts.sharePct ?? 100;
  const h = c.household;
  // Không lấy ruộng (lên trấn lập nghiệp): phần lương quy ra tiền theo giá gốc 4 văn/thăng
  const wantMoney = mulDiv(share.money + (opts.landless ? share.grain * 4 : 0), pct, 100);
  const wantGrain = opts.landless ? 0 : mulDiv(share.grain, pct, 100);
  const money = Math.min(wantMoney, home.money);
  const grain = Math.min(wantGrain, home.grain);
  home.money -= money; home.grain -= grain;
  h.independent = true;
  h.stayUntil = 0;
  h.money += money;
  h.grain += grain;
  // Ruộng đã thừa kế lúc còn nhỏ (v0.5 S3) vẫn là của mình: cộng thêm phần chia; có ruộng thừa kế thì ít nhất là tự canh
  const inherited = h.landMu;
  const shareLand = opts.landless ? 0 : share.landMu;
  h.landMu = inherited + shareLand;
  h.tenure = shareLand > 0 ? share.tenure : inherited > 0 ? 'owner' : opts.landless ? 'none' : share.tenure;
  // Trả phần chia lúc lập thân (tin kể "phần chia"); ruộng thừa kế đã báo khi nhận
  return { money, grain, landMu: shareLand };
}

const BAND_RANK: Record<HungerBand, number> = { fed: 0, hungry: 1, starving: 2, famished: 3 };

/**
 * Pha Hậu quả, đầu pha: ăn một tuần.
 * - Chưa ra riêng: cha mẹ nuôi; quận nhà đói kém thì có thể bị bỏ đói theo xuất thân (luồng economy).
 * - Đã ra riêng: ăn từ kho của mình; thiếu thì tự mua ở chợ quận đang đứng nếu còn tiền (`buy` trả số thăng mua được).
 */
/**
 * Cha mẹ thật nuôi một đứa con (v0.5): túi, kho của chính đứa trẻ (12–15 tuổi có đi làm), rồi của người mẹ, người cha
 * còn sống; chợ nơi đang ở.
 */
export interface ParentFeed { own: HouseholdState; parents: readonly HouseholdState[]; market: CountyEconomy }
/** Cha mẹ chỉ chia phần dư: giữ lại một năm ăn của mình và tiền thuế, thuốc (như bộ não: GRAIN_RESERVE, MONEY_RESERVE). */
export const PARENT_KEEP_GRAIN = 360;
export const PARENT_KEEP_MONEY = 300;

export function feedPhase(c: CharacterState, tick: Tick, homeSupply: SupplyBand, economyRng: Rng, log: Log, market: CountyEconomy | null = null, parent: ParentFeed | null = null): void {
  const h = c.household;
  const ration = rationOf(c, tick);
  let eaten: number;
  const child = !h.independent && ageYearsAt(c.birthTick, tick) < COMING_OF_AGE;
  if (child && parent) {
    // Con dưới 16 có cha mẹ thật (chủ dự án chốt sau Bước 0 v0.5): ăn kho mình trước, rồi phần dư của mẹ, của cha;
    // thiếu thì mua bằng túi mình, rồi phần tiền dư của mẹ, của cha
    const own = parent.own;
    eaten = Math.min(own.grain, ration);
    own.grain -= eaten;
    for (const p of parent.parents) { const take = Math.min(Math.max(0, p.grain - PARENT_KEEP_GRAIN), ration - eaten); p.grain -= take; eaten += take; }
    if (eaten < ration) { const got = buyGrain(parent.market, own, ration - eaten); own.grain -= got; eaten += got; }
    for (const p of parent.parents) {
      if (eaten >= ration) break;
      const spendable = { money: Math.max(0, p.money - PARENT_KEEP_MONEY), grain: 0 };
      const before = spendable.money;
      eaten += buyGrain(parent.market, spendable, ration - eaten);
      p.money -= before - spendable.money;
    }
    // Cha mẹ hết cách thì họ hàng, làng xóm cưu mang phần thiếu như hộ trừu tượng (ADR 0013): năm thường đủ ăn, năm đói
    // kém có thể bị bỏ đói (chủ dự án chọn ở S2 v0.5)
    if (eaten < ration && !(homeSupply === 'famine' && economyRng.chance(FAMINE_SKIP_PPM[c.background]))) eaten = ration;
  } else if (!h.independent) {
    // Chỉ rút RNG khi đói kém, để năm thường không đổi luồng. Người lớn còn ở nhà là trạng thái tạm tới khi bật
    // ra riêng (S3/S4): được nuôi đủ, không thì hộ cha mẹ trừu tượng "bỏ đói" cả người 60 tuổi.
    eaten = child && homeSupply === 'famine' && economyRng.chance(FAMINE_SKIP_PPM[c.background]) ? 0 : ration;
  } else {
    if (h.grain < ration && market) buyGrain(market, h, ration - h.grain);
    eaten = Math.min(h.grain, ration);
    h.grain -= eaten;
  }
  if (eaten < ration) {
    const age = ageYearsAt(c.birthTick, tick);
    if (age !== h.lastHungerYear) { h.hungerYears++; h.lastHungerYear = age; }
  }
  const before = hungerBand(h.hunger);
  if (eaten >= ration) h.hunger = Math.max(0, h.hunger - 1);
  else h.hunger = Math.min(HUNGER_MAX, h.hunger + (eaten * 2 >= ration ? 1 : 2));
  const after = hungerBand(h.hunger);
  if (BAND_RANK[after] > BAND_RANK[before]) {
    // Trẻ còn ở nhà không làm được gì để đổi tình thế: đói nhẹ chỉ ghi, đói lả mới ngắt tua
    const major = after !== 'hungry' || h.independent;
    log({ key: `log.hunger.${after}`, params: {}, importance: major ? 'major' : 'minor' });
  } else if (BAND_RANK[before] >= BAND_RANK.starving && BAND_RANK[after] < BAND_RANK.starving) {
    // Qua cơn đói lả; đói nhẹ lên xuống thì không ghi, tránh ngập nhật ký
    log({ key: 'log.hunger.recovered', params: {}, importance: 'minor' });
  }
}

/** Hồi sức khỏe tuần này còn bao nhiêu phần trăm. */
export function hungerRecoveryPct(h: HouseholdState): number {
  return h.hunger === 0 ? 100 : h.hunger <= 3 ? HUNGRY_RECOVERY_PCT : 0;
}

/** Mất sức khỏe vì đói tuần này, và di chứng khi kiệt (luồng health). */
export function hungerDamage(c: CharacterState, healthRng: Rng): number {
  const n = c.household.hunger;
  if (n >= 8) {
    if (healthRng.chance(FAMISHED_SCAR_PPM)) c.scars += healthRng.int(FAMISHED_SCAR[0], FAMISHED_SCAR[1]);
    return FAMISHED_DAMAGE[0] + FAMISHED_DAMAGE[1] * (n - 8);
  }
  if (n >= 4) return STARVING_DAMAGE[0] + STARVING_DAMAGE[1] * (n - 4);
  return 0;
}

/** Kho + tiền quy ra lương theo giá mua (văn/đấu) của chợ đang đứng, nuôi được bao nhiêu tuần. */
export function foodWeeks(h: HouseholdState, ration: number, buyPricePerDou: number): number {
  return Math.floor((h.grain + Math.floor((h.money * GRAIN_PER_DOU) / Math.max(1, buyPricePerDou))) / ration);
}

export function foodWeeksBand(h: HouseholdState, ration: number, buyPricePerDou: number): FoodWeeksBand {
  const weeks = foodWeeks(h, ration, buyPricePerDou);
  return weeks < 1 ? 'none' : weeks < 9 ? 'short' : weeks < 36 ? 'season' : 'year';
}

export function householdView(c: CharacterState, tick: Tick, buyPricePerDou: number): HouseholdView {
  const h = c.household;
  return {
    independent: h.independent, money: h.money, grain: h.grain, landMu: h.landMu, tenure: h.tenure,
    hungerBand: hungerBand(h.hunger), foodWeeksBand: foodWeeksBand(h, rationOf(c, tick), buyPricePerDou),
    grainWeeks: Math.floor(h.grain / rationOf(c, tick)), foodWeeks: foodWeeks(h, rationOf(c, tick), buyPricePerDou),
    goods: GOODS.flatMap((id, g) => (h.goods[g]! > 0 ? [{ id, qty: h.goods[g]! }] : [])), goodsCap: GOODS_CAP,
  };
}

/** Hồi thể lực khi đói còn một nửa (ADR 0013). */
export const hungerStaminaPct = (h: HouseholdState) => (h.hunger > 0 ? 50 : 100);

/** Ở lại làm cho nhà tới hẹn thì phần chia lớn hơn một nửa (ADR 0013). */
export const STAY_SHARE_PCT = 150;

/**
 * Đầu năm, người hẹn ở lại làm cho nhà (lập thân "ở lại", ADR 0013): tới tuổi hẹn thì ra riêng với phần chia lớn hơn,
 * chưa tới thì nộp nửa túi, nửa kho về quận nhà. Người chơi và NPC dùng chung. Trả phần chia khi vừa ra riêng, null nếu chưa.
 */
export function stayAtHomeYear(c: CharacterState, home: CountyEconomy, tick: Tick): { money: number; grain: number; landMu: number } | null {
  const h = c.household;
  if (h.independent || h.stayUntil === 0) return null;
  if (ageYearsAt(c.birthTick, tick) >= h.stayUntil) return becomeIndependent(c, home, { sharePct: STAY_SHARE_PCT });
  const money = Math.floor(h.money / 2), grain = Math.floor(h.grain / 2);
  h.money -= money; home.money += money;
  h.grain -= grain; home.grain += grain;
  return null;
}
