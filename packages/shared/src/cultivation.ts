// Cửa ngõ tu tiên và tu luyện (v0.8, ADR 0022). Chỉ kiểu và validate, không có luật; dải chữ, không lộ số linh khí.
import { arr, bool, nat, nullable, obj, oneOf, opt, type Validator } from './schema';
import type { Tick } from './calendar';

/** Cảnh giới ở v0.8 (Q1): phàm nhân, Luyện Khí tầng 1 (trần v0.8). v0.9 thêm tầng 2, 3. Khóa nội dung `realm.<id>`. */
export const REALMS = ['mortal', 'qi1'] as const;
export type Realm = (typeof REALMS)[number];

/** Linh căn sau khi được kiểm (Q4): không có, tạp, khá, tốt. Khóa nội dung `root.<dải>`. */
export const ROOT_BANDS = ['none', 'mixed', 'fair', 'good'] as const;
export type RootBand = (typeof ROOT_BANDS)[number];

/** Đường vào (GDD 3.2 L): đệ tử ký danh tông môn, tán tu. Khóa nội dung `cultivation.path.<id>`. */
export const CULTIVATION_PATHS = ['sect', 'rogue'] as const;
export type CultivationPath = (typeof CULTIVATION_PATHS)[number];

/** Linh khí đã tích tới đỉnh tầng đang tu, theo dải (không lộ số). Khóa nội dung `qi.<dải>`. */
export const QI_BANDS = ['empty', 'low', 'half', 'high', 'peak'] as const;
export type QiBand = (typeof QI_BANDS)[number];

/** Đường tu như người chơi thấy. */
export interface CultivationView {
  realm: Realm;
  /** Dải linh căn; null khi chưa từng được kiểm. */
  root: RootBand | null;
  /** Đường vào; null khi chưa dẫn khí. */
  path: CultivationPath | null;
  /** Linh khí tới đỉnh tầng; null khi chưa dẫn khí. */
  qi: QiBand | null;
}

export const vCultivationView: Validator<CultivationView> = obj<CultivationView>({
  realm: oneOf(REALMS),
  root: nullable(oneOf(ROOT_BANDS)),
  path: nullable(oneOf(CULTIVATION_PATHS)),
  qi: nullable(oneOf(QI_BANDS)),
});

/** Một đời tu cho tổng kết (F4): linh căn đã biết, cảnh giới cao nhất, lúc dẫn khí, các lần đột phá. */
export interface CultivationRecord {
  root: RootBand | null;
  realm: Realm;
  path: CultivationPath | null;
  entered?: Tick;
  breakthroughs: { at: Tick; ok: boolean }[];
}

export const vCultivationRecord: Validator<CultivationRecord> = obj<CultivationRecord>({
  root: nullable(oneOf(ROOT_BANDS)),
  realm: oneOf(REALMS),
  path: nullable(oneOf(CULTIVATION_PATHS)),
  entered: opt(nat),
  breakthroughs: arr(obj<{ at: Tick; ok: boolean }>({ at: nat, ok: bool })),
});
