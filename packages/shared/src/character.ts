// Những gì người chơi được thấy về nhân vật, nhật ký và tổng kết đời (ADR 0001, 0005).
import type { Tick } from './calendar';
import { STAMINA_BANDS, vSkillView, type CountyIndex, type SkillView, type StaminaBand } from './actions';
import { vContentId, type ContentId } from './contentId';
import { TENURES, vHouseholdView, type Coin, type Grain, type HouseholdView, type Tenure } from './economy';
import { arr, bool, int, intRange, nat, nonEmpty, obj, oneOf, record, str, union } from './schema';
import { vBirthplaceId, vNewLifeConfig, type BirthplaceId, type NewLifeConfig } from './world';

export { CONTENT_ID_RE, type ContentId } from './contentId';

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
  /** Quận đang ở và quận nhà (ADR 0009). */
  location: CountyIndex;
  home: CountyIndex;
  /** Thể lực, mức chữ (ADR 0010). */
  staminaBand: StaminaBand;
  /** Kỹ năng đã có, mức chữ, vd. { id: "skill.farming", rank: "rank.novice" }. */
  skills: SkillView[];
  /** Được tự xếp kế hoạch tháng chưa (từ 12 tuổi, ADR 0008). */
  canAct: boolean;
  /** Túi tiền, kho lương, ruộng, mức đói (ADR 0013). */
  household: HouseholdView;
}

/** Khóa không bao giờ được xuất hiện trong CharacterView (test ở shared và sim). */
export const HIDDEN_CHARACTER_KEYS = ['spiritRoot', 'lifespanBase', 'lifespanBonus', 'lifespanCap', 'luck', 'healthMax', 'scars', 'rng', 'hiddenTraits', 'stamina', 'skillXp', 'commandLog', 'hunger', 'stayUntil'] as const;

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
  /** Của cải lúc nhắm mắt: túi, kho, ruộng (F5). */
  estate: { money: Coin; grain: Grain; landMu: number; tenure: Tenure };
  /** Số năm tuổi có ít nhất một tuần không đủ khẩu phần, kể cả lúc còn nhỏ bị bỏ đói (F5). */
  hungerYears: number;
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
  location: nat,
  home: nat,
  staminaBand: oneOf(STAMINA_BANDS),
  skills: arr(vSkillView),
  canAct: bool,
  household: vHouseholdView,
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
  estate: obj<LifeSummary['estate']>({ money: nat, grain: nat, landMu: nat, tenure: oneOf(TENURES) }),
  hungerYears: nat,
  digest: nonEmpty,
});
