// NPC như người chơi thấy (ADR 0015, 0016). Chỉ kiểu và validate, không có luật.
// Không có thuộc tính ẩn (linh căn, thọ nguyên, may mắn…): `HIDDEN_CHARACTER_KEYS` áp cho cả NpcView.
import { GENDERS, HEALTH_BANDS, type Gender, type HealthBand } from './character';
import { vContentId, vNpcId, type ContentId, type NpcId } from './contentId';
import { FIGURE_AGES, FIGURE_CLASSES, type EventFigure } from './events';
import { nat, nonEmpty, obj, oneOf, type Validator } from './schema';

export { NPC_ID_RE, vNpcId, type NpcId } from './contentId';

/** Khóa chọn chân dung trong kho portraits-npc: cùng NPC luôn cùng gương mặt; lứa tuổi đổi khi NPC già đi. */
export interface NpcPortrait {
  ageBand: EventFigure['ageBand'];
  class: EventFigure['class'];
  key: string;
}

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
}

export const vNpcView: Validator<NpcView> = obj<NpcView>({
  id: vNpcId,
  name: nonEmpty,
  gender: oneOf(GENDERS),
  ageYears: nat,
  occupation: vContentId,
  healthBand: oneOf(HEALTH_BANDS),
  portrait: obj<NpcPortrait>({ ageBand: oneOf(FIGURE_AGES), class: oneOf(FIGURE_CLASSES), key: nonEmpty }),
});
