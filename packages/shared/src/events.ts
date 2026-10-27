// Sự kiện đang chờ người chơi chọn (ADR 0014). Chỉ kiểu và validate, không có luật.
import { GENDERS, type Gender } from './character';
import { vChoiceId, vContentId, type ChoiceId, type ContentId } from './contentId';
import { arr, brand, int, nat, nonEmpty, nullable, obj, oneOf, record, str, union, type Validator } from './schema';

/** Id sự kiện, vd. "event.harvest_bad". */
export type EventId = string;
export const EVENT_ID_RE = /^event\.[a-z0-9_]+$/;
export { CHOICE_ID_RE, type ChoiceId } from './contentId';

export const EVENT_COST_TAGS = ['money', 'grain', 'health', 'stamina', 'time', 'risk', 'opportunity'] as const;
export type EventCostTag = (typeof EVENT_COST_TAGS)[number];

export interface EventChoiceView {
  id: ChoiceId;
  /** Lựa chọn tốn gì; mỗi lựa chọn có ít nhất một giá. */
  costs: EventCostTag[];
  /** Lý do bị khóa, vd. "lock.money", "lock.personality"; null nếu chọn được. */
  locked: ContentId | null;
}

export const FIGURE_AGES = ['child', 'young', 'adult', 'old'] as const;
export const FIGURE_CLASSES = ['poor', 'common', 'rich', 'official'] as const;

/** Gợi ý chân dung người vô danh trong sự kiện; chỉ để FE trình bày. */
export interface EventFigure {
  gender: Gender;
  ageBand: (typeof FIGURE_AGES)[number];
  class: (typeof FIGURE_CLASSES)[number];
}

export interface PendingEvent {
  /** Tăng dần trong một đời; CHOOSE phải khớp. */
  instance: number;
  eventId: EventId;
  /** Biến thể văn bản theo ngữ cảnh (mùa, xuất thân…). */
  variant: string | null;
  params: Record<string, string | number>;
  choices: EventChoiceView[];
  figure: EventFigure | null;
}

const vEventId = brand<EventId>(EVENT_ID_RE);

const vChoices: Validator<EventChoiceView[]> = (() => {
  const item = obj<EventChoiceView>({
    id: vChoiceId,
    costs: { check: (u, p) => (Array.isArray(u) && u.length >= 1 ? arr(oneOf(EVENT_COST_TAGS)).check(u, p) : `${p}: cần ít nhất một giá`) },
    locked: nullable(vContentId),
  });
  return {
    check: (u, p) => {
      if (!Array.isArray(u) || u.length === 0) return `${p}: cần ít nhất một lựa chọn`;
      const e = arr(item).check(u, p);
      if (e) return e;
      const ids = (u as EventChoiceView[]).map((c) => c.id);
      if (new Set(ids).size !== ids.length) return `${p}: id lựa chọn trùng`;
      // ADR 0014: luôn có lối ra
      return (u as EventChoiceView[]).some((c) => c.locked === null) ? null : `${p}: cần ít nhất một lựa chọn không bị khóa`;
    },
  };
})();

export const vPendingEvent: Validator<PendingEvent> = obj<PendingEvent>({
  instance: nat,
  eventId: vEventId,
  variant: nullable(nonEmpty),
  params: record(union(str, int)),
  choices: vChoices,
  figure: nullable(obj<EventFigure>({ gender: oneOf(GENDERS), ageBand: oneOf(FIGURE_AGES), class: oneOf(FIGURE_CLASSES) })),
});
