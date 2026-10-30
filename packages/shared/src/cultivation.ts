// Cửa ngõ tu tiên và tu luyện (v0.8, ADR 0022). Chỉ kiểu và validate, không có luật; dải chữ, không lộ số linh khí.
import { arr, bool, nat, nonEmpty, nullable, obj, oneOf, opt, type Validator } from './schema';
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

/** Linh khí nơi đang đứng, theo dải (F2): loãng (thành, trấn), thường (làng), dồi dào (núi), đậm đặc (di tích). Khóa `qi_place.<dải>`. */
export const QI_PLACE_BANDS = ['thin', 'common', 'rich', 'dense'] as const;
export type QiPlaceBand = (typeof QI_PLACE_BANDS)[number];

/** Cơ hội đột phá thành, theo dải (F2, không lộ số). Khóa `chance.<dải>`. */
export const CHANCE_BANDS = ['slim', 'doubtful', 'even', 'likely'] as const;
export type ChanceBand = (typeof CHANCE_BANDS)[number];

/** Tâm cảnh (Q8): dải tính từ tính cách, đói, bệnh, tang, lần hỏng gần đây. Khóa `mind.<dải>`. */
export const MIND_BANDS = ['calm', 'steady', 'troubled', 'shaken'] as const;
export type MindBand = (typeof MIND_BANDS)[number];

/** Xem trước một lần đột phá (F2): hỏi lại người chơi trước khi xếp ô đột phá. */
export interface BreakthroughPreview {
  chance: ChanceBand;
  mind: MindBand;
  /** Linh thạch sẽ dùng hết dù thành hay hỏng. */
  stones: number;
}

/** Chốn tìm cơ duyên (S1): di tích (hang đá cũ), miếu. Khóa nội dung `site.<loại>`. */
export const SITE_KINDS = ['ruin', 'shrine'] as const;
export type SiteKind = (typeof SITE_KINDS)[number];

/** Một chốn người chơi đã biết (F3): quận, loại; bản đồ vẽ triện ở trị sở quận ấy. */
export interface SiteView {
  county: number;
  kind: SiteKind;
}

/** Tin kỳ tuyển năm nay (F3): từ lúc nghe tin (tháng Giêng) tới hết tháng tuyển. */
export interface TrialNews {
  /** Tên tông môn (tham số `name` của `faction.sect.name`). */
  sect: string;
  /** Tên nơi sứ giả xuống (trị sở tông môn trong vùng). */
  place: string;
  /** Quận ấy, để bản đồ, nút đi đường chỉ tới. */
  county: number;
  /** Đang trong tháng tuyển (dự được nếu đứng ở đó). */
  open: boolean;
  /** Người chơi còn dự được: chưa có đường tu, chưa quá tuổi. */
  eligible: boolean;
}

/** Đường tu như người chơi thấy. */
export interface CultivationView {
  realm: Realm;
  /** Dải linh căn; null khi chưa từng được kiểm. */
  root: RootBand | null;
  /** Đường vào; null khi chưa dẫn khí. */
  path: CultivationPath | null;
  /** Linh khí tới đỉnh tầng; null khi chưa dẫn khí. */
  qi: QiBand | null;
  /**
   * Nghĩa vụ đệ tử ký danh (F1): tuần tạp dịch đã làm năm nay trên số tuần phải làm, số năm liền bỏ nghĩa vụ (tới
   * `expelAt` thì bị gạch tên), tiền nộp thay khi thiếu tuần. Chỉ có khi còn tên trong sổ tông môn.
   */
  duty?: SectDutyView;
  /** Linh khí nơi đang đứng (F2); chỉ khi đã có đường tu. */
  place?: QiPlaceBand;
  /** Xem trước đột phá (F2); chỉ khi người phàm có đường tu đã tích linh khí tới đỉnh. */
  breakthrough?: BreakthroughPreview;
  /** Tin kỳ tuyển năm nay (F3), từ tháng nghe tin tới hết tháng tuyển. */
  trial?: TrialNews;
  /** Di tích, miếu đã biết (F3): ở quận từng đặt chân tới; xếp theo quận rồi loại. */
  sites?: SiteView[];
}

export interface SectDutyView {
  weeks: number;
  need: number;
  missed: number;
  expelAt: number;
  fee: number;
}

const vSectDutyView: Validator<SectDutyView> = obj<SectDutyView>({ weeks: nat, need: nat, missed: nat, expelAt: nat, fee: nat });

export const vCultivationView: Validator<CultivationView> = obj<CultivationView>({
  realm: oneOf(REALMS),
  root: nullable(oneOf(ROOT_BANDS)),
  path: nullable(oneOf(CULTIVATION_PATHS)),
  qi: nullable(oneOf(QI_BANDS)),
  duty: opt(vSectDutyView),
  place: opt(oneOf(QI_PLACE_BANDS)),
  breakthrough: opt(obj<BreakthroughPreview>({ chance: oneOf(CHANCE_BANDS), mind: oneOf(MIND_BANDS), stones: nat })),
  trial: opt(obj<TrialNews>({ sect: nonEmpty, place: nonEmpty, county: nat, open: bool, eligible: bool })),
  sites: opt(arr(obj<SiteView>({ county: nat, kind: oneOf(SITE_KINDS) }))),
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
