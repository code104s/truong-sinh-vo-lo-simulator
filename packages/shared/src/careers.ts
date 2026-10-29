// Nghề của người chơi (v0.7, ADR 0020). Chỉ kiểu và validate, không có luật; dải chữ, không lộ số kinh nghiệm.
import { vContentId, vNpcId, type ContentId, type NpcId } from './contentId';
import { vFactionId, type FactionId } from './factions';
import { arr, bool, lit, nonEmpty, nat, nullable, obj, oneOf, opt, type Validator } from './schema';
import type { Tick } from './calendar';

/**
 * Chín con đường phàm nhân ở v0.7 (Q3): tám nghề GDD 3.2 K (nông dân, thợ thủ công, thợ săn, thương nhân, thầy thuốc,
 * lính — sai dịch nha môn, tán nhân lưu lạc, ẩn dật) và theo cướp (Q8). Khóa nội dung `career.<id>`.
 */
export const CAREERS = ['farmer', 'artisan', 'hunter', 'merchant', 'physician', 'soldier', 'drifter', 'recluse', 'outlaw'] as const;
export type CareerId = (typeof CAREERS)[number];

/** Bậc trong nghề (Q1): học việc → làm được → có tiếng. Khóa nội dung `career.rank.<bậc>`. */
export const CAREER_RANKS = ['apprentice', 'journeyman', 'master'] as const;
export type CareerRank = (typeof CAREER_RANKS)[number];

/** Thân phận nghề như người chơi thấy. */
export interface CareerView {
  id: CareerId;
  rank: CareerRank;
  /** Tick vào nghề (bậc hiện tại tính từ đây). */
  since: Tick;
  /** Nơi nhận người chơi, nếu nghề gắn với một thế lực (thương hội, nha môn, băng cướp). */
  faction?: FactionId;
  /** Thầy dạy nghề (v0.7 F1), nếu vào nghề qua thầy; còn gửi một năm sau khi thầy mất (sim giữ người đã mất một năm). */
  mentor?: CareerMentorView;
  /** Số năm đã làm nghề này (năm đủ ô làm nghề, F2). */
  years: number;
  /** Rời nghề lúc này mất gì ngoài bậc và lòng thầy (F2): thế lực phật lòng, ra băng thì chuộc tội hay trốn. */
  leave: CareerLeaveView;
}

export interface CareerLeaveView {
  /** Thế lực nhận mình phật lòng khi bỏ đi (bỏ nha môn, bỏ hội). */
  angers?: FactionId;
  /** Ra băng: đủ tiền thì nộp `fee` văn chuộc tội với quan phủ; không đủ thì trốn, người trong băng thành kẻ thù. */
  outlaw?: { way: 'atone' | 'desert'; fee: number };
}

export interface CareerMentorView {
  id: NpcId;
  name: string;
  alive: boolean;
}

export const vCareerView: Validator<CareerView> = obj<CareerView>({
  id: oneOf(CAREERS),
  rank: oneOf(CAREER_RANKS),
  since: nat,
  faction: opt(vFactionId),
  mentor: opt(obj<CareerMentorView>({ id: vNpcId, name: nonEmpty, alive: bool })),
  years: nat,
  leave: obj<CareerLeaveView>({ angers: opt(vFactionId), outlaw: opt(obj<NonNullable<CareerLeaveView['outlaw']>>({ way: oneOf(['atone', 'desert'] as const), fee: nat })) }),
});

/** Cách vào nghề (F2): qua thầy cùng quận, qua thế lực (nha môn), tự vào (bỏ quê, dựng lều), qua sự kiện (theo cướp). */
export const CAREER_WAYS = ['mentor', 'faction', 'own', 'event'] as const;
export type CareerWay = (typeof CAREER_WAYS)[number];
/** Việc xếp vào kế hoạch để vào nghề. */
export const CAREER_ENTRY_ACTIONS = ['action.apprentice', 'action.enlist', 'action.drift', 'action.build_hut'] as const;
export type CareerEntryAction = (typeof CAREER_ENTRY_ACTIONS)[number];

/** Một thầy ở quận đang đứng nhận học việc được: lễ nhập môn (văn; người thân thì 0), khóa của ô học việc lúc này. */
export interface CareerMentorOffer {
  id: NpcId;
  gift: number;
  locked: ContentId | null;
}

/**
 * Một nghề trong bảng chọn nghề ở quận đang đứng (F2), sim tính sẵn. `locked`: lý do chưa vào được lúc này (không có thầy
 * ở đây, không phải trị sở, có ruộng…); nghề qua thầy thì xét theo từng thầy trong `mentors`. Sim xét lại khi ô chạy.
 */
export interface CareerEntryView {
  career: CareerId;
  way: CareerWay;
  /** Việc để vào nghề; null khi chỉ vào qua sự kiện. */
  action: CareerEntryAction | null;
  mentors: CareerMentorOffer[];
  locked: ContentId | null;
}

export const vCareerEntryView: Validator<CareerEntryView> = obj<CareerEntryView>({
  career: oneOf(CAREERS),
  way: oneOf(CAREER_WAYS),
  action: nullable(oneOf(CAREER_ENTRY_ACTIONS)),
  mentors: arr(obj<CareerMentorOffer>({ id: vNpcId, gift: nat, locked: nullable(vContentId) })),
  locked: nullable(vContentId),
});

/** Một nghề đã làm trong đời, cho tổng kết (F4): bậc cao nhất, số năm làm. */
export interface CareerRecord {
  id: CareerId;
  rank: CareerRank;
  years: number;
  /** Nghề còn làm tới lúc nhắm mắt (F4); các lần đã rời thì không có. */
  current?: true;
}

export const vCareerRecord: Validator<CareerRecord> = obj<CareerRecord>({ id: oneOf(CAREERS), rank: oneOf(CAREER_RANKS), years: nat, current: opt(lit(true)) });
