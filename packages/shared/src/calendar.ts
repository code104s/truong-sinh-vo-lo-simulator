// Lịch (ADR 0002): 1 tick = 1 tuần = 10 ngày, 3 tuần = 1 tháng, 12 tháng = 1 năm.

export const DAYS_PER_TICK = 10;
export const TICKS_PER_MONTH = 3;
export const MONTHS_PER_YEAR = 12;
export const TICKS_PER_YEAR = TICKS_PER_MONTH * MONTHS_PER_YEAR; // 36

/** Số nguyên ≥ 0; tick 0 = thượng tuần tháng Giêng năm 1 của thế giới. */
export type Tick = number;
/** 0 thượng tuần, 1 trung tuần, 2 hạ tuần. */
export type TenDay = 0 | 1 | 2;
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
/** Lịch nông (ADR 0012): mọi quận gặt đầu tháng Chín. Ở đây để sim và giao diện cùng một mốc (dự báo "đủ ăn tới…", F4). */
export const HARVEST_MONTH = 9;

/** Số tuần từ tick này tới tuần đầu của mùa gặt kế tiếp (đang ở tuần gặt thì là 0). */
export function weeksToHarvest(tick: Tick): number {
  const inYear = tick % TICKS_PER_YEAR;
  const harvest = (HARVEST_MONTH - 1) * TICKS_PER_MONTH;
  return (harvest - inYear + TICKS_PER_YEAR) % TICKS_PER_YEAR;
}

export interface CalendarDate {
  tick: Tick;
  /** ≥ 1 */
  year: number;
  /** 1..12 */
  month: number;
  tenDay: TenDay;
  season: Season;
}

const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];

export function seasonOfMonth(month: number): Season {
  return SEASONS[Math.floor((month - 1) / 3)]!;
}

export function calendarOf(tick: Tick): CalendarDate {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError(`tick không hợp lệ: ${tick}`);
  const inYear = tick % TICKS_PER_YEAR;
  const month = Math.floor(inYear / TICKS_PER_MONTH) + 1;
  return {
    tick,
    year: Math.floor(tick / TICKS_PER_YEAR) + 1,
    month,
    tenDay: (tick % TICKS_PER_MONTH) as TenDay,
    season: seasonOfMonth(month),
  };
}

/** Tháng 1–12 và mùa của một tick, không dựng CalendarDate (đường nóng của sim, v0.6 Bước 0). Tick không âm. */
export const monthOf = (tick: Tick): number => Math.floor((tick % TICKS_PER_YEAR) / TICKS_PER_MONTH) + 1;
export const seasonOf = (tick: Tick): Season => seasonOfMonth(monthOf(tick));

/** Tick đầu tháng / đầu năm: nơi các pha có nhịp tháng, năm chạy (ADR 0002). */
export const isMonthStart = (tick: Tick) => tick % TICKS_PER_MONTH === 0;
export const isQuarterStart = (tick: Tick) => tick % (TICKS_PER_MONTH * 3) === 0;
export const isYearStart = (tick: Tick) => tick % TICKS_PER_YEAR === 0;

/** Tuổi thật theo năm tròn. */
export function ageYearsAt(birthTick: Tick, tick: Tick): number {
  return Math.floor((tick - birthTick) / TICKS_PER_YEAR);
}
