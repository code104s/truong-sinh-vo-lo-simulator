// Thế lực như người chơi thấy (v0.6, ADR 0019). Chỉ kiểu và validate, không có luật; dải chữ, không lộ số.
import type { CountyIndex } from './actions';
import { vContentId, vNpcId, type ContentId, type NpcId } from './contentId';
import { arr, int, nat, obj, oneOf, opt, record, str, union, type Validator } from './schema';

/** Bốn loại thế lực tự vận hành ở v0.6 (Q1): quan phủ, gia tộc, thương hội, băng cướp. */
/** v0.8: `sect` — tông môn ngoài vùng, chỉ có kỳ tuyển và đệ tử ký danh (ADR 0022 Q5). */
export const FACTION_KINDS = ['government', 'clan', 'guild', 'bandits', 'sect'] as const;
export type FactionKind = (typeof FACTION_KINDS)[number];

/** Id thế lực, vd. "f3": cấp tăng dần trong một đời, không dùng lại (như NpcId). */
export type FactionId = string;
export const FACTION_ID_RE = /^f[1-9][0-9]*$/;
export const vFactionId: Validator<FactionId> = {
  check: (u, p) => (typeof u === 'string' && FACTION_ID_RE.test(u) ? null : `${p}: cần id thế lực dạng "f3"`),
};

/** Thế (người, kho, võ nghệ gộp lại) theo dải. */
export const STRENGTH_BANDS = ['feeble', 'modest', 'strong', 'dominant'] as const;
export type StrengthBand = (typeof STRENGTH_BANDS)[number];
/** Thái độ của thế lực với người chơi (để ngỏ tới v0.7; v0.6 chưa gửi). */
export const ATTITUDE_BANDS = ['hostile', 'wary', 'neutral', 'friendly'] as const;
export type AttitudeBand = (typeof ATTITUDE_BANDS)[number];

/**
 * Tên thế lực: khóa nội dung và tham số, giao diện dịch (chữ hiển thị nằm ở `packages/content`), vd.
 * `{ key: 'faction.clan.name', params: { surname: 'Lương', place: 'Vị Kinh' } }` → "Họ Lương ở Vị Kinh".
 */
export interface FactionName {
  key: ContentId;
  params: Record<string, string | number>;
}
export const vFactionName: Validator<FactionName> = obj<FactionName>({ key: vContentId, params: record(union(str, int)) });

/** Cặp quận kề [nhỏ, lớn]. */
const vCountyPair: Validator<[CountyIndex, CountyIndex]> = {
  check: (u, p) => (Array.isArray(u) && u.length === 2 && nat.check(u[0], p) === null && nat.check(u[1], p) === null && (u[0] as number) < (u[1] as number) ? null : `${p}: cần cặp quận [nhỏ, lớn]`),
};

export interface FactionView {
  id: FactionId;
  kind: FactionKind;
  name: FactionName;
  /** Trị sở, nơi đặt nhà, hội quán, sào huyệt. */
  seat: CountyIndex;
  /** Các quận thế lực giữ. */
  counties: CountyIndex[];
  /**
   * Đường thế lực giữ (v0.6 F1: thương hội, băng cướp), mỗi đường một cặp quận kề [nhỏ, lớn]; không giữ đường thì bỏ
   * trống. Bản đồ "ai kiểm soát" vẽ đường bị cướp giữ.
   */
  roads?: [CountyIndex, CountyIndex][];
  strength: StrengthBand;
  /** Số người thuộc thế lực. */
  members: number;
  /** Người cầm đầu (quan, trưởng họ, hội trưởng, đầu đảng), nếu là người có tên. */
  leader?: NpcId;
  attitude?: AttitudeBand;
}

export const vFactionView: Validator<FactionView> = obj<FactionView>({
  id: vFactionId,
  kind: oneOf(FACTION_KINDS),
  name: vFactionName,
  seat: nat,
  counties: arr(nat),
  roads: opt(arr(vCountyPair)),
  strength: oneOf(STRENGTH_BANDS),
  members: nat,
  leader: opt(vNpcId),
  attitude: opt(oneOf(ATTITUDE_BANDS)),
});

/** Số phận của một thế lực trong đời người chơi, cho tổng kết (F4). */
export const FACTION_FATES = ['rose', 'fell', 'gone', 'endured'] as const;
export type FactionFate = (typeof FACTION_FATES)[number];
