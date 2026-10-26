// Những gì người chơi được thấy về nhân vật, nhật ký và tổng kết đời (ADR 0001, 0005).
import type { Tick } from './calendar';
import { arr, bool, int, intRange, nat, nonEmpty, obj, oneOf, record, str, union, type Validator } from './schema';
import { vBirthplaceId, vNewLifeConfig, type BirthplaceId, type NewLifeConfig } from './world';

/** Id nội dung; nhãn hiển thị nằm trong packages/content. Dạng "nhóm.tên". */
export type ContentId = string;
export const CONTENT_ID_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;
const vContentId: Validator<ContentId> = {
  check: (u, p) => (typeof u === 'string' && CONTENT_ID_RE.test(u) ? null : `${p}: cần id nội dung dạng "nhom.ten"`),
};

export const GENDERS = ['male', 'female'] as const;
export type Gender = (typeof GENDERS)[number];

export const HEALTH_BANDS = ['robust', 'healthy', 'weak', 'ill', 'dying'] as const;
export type HealthBand = (typeof HEALTH_BANDS)[number];

export const SEVERITIES = ['mild', 'serious', 'grave'] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface ConditionView {
  id: ContentId;
  severity: Severity;
}

/**
 * Nhân vật như người chơi thấy. KHÔNG có: linh căn, thọ nguyên gốc, phúc duyên, thiên phú ẩn,
 * trạng thái RNG. Validator từ chối mọi khóa lạ, nên sim lỡ đưa trường ẩn vào sẽ bị chặn ở ranh giới.
 */
export interface CharacterView {
  /** Hán-Việt, vd. "Trần Văn An". */
  name: string;
  gender: Gender;
  birthTick: Tick;
  /** Tuổi thật, năm tròn. */
  ageYears: number;
  birthplaceId: BirthplaceId;
  /** Xuất thân, vd. "background.peasant". */
  background: ContentId;
  personality: ContentId;
  /** Mô tả thô thể chất, vd. "constitution.frail". */
  constitution: ContentId;
  /** Mô tả thô ngộ tính, vd. "aptitude.bright". */
  aptitude: ContentId;
  /** Thiên phú người chơi biết (có thể rỗng). */
  traits: ContentId[];
  /** Sức khỏe hiện tại làm tròn 0..100 bước 5. */
  healthPct: number;
  healthBand: HealthBand;
  conditions: ConditionView[];
  alive: boolean;
}

/** Khóa không bao giờ được xuất hiện trong CharacterView (test ở shared và sim). */
export const HIDDEN_CHARACTER_KEYS = ['spiritRoot', 'lifespanBase', 'lifespanBonus', 'lifespanCap', 'luck', 'healthMax', 'scars', 'rng', 'hiddenTraits'] as const;

export interface LogEntry {
  tick: Tick;
  /** Khóa nội dung, vd. "log.illness.onset". */
  key: string;
  params: Record<string, string | number>;
  importance: 'minor' | 'major';
}

export const DEATH_CAUSES = ['old_age', 'illness', 'accident', 'starvation', 'violence', 'disaster'] as const;
export type DeathCause = (typeof DEATH_CAUSES)[number];

export interface LifeSummary {
  config: NewLifeConfig;
  name: string;
  birthTick: Tick;
  deathTick: Tick;
  ageYears: number;
  cause: DeathCause;
  /** Chi tiết nguyên nhân, vd. "illness.consumption". */
  causeDetail: ContentId;
  birthplaceId: BirthplaceId;
  /** Các LogEntry importance = 'major'. */
  milestones: LogEntry[];
  digest: string;
}

export const vCharacterView = obj<CharacterView>({
  name: nonEmpty,
  gender: oneOf(GENDERS),
  birthTick: nat,
  ageYears: nat,
  birthplaceId: vBirthplaceId,
  background: vContentId,
  personality: vContentId,
  constitution: vContentId,
  aptitude: vContentId,
  traits: arr(vContentId),
  healthPct: intRange(0, 100),
  healthBand: oneOf(HEALTH_BANDS),
  conditions: arr(obj<ConditionView>({ id: vContentId, severity: oneOf(SEVERITIES) })),
  alive: bool,
});

export const vLogEntry = obj<LogEntry>({
  tick: nat,
  key: vContentId,
  params: record(union(str, int)),
  importance: oneOf(['minor', 'major'] as const),
});

export const vLifeSummary = obj<LifeSummary>({
  config: vNewLifeConfig,
  name: nonEmpty,
  birthTick: nat,
  deathTick: nat,
  ageYears: nat,
  cause: oneOf(DEATH_CAUSES),
  causeDetail: vContentId,
  birthplaceId: vBirthplaceId,
  milestones: arr(vLogEntry),
  digest: nonEmpty,
});
