// Mọi con số cân bằng của v0.1 (ADR 0005). Giá trị khởi điểm, chốt bằng `pnpm sim batch` (task S12).
// Xác suất theo ppm (phần triệu) mỗi tuần; hệ số theo phần trăm (100 = không đổi); sức khỏe 0..1000.
import type { Season, SettlementKind } from '@tsvl/shared';

export const BACKGROUNDS = ['destitute', 'commoner', 'comfortable', 'wealthy'] as const;
export type Background = (typeof BACKGROUNDS)[number];

export const PERSONALITIES = [
  'righteous', 'calm', 'hot_tempered', 'cunning', 'kind', 'aloof', 'ambitious', 'cheerful', 'timid', 'eccentric', 'loyal', 'greedy',
] as const;

/** Trọng số xuất thân theo loại nơi sinh. */
export const BACKGROUND_WEIGHTS: Record<SettlementKind, readonly number[]> = {
  village: [35, 50, 12, 3],
  town: [25, 50, 18, 7],
  city: [25, 45, 20, 10],
};

export const ELEMENTS = ['metal', 'wood', 'water', 'fire', 'earth'] as const;
export type Element = (typeof ELEMENTS)[number];
/** Tỉ lệ có linh căn (giá trị tạm, chốt ở v0.8). */
export const SPIRIT_ROOT_PPM = 50_000;
/** Trọng số số hệ linh căn 1..5. */
export const SPIRIT_ROOT_COUNT_WEIGHTS = [10, 20, 30, 25, 15];

export interface TraitDef {
  id: string;
  visible: boolean;
  weight: number;
  /** Không đi cùng thiên phú này. */
  excludes?: string;
  lifespanYears?: number;
  illnessPct?: number;
  accidentPct?: number;
  healthMaxDelta?: number;
}
export const TRAITS: readonly TraitDef[] = [
  { id: 'hardy', visible: true, weight: 10, excludes: 'sickly', lifespanYears: 3, illnessPct: 70 },
  { id: 'sickly', visible: true, weight: 8, excludes: 'hardy', lifespanYears: -5, illnessPct: 150, healthMaxDelta: -100 },
  { id: 'nimble', visible: true, weight: 10, excludes: 'clumsy', accidentPct: 60 },
  { id: 'clumsy', visible: true, weight: 8, excludes: 'nimble', accidentPct: 150 },
  { id: 'keen_memory', visible: true, weight: 10 },
  { id: 'longevity_mark', visible: false, weight: 6, lifespanYears: 5 },
];
/** Trọng số số thiên phú 0, 1, 2. */
export const TRAIT_COUNT_WEIGHTS = [50, 40, 10];

// —— Thọ nguyên ——
export const LIFESPAN_BASE_YEARS = 50;
/** Cộng tổng LIFESPAN_DICE lần int(0..LIFESPAN_DIE_MAX) (Irwin–Hall). */
export const LIFESPAN_DICE = 4;
export const LIFESPAN_DIE_MAX = 10;
export const LIFESPAN_MIN_YEARS = 45;
export const LIFESPAN_MAX_YEARS = 95;
/** Hiệu chỉnh thọ nguyên theo thể chất 1..10 (năm). */
export const LIFESPAN_BY_CONSTITUTION = [-6, -5, -3, -2, -1, 0, 1, 2, 4, 6];
export const LIFESPAN_BY_BACKGROUND: Record<Background, number> = { destitute: -3, commoner: 0, comfortable: 2, wealthy: 3 };

// —— Sức khỏe ——
export const HEALTH_FULL = 1000;
/** Trần sức khỏe theo tỉ lệ tuổi/thọ nguyên (‰). */
export const HEALTH_MAX_BY_AGE_RATIO: readonly (readonly [number, number])[] = [
  [0, 700], [200, 1000], [550, 1000], [800, 750], [950, 450], [1000, 250],
];
export const HEALTH_MAX_FLOOR = 50;
/** Hồi phục mỗi tuần khi không bệnh: cơ sở + mỗi điểm thể chất + theo xuất thân. */
export const RECOVERY_BASE = 25;
export const RECOVERY_PER_CONSTITUTION = 4;
/** Hồi phục khi đang bệnh (%), theo mức nặng nhất đang mắc. */
export const RECOVERY_WHILE_ILL: Record<Severity, number> = { mild: 50, serious: 25, grave: 0 };
export const RECOVERY_BY_BACKGROUND: Record<Background, number> = { destitute: 0, commoner: 5, comfortable: 10, wealthy: 15 };
/** Thuốc men giảm tổn hại bệnh (%). */
export const MEDICINE_BY_BACKGROUND: Record<Background, number> = { destitute: 0, commoner: 5, comfortable: 15, wealthy: 25 };

// —— Bệnh ——
/** Xác suất khởi phát bệnh mỗi tuần theo tuổi (năm): [tuổi tối thiểu, ppm]. */
export const ILLNESS_ONSET_BY_AGE: readonly (readonly [number, number])[] = [
  [0, 6_000], [5, 4_000], [15, 12_000], [40, 14_000], [60, 18_000],
];
export const ILLNESS_BY_SEASON: Record<Season, number> = { spring: 120, summer: 110, autumn: 100, winter: 130 };
export const ILLNESS_BY_BACKGROUND: Record<Background, number> = { destitute: 130, commoner: 100, comfortable: 85, wealthy: 75 };
/** Sức khỏe dưới ngưỡng này thì dễ bệnh hơn. */
export const ILLNESS_WEAK_THRESHOLD = 500;
export const ILLNESS_WEAK_PCT = 150;

export type Severity = 'mild' | 'serious' | 'grave';
export interface IllnessDef {
  id: string;
  severity: Severity;
  weight: number;
  season: Record<Season, number>;
  /** Hệ số theo loại nơi sinh (%). */
  place: Record<SettlementKind, number>;
  /** Chỉ xảy ra khi tỉ lệ tuổi/thọ nguyên ≥ giá trị này (‰). */
  minAgeRatio?: number;
  /** Số tuần [min, max]. */
  weeks: readonly [number, number];
  /** Tổn hại mỗi tuần [min, max]. */
  damage: readonly [number, number];
  /** Xác suất để lại di chứng khi khỏi (ppm) và mức di chứng [min, max]. */
  scarPpm: number;
  scar: readonly [number, number];
}
const SAME = { village: 100, town: 100, city: 100 };
export const ILLNESSES: readonly IllnessDef[] = [
  { id: 'cold', severity: 'mild', weight: 60, season: { spring: 200, summer: 100, autumn: 150, winter: 300 }, place: SAME, weeks: [1, 3], damage: [20, 60], scarPpm: 0, scar: [0, 0] },
  { id: 'fever', severity: 'serious', weight: 25, season: { spring: 100, summer: 300, autumn: 200, winter: 100 }, place: SAME, weeks: [2, 6], damage: [30, 90], scarPpm: 200_000, scar: [20, 60] },
  { id: 'dysentery', severity: 'grave', weight: 12, season: { spring: 100, summer: 300, autumn: 150, winter: 50 }, place: { village: 100, town: 140, city: 200 }, weeks: [1, 3], damage: [80, 200], scarPpm: 400_000, scar: [40, 120] },
  { id: 'consumption', severity: 'serious', weight: 2, season: { spring: 100, summer: 100, autumn: 100, winter: 100 }, place: { village: 100, town: 120, city: 150 }, weeks: [12, 60], damage: [5, 20], scarPpm: 1_000_000, scar: [80, 200] },
  { id: 'stroke', severity: 'grave', weight: 5, season: { spring: 100, summer: 100, autumn: 100, winter: 150 }, place: SAME, minAgeRatio: 700, weeks: [1, 1], damage: [300, 700], scarPpm: 1_000_000, scar: [100, 300] },
];

// —— Tai nạn ——
export const ACCIDENT_BY_AGE: readonly (readonly [number, number])[] = [
  [0, 150], [5, 250], [15, 300], [60, 400],
];
/** Phần tai nạn gây chết ngay (ppm). */
export const ACCIDENT_FATAL_PPM = 150_000;
export interface InjuryDef {
  id: string;
  severity: Severity;
  weight: number;
  weeks: readonly [number, number];
  damage: readonly [number, number];
  scarPpm: number;
  scar: readonly [number, number];
}
export const INJURIES: readonly InjuryDef[] = [
  { id: 'wound', severity: 'mild', weight: 60, weeks: [1, 3], damage: [20, 50], scarPpm: 50_000, scar: [10, 30] },
  { id: 'fracture', severity: 'serious', weight: 40, weeks: [3, 8], damage: [30, 80], scarPpm: 500_000, scar: [30, 80] },
];

/** Mốc tuổi ghi vào nhật ký (và ngắt tua). */
export const AGE_MILESTONES = [15, 30, 50, 60, 70, 80, 90];
/** Giới hạn an toàn: tua `untilEvent` quá chừng này tick thì báo lỗi (ADR 0002). */
export const UNTIL_EVENT_MAX_TICKS = 3600;
