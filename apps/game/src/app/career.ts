// Thân phận nghề (v0.7 F1): dòng nghề trên thanh trạng thái, khối "Nghề" ở hồ sơ, việc của nghề trong bảng chọn việc.
// Thuần, không có luật game: nghề, bậc, thầy từ CharacterView.career; việc tính năm nghề, việc riêng của nghề do sim gửi.
import { t } from '@tsvl/content';
import { CAREER_ENTRY_ACTIONS, type ActionOption, type CareerEntryView, type CareerMentorOffer, type CareerView, type FactionView, type FactionName, type MonthPlan, type PlanSlot } from '@tsvl/shared';

/** Dòng nghề ngắn cho thanh trạng thái; trẻ chưa tự làm việc thì không ghi gì. */
export function careerLine(career: CareerView | null, canAct: boolean): { key: string; params: Record<string, string | number> } | null {
  if (career) return { key: 'ui.hud.career', params: { career: `career.${career.id}`, rank: `career.rank.${career.rank}` } };
  return canAct ? { key: 'ui.hud.no_career', params: {} } : null;
}

export interface CareerBlock {
  career: CareerView;
  /** Thế lực nhận mình (thương hội, nha môn, băng cướp), nếu còn. */
  faction: { name: FactionName; kind: FactionView['kind'] } | null;
  /** Việc tính vào năm làm nghề, theo thứ tự bảng chọn việc. */
  works: ActionOption['id'][];
}

/** Khối "Nghề" ở hồ sơ; chưa vào nghề thì null. */
export function careerBlock(career: CareerView | null, factions: readonly FactionView[], actions: readonly ActionOption[]): CareerBlock | null {
  if (!career) return null;
  const f = career.faction ? factions.find((x) => x.id === career.faction) : undefined;
  return { career, faction: f ? { name: f.name, kind: f.kind } : null, works: actions.filter((a) => a.careerWork).map((a) => a.id) };
}

/**
 * Bảng chọn việc: việc tính năm nghề lên đầu nhóm; việc riêng của nghề khác (mình không làm nghề ấy) không bày thành ô mà
 * gom vào một dòng cuối bảng, để bảng không đầy ô khóa. Việc riêng của chính nghề mình mà chưa đủ bậc vẫn bày, kèm lý do.
 */
export function paletteSplit(actions: readonly ActionOption[], career: CareerView | null): { shown: ActionOption[]; foreign: ActionOption[] } {
  const own = (a: ActionOption) => !a.career || a.career === career?.id;
  const shown = actions.filter(own);
  // Sắp ổn định: việc nghề trước, còn lại giữ thứ tự sim gửi
  const ranked = shown.map((a, i) => ({ a, i })).sort((x, y) => Number(!!y.a.careerWork) - Number(!!x.a.careerWork) || x.i - y.i).map((x) => x.a);
  return { shown: ranked, foreign: actions.filter((a) => !own(a)) };
}

/** Trạng thái một nghề trong bảng chọn nghề (F2): đang làm, chỉ qua sự kiện, bị khóa, hay xếp được. */
export type EntryStatus = 'current' | 'event' | 'locked' | 'open';
export function entryStatus(e: CareerEntryView, career: CareerView | null): EntryStatus {
  if (career?.id === e.career && e.way !== 'mentor') return 'current';
  if (e.way === 'event') return 'event';
  return e.locked ? 'locked' : 'open';
}

/** Một thầy trong bảng: đang theo học, bị khóa (người lạ, thiếu lễ…), hay xin được. */
export function mentorStatus(m: CareerMentorOffer, career: CareerView | null): 'current' | 'locked' | 'open' {
  if (career?.mentor?.id === m.id) return 'current';
  return m.locked ? 'locked' : 'open';
}

/** Thầy trong bảng: đang theo học trước, rồi người xin được, rồi người bị khóa; trong mỗi nhóm giữ thứ tự sim gửi. */
export function sortMentors(mentors: readonly CareerMentorOffer[], career: CareerView | null): CareerMentorOffer[] {
  const order = { current: 0, open: 1, locked: 2 } as const;
  return mentors.map((m, i) => ({ m, i, k: order[mentorStatus(m, career)] })).sort((a, b) => a.k - b.k || a.i - b.i).map((x) => x.m);
}

/**
 * Vào nghề này thì nghề đang làm ra sao: chưa có nghề thì không mất gì; khác nghề thì bỏ nghề cũ (mất bậc, thầy cũ phật
 * lòng); cùng nghề qua thầy khác thì đổi thầy (giữ bậc). Lời báo, không phải luật: sim quyết khi ô chạy.
 */
export function switchNote(e: CareerEntryView, career: CareerView | null): Line | null {
  if (!career) return null;
  if (career.id !== e.career) return { key: 'ui.careers.switch', params: { career: `career.${career.id}`, rank: `career.rank.${career.rank}` } };
  return e.way === 'mentor' ? { key: 'ui.careers.same_mentor', params: {} } : null;
}

export interface Line { key: string; params: Record<string, string | number> }

/** Rời nghề mất gì (F2), theo thứ tự: bậc, số năm đã làm, thầy, thế lực nhận mình, ra băng chuộc tội hay trốn. */
export function leaveLosses(career: CareerView, factions: readonly FactionView[]): Line[] {
  const out: Line[] = [{ key: 'ui.leave.rank', params: { rank: `career.rank.${career.rank}` } }];
  if (career.years > 0) out.push({ key: 'ui.leave.years', params: { years: career.years } });
  if (career.mentor?.alive) out.push({ key: 'ui.leave.mentor', params: { name: career.mentor.name } });
  const f = career.leave.angers ? factions.find((x) => x.id === career.leave.angers) : undefined;
  // Tên thế lực có tham số riêng (họ, nơi) nên dịch sẵn
  if (f) out.push({ key: 'ui.leave.angers', params: { name: t(f.name.key, f.name.params) } });
  if (career.leave.outlaw) out.push({ key: `ui.leave.${career.leave.outlaw.way}`, params: { coin: career.leave.outlaw.fee } });
  return out;
}

const isEntry = (slot: PlanSlot) => (CAREER_ENTRY_ACTIONS as readonly string[]).includes(slot.action);
const sameSlot = (a: PlanSlot, b: PlanSlot) => a.action === b.action && a.person === b.person;

/**
 * Xếp việc vào nghề vào ô `index` (F2). Kế hoạch tự lặp mỗi tháng, nên ô khác còn xin vào nghề khác (học thầy khác, ứng
 * tuyển, bỏ quê, dựng lều) thì tháng sau lại đổi nghề, đổi thầy qua lại. Các ô ấy đổi theo: học việc thì học tiếp với thầy
 * mới; việc vào nghề khác thì nghỉ.
 */
export function placeEntry(plan: MonthPlan, index: number, slot: PlanSlot): MonthPlan {
  const slots = plan.slots.map((s, i) => {
    if (i === index) return { ...slot };
    if (!isEntry(s) || sameSlot(s, slot)) return { ...s };
    return slot.action === 'action.apprentice' ? { ...slot } : { action: 'action.rest' };
  }) as MonthPlan['slots'];
  return { slots };
}
