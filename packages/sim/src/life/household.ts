// Hộ, khẩu phần tuần, đói (ADR 0013). Toàn số nguyên; lương thực tính bằng thăng, tiền bằng văn.
import { ageYearsAt, GRAIN_PER_DOU, type FoodWeeksBand, type HouseholdView, type HungerBand, type LogEntry, type SupplyBand, type Tenure, type Tick } from '@tsvl/shared';
import type { Rng } from '../core/rng';
import type { CountyEconomy } from '../economy/market';
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
}

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
  return { independent: false, money: 0, grain: 0, landMu: 0, tenure: 'none', hunger: 0, farmWeeks: 0, farmCounty: -1 };
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
export function becomeIndependent(c: CharacterState, home: CountyEconomy): void {
  const share = SHARE_BY_BACKGROUND[c.background];
  const h = c.household;
  const money = Math.min(share.money, home.money);
  const grain = Math.min(share.grain, home.grain);
  home.money -= money; home.grain -= grain;
  h.independent = true;
  h.money += money;
  h.grain += grain;
  h.landMu = share.landMu;
  h.tenure = share.tenure;
}

const BAND_RANK: Record<HungerBand, number> = { fed: 0, hungry: 1, starving: 2, famished: 3 };

/**
 * Pha Hậu quả, đầu pha: ăn một tuần.
 * - Chưa ra riêng: cha mẹ nuôi; quận nhà đói kém thì có thể bị bỏ đói theo xuất thân (luồng economy).
 * - Đã ra riêng: ăn từ kho của mình; thiếu thì tự mua ở chợ quận đang đứng nếu còn tiền (`buy` trả số thăng mua được).
 */
export function feedPhase(c: CharacterState, tick: Tick, homeSupply: SupplyBand, economyRng: Rng, log: Log, buy: (need: number) => number = () => 0): void {
  const h = c.household;
  const ration = rationOf(c, tick);
  let eaten: number;
  if (!h.independent) {
    // Chỉ rút RNG khi đói kém, để năm thường không đổi luồng. Người lớn còn ở nhà là trạng thái tạm tới khi bật
    // ra riêng (S3/S4): được nuôi đủ, không thì hộ cha mẹ trừu tượng "bỏ đói" cả người 60 tuổi.
    const child = ageYearsAt(c.birthTick, tick) < COMING_OF_AGE;
    eaten = child && homeSupply === 'famine' && economyRng.chance(FAMINE_SKIP_PPM[c.background]) ? 0 : ration;
  } else {
    if (h.grain < ration) buy(ration - h.grain);
    eaten = Math.min(h.grain, ration);
    h.grain -= eaten;
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
export function foodWeeksBand(h: HouseholdState, ration: number, buyPricePerDou: number): FoodWeeksBand {
  const weeks = Math.floor((h.grain + Math.floor((h.money * GRAIN_PER_DOU) / Math.max(1, buyPricePerDou))) / ration);
  return weeks < 1 ? 'none' : weeks < 9 ? 'short' : weeks < 36 ? 'season' : 'year';
}

export function householdView(c: CharacterState, tick: Tick, buyPricePerDou: number): HouseholdView {
  const h = c.household;
  return {
    independent: h.independent, money: h.money, grain: h.grain, landMu: h.landMu, tenure: h.tenure,
    hungerBand: hungerBand(h.hunger), foodWeeksBand: foodWeeksBand(h, rationOf(c, tick), buyPricePerDou),
  };
}

/** Hồi thể lực khi đói còn một nửa (ADR 0013). */
export const hungerStaminaPct = (h: HouseholdState) => (h.hunger > 0 ? 50 : 100);
