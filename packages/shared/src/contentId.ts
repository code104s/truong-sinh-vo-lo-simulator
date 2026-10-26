import type { Validator } from './schema';

/** Id nội dung; nhãn hiển thị nằm trong packages/content. Dạng "nhóm.tên". */
export type ContentId = string;
export const CONTENT_ID_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;
export const vContentId: Validator<ContentId> = {
  check: (u, p) => (typeof u === 'string' && CONTENT_ID_RE.test(u) ? null : `${p}: cần id nội dung dạng "nhom.ten"`),
};
