// NPC như người chơi thấy (ADR 0015, 0016). Chỉ kiểu và validate, không có luật.
// Không có thuộc tính ẩn (linh căn, thọ nguyên, may mắn…): `HIDDEN_CHARACTER_KEYS` áp cho cả NpcView.
import { GENDERS, HEALTH_BANDS, type Gender, type HealthBand } from './character';
import { vContentId, vNpcId, type ContentId, type NpcId } from './contentId';
import { FIGURE_AGES, FIGURE_CLASSES, type EventFigure } from './events';
import { arr, nat, nonEmpty, nullable, obj, oneOf, opt, type Validator } from './schema';
import { vActionId, type ActionId } from './actions';

export { NPC_ID_RE, vNpcId, type NpcId } from './contentId';

/** Khóa chọn chân dung trong kho portraits-npc: cùng NPC luôn cùng gương mặt; lứa tuổi đổi khi NPC già đi. */
export interface NpcPortrait {
  ageBand: EventFigure['ageBand'];
  class: EventFigure['class'];
  key: string;
}

/** Vai ruột thịt, hôn nhân của một người đối với người chơi (v0.5, ADR 0018). */
export const KIN_ROLES = ['father', 'mother', 'spouse', 'son', 'daughter', 'sibling'] as const;
export type KinRole = (typeof KIN_ROLES)[number];

/** Quan hệ của người chơi với một người, theo dải, không lộ số (v0.5, ADR 0017). */
export const CLOSENESS_BANDS = ['stranger', 'acquaintance', 'friend', 'close'] as const;
export const TRUST_BANDS = ['wary', 'neutral', 'trusted'] as const;
export const HOSTILITY_BANDS = ['none', 'grudge', 'enemy'] as const;
export const OWED_BANDS = ['none', 'they_owe', 'i_owe'] as const;
export interface BondView {
  closeness: (typeof CLOSENESS_BANDS)[number];
  trust: (typeof TRUST_BANDS)[number];
  hostility: (typeof HOSTILITY_BANDS)[number];
  /** Ai nợ ơn ai. */
  owed: (typeof OWED_BANDS)[number];
}
export const vBondView: Validator<BondView> = obj<BondView>({
  closeness: oneOf(CLOSENESS_BANDS), trust: oneOf(TRUST_BANDS), hostility: oneOf(HOSTILITY_BANDS), owed: oneOf(OWED_BANDS),
});

export interface NpcView {
  id: NpcId;
  /** Hán-Việt, vd. "Lý Thị Hoa". */
  name: string;
  gender: Gender;
  ageYears: number;
  /** Nghề, vd. "occupation.farmer" (ADR 0016). */
  occupation: ContentId;
  healthBand: HealthBand;
  portrait: NpcPortrait;
  /** Người thân của người chơi (v0.5). */
  kin?: KinRole;
  /** Người chơi đã có quan hệ với người này (v0.5). */
  bond?: BondView;
  /**
   * Hành động xã giao nhắm vào người này và khóa lúc này (v0.5 F2): null là làm được, không thì lý do (người lạ, chưa đủ
   * thân, không đủ tiền quà…). Chỉ có ở `STATE.people`; sim xét lại khóa khi ô chạy.
   */
  social?: SocialOption[];
}

export interface SocialOption {
  action: ActionId;
  locked: ContentId | null;
}

export const vNpcView: Validator<NpcView> = obj<NpcView>({
  id: vNpcId,
  name: nonEmpty,
  gender: oneOf(GENDERS),
  ageYears: nat,
  occupation: vContentId,
  healthBand: oneOf(HEALTH_BANDS),
  portrait: obj<NpcPortrait>({ ageBand: oneOf(FIGURE_AGES), class: oneOf(FIGURE_CLASSES), key: nonEmpty }),
  kin: opt(oneOf(KIN_ROLES)),
  bond: opt(vBondView),
  social: opt(arr(obj<SocialOption>({ action: vActionId, locked: nullable(vContentId) }))),
});
