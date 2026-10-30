// Những gì người chơi được thấy về nhân vật, nhật ký và tổng kết đời (ADR 0001, 0005).
import type { Tick } from './calendar';
import { STAMINA_BANDS, vSkillView, type CountyIndex, type SkillView, type StaminaBand } from './actions';
import { vContentId, vNpcId, type ContentId, type NpcId } from './contentId';
import { FACTION_FATES, FACTION_KINDS, vFactionName, type FactionFate, type FactionKind, type FactionName } from './factions';
import { CAREERS, vCareerRecord, vCareerView, type CareerId, type CareerRecord, type CareerView } from './careers';
import { vCultivationRecord, vCultivationView, type CultivationRecord, type CultivationView } from './cultivation';
import { TENURES, vHouseholdView, type Coin, type Grain, type HouseholdView, type Tenure } from './economy';
import { arr, bool, int, intRange, nat, nonEmpty, nullable, obj, oneOf, opt, record, str, union } from './schema';
import { vBirthplaceId, vNewLifeConfig, type BirthplaceId, type NewLifeConfig } from './world';

export { CONTENT_ID_RE, type ContentId } from './contentId';

export const GENDERS = ['male', 'female'] as const;
export type Gender = (typeof GENDERS)[number];

export const HEALTH_BANDS = ['robust', 'healthy', 'weak', 'ill', 'dying'] as const;
export type HealthBand = (typeof HEALTH_BANDS)[number];

export const SEVERITIES = ['mild', 'serious', 'grave'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Tiếng tăm của người chơi ở một quận, theo dải (v0.5, ADR 0017). */
export const REPUTATION_BANDS = ['infamous', 'disliked', 'unknown', 'respected', 'renowned'] as const;
export type ReputationBand = (typeof REPUTATION_BANDS)[number];

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
  /** Tiếng tăm ở quận đang đứng (v0.5, ADR 0017). */
  reputation: ReputationBand;
  /** Vợ/chồng còn sống (v0.5, ADR 0018). */
  spouse?: NpcId;
  /** Thân phận nghề (v0.7, ADR 0020); null khi chưa vào nghề nào (sống bằng việc tự do). */
  career: CareerView | null;
  /** Đường tu (v0.8, ADR 0022): cảnh giới, linh căn đã kiểm, đường vào, linh khí theo dải. */
  cultivation: CultivationView;
}

/** Khóa không bao giờ được xuất hiện trong CharacterView (test ở shared và sim). */
export const HIDDEN_CHARACTER_KEYS = ['spiritRoot', 'lifespanBase', 'lifespanBonus', 'lifespanCap', 'luck', 'healthMax', 'scars', 'rng', 'hiddenTraits', 'stamina', 'skillXp', 'commandLog', 'hunger', 'stayUntil'] as const;

export interface LogEntry {
  tick: Tick;
  /** Khóa nội dung, vd. "log.illness.onset". */
  key: string;
  params: Record<string, string | number>;
  importance: 'minor' | 'major';
  /** Kết quả sự kiện riêng của một nghề (v0.7 F3): biên niên lọc "Nghề" theo trường này. */
  career?: CareerId;
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
  /** Di sản quan hệ (v0.5): vợ/chồng, con, số bạn và kẻ thù, tiếng tăm ở quê nhà. */
  legacy: Legacy;
  digest: string;
}

export interface Legacy {
  spouse: { name: string; alive: boolean } | null;
  children: { name: string; alive: boolean }[];
  friends: number;
  enemies: number;
  reputation: ReputationBand;
  /** Thế lực đã thấy thịnh, suy, mất trong đời (v0.6, F4). */
  factions: { name: FactionName; kind: FactionKind; fate: FactionFate }[];
  /** Các nghề đã làm trong đời: bậc cao nhất, số năm (v0.7, F4). */
  careers: CareerRecord[];
  /** Một đời tu (v0.8, F4): linh căn đã biết, cảnh giới, các lần đột phá. */
  cultivation: CultivationRecord;
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
  reputation: oneOf(REPUTATION_BANDS),
  spouse: opt(vNpcId),
  career: nullable(vCareerView),
  cultivation: vCultivationView,
});

export const vLogEntry = obj<LogEntry>({
  tick: nat,
  key: vContentId,
  params: record(union(str, int)),
  importance: oneOf(['minor', 'major'] as const),
  career: opt(oneOf(CAREERS)),
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
  legacy: obj<Legacy>({
    spouse: nullable(obj<{ name: string; alive: boolean }>({ name: nonEmpty, alive: bool })),
    children: arr(obj<{ name: string; alive: boolean }>({ name: nonEmpty, alive: bool })),
    friends: nat, enemies: nat, reputation: oneOf(REPUTATION_BANDS),
    factions: arr(obj<{ name: FactionName; kind: FactionKind; fate: FactionFate }>({ name: vFactionName, kind: oneOf(FACTION_KINDS), fate: oneOf(FACTION_FATES) })),
    careers: arr(vCareerRecord),
    cultivation: vCultivationRecord,
  }),
  digest: nonEmpty,
});
