import type { Validator } from './schema';

/** Id nội dung; nhãn hiển thị nằm trong packages/content. Dạng "nhóm.tên". */
export type ContentId = string;
export const CONTENT_ID_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;
export const vContentId: Validator<ContentId> = {
  check: (u, p) => (typeof u === 'string' && CONTENT_ID_RE.test(u) ? null : `${p}: cần id nội dung dạng "nhom.ten"`),
};

/** Id lựa chọn trong một sự kiện, vd. "endure" (ADR 0014). Đặt ở đây để actions và events cùng dùng mà không vòng import. */
export type ChoiceId = string;
export const CHOICE_ID_RE = /^[a-z][a-z0-9_]*$/;
export const vChoiceId: Validator<ChoiceId> = {
  check: (u, p) => (typeof u === 'string' && CHOICE_ID_RE.test(u) ? null : `${p}: cần id lựa chọn dạng "ten_lua_chon"`),
};

/** Id NPC, vd. "n17": theo thứ tự sinh trong một đời, không dùng lại (ADR 0015). Đặt ở đây để events và npc cùng dùng mà không vòng import. */
export type NpcId = string;
export const NPC_ID_RE = /^n[1-9][0-9]*$/;
export const vNpcId: Validator<NpcId> = {
  check: (u, p) => (typeof u === 'string' && NPC_ID_RE.test(u) ? null : `${p}: cần id NPC dạng "n17"`),
};
