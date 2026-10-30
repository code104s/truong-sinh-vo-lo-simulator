// Người chơi máy "tìm đạo" (v0.8 S7, ADR 0022 mục 6): một theo đường tông môn (dự kỳ tuyển), một theo đường tán tu (vào
// núi tìm cơ duyên, tự dẫn khí). Như các chiến lược khác, chỉ đọc view và khóa sim công bố — không đọc linh căn ẩn, cờ sự
// kiện hay số linh khí; sống còn trước (bộ não nhu cầu chung với NPC). Đã có đường tu thì tu một phần ô, đủ đỉnh thì đột phá.
import { type MonthPlan, type PendingEvent, type PlanSlot } from '@tsvl/shared';
import { earnPlan, foodWeeks, hash32, Rng, SURVIVAL_WEEKS, weakPlan, workChoice, type WorkChoice } from '@tsvl/sim';
import { brainInput, policyChoose, SETTLE_AGE, type PolicyContext } from './policies';

export const SEEKERS = ['seeker_sect', 'seeker_rogue'] as const;
export type SeekerName = (typeof SEEKERS)[number];
export const isSeeker = (p: string): p is SeekerName => (SEEKERS as readonly string[]).includes(p);

/** Tuổi dự kỳ tuyển (sim khóa ngoài 8–20; người chơi xếp việc từ 12); kỳ tuyển năm chia hết cho 3, tháng Ba (tin đồn tháng Giêng). */
export const TRIAL_MAX_AGE = 20;
const TRIAL_EVERY_YEARS = 3, TRIAL_MONTH = 3;
/** Tán tu: vào núi từ tuổi này, mỗi năm một chuyến lúc nông nhàn (tháng 10–12), tháng Giêng về nhà. */
export const ROGUE_START_AGE = 15;
const SEEK_MONTHS = [10, 11, 12];
/** Của trong nhà đủ ăn từ chừng ấy tuần thì tu hai ô mỗi tháng, ít hơn thì một ô. */
export const CULTIVATE_SECURE_WEEKS = 52;
/** Tạp dịch tông môn: một ô mỗi tháng từ tháng 6 tới tháng 12 (cần sáu tuần một năm; dư một ô phòng tuần bị chiếm). */
const DUTY_FROM_MONTH = 6;

const slot = (action: string, extra: Partial<PlanSlot> = {}): PlanSlot => ({ action, ...extra });
const plan = (a: PlanSlot, b: PlanSlot, c: PlanSlot): MonthPlan => ({ slots: [a, b, c] });
const lockOf = (c: PolicyContext, id: string): string | null | undefined => c.actions.find((a) => a.id === id)?.locked;
const usable = (c: PolicyContext, id: string) => lockOf(c, id) === null;
const reachable = (c: PolicyContext, county: number) => c.travel.some((o) => o.county === county);
const goHome = (c: PolicyContext) => (c.character.location !== c.character.home && reachable(c, c.character.home) ? slot('action.travel', { target: c.character.home }) : null);

/** Dự kỳ tuyển: năm tuyển, từ tháng Giêng lên trị sở, tháng Ba dự tuyển; ngoài mùa tuyển thì về nhà. */
function trialSlot(c: PolicyContext): PlanSlot | null {
  const { date, character } = c;
  const season = date.year % TRIAL_EVERY_YEARS === 0 && date.month <= TRIAL_MONTH && character.ageYears <= TRIAL_MAX_AGE && character.cultivation.root !== 'none';
  if (!season) return goHome(c);
  if (usable(c, 'action.trial')) return slot('action.trial');
  const seat = c.factions?.().find((f) => f.kind === 'sect')?.seat;
  return seat !== undefined && character.location !== seat && reachable(c, seat) ? slot('action.travel', { target: seat }) : null;
}

/**
 * Tán tu: có công pháp thô thì tự dẫn khí; đang ở chỗ tìm được (núi, miếu) thì tìm cơ duyên — ở nhà tìm được thì tháng nào
 * cũng tìm, không thì mỗi năm một chuyến lên một quận núi (đổi quận theo năm; vùng không núi thì tìm miếu). Biết mình
 * không có linh căn thì thôi.
 */
function rogueSlot(c: PolicyContext): PlanSlot | null {
  const { date, character } = c;
  if (character.ageYears < ROGUE_START_AGE || character.ageYears >= SETTLE_AGE || character.cultivation.root === 'none') return goHome(c);
  if (usable(c, 'action.induce')) return slot('action.induce');
  const atHome = character.location === character.home;
  const season = SEEK_MONTHS.includes(date.month);
  if (usable(c, 'action.seek') && (atHome || season)) return slot('action.seek');
  if (!season) return goHome(c);
  if (date.month !== SEEK_MONTHS[0]) return null;
  // Vùng không có núi: đi tìm miếu ở làng, trấn khác (đến nơi mới biết có miếu không)
  const peaks = c.travel.filter((o) => c.mountain?.[o.county]);
  const places = peaks.length ? peaks : c.travel.filter((o) => o.county !== character.home && c.settlements[o.county] !== 'city');
  return places.length ? slot('action.travel', { target: places[Rng.fromSeed(hash32('seeker', c.seed, date.year)).int(0, places.length - 1)]!.county }) : null;
}

/**
 * Đã có đường tu: đủ đỉnh thì đột phá (tâm cảnh bất an thì chờ); không thì tu hai ô mỗi tháng khi đủ ăn một năm, một ô khi
 * chưa đủ; đệ tử ký danh làm tạp dịch nửa cuối năm. Ô còn lại làm ăn như người điều độ.
 */
function cultivatorPlan(c: PolicyContext, w: WorkChoice): MonthPlan {
  const home = goHome(c);
  const base = earnPlan(w);
  if (usable(c, 'action.breakthrough')) return plan(home ?? base.slots[0]!, slot('action.breakthrough'), base.slots[2]!);
  const duty = c.date.month >= DUTY_FROM_MONTH && usable(c, 'action.sect_duty') ? slot('action.sect_duty') : null;
  if (!usable(c, 'action.cultivate')) return plan(home ?? base.slots[0]!, base.slots[1]!, duty ?? base.slots[2]!);
  const secure = foodWeeks(brainInput(c)) >= CULTIVATE_SECURE_WEEKS;
  return plan(home ?? base.slots[0]!, secure ? slot('action.cultivate') : base.slots[1]!, duty ?? slot('action.cultivate'));
}

/** Kế hoạch tháng của người chơi máy tìm đạo. */
export function seekerPlan(name: SeekerName, c: PolicyContext): MonthPlan | null {
  if (!c.character.canAct || c.active) return null;
  const b = brainInput(c);
  const w = workChoice(b);
  const weak = weakPlan(b, w);
  if (weak) return weak;
  if (b.independent && foodWeeks(b) < SURVIVAL_WEEKS) return earnPlan(w);
  if (c.character.cultivation.path) return cultivatorPlan(c, w);
  const base = earnPlan(w);
  const entry = name === 'seeker_sect' ? trialSlot(c) : rogueSlot(c);
  return entry ? plan(entry, base.slots[1]!, base.slots[2]!) : base;
}

/**
 * Chuyện cơ duyên (dấu vết, kiểm linh căn, công pháp): người tìm đạo nắm lấy — lựa chọn đầu đang mở (vào hang, đãi tu sĩ,
 * cúng miếu, chạm đá, xin chỉ điểm). Còn lại (lạc núi, đời tu, ám ảnh) như người điều độ.
 */
export const SEEKER_EAGER: readonly string[] = [
  'event.seek_cave', 'event.wandering_cultivator', 'event.shrine_keeper', 'event.hermit_hint', 'event.ruin_stone', 'event.cultivator_test',
  'event.hermit_stone', 'event.ruin_scroll', 'event.cultivator_teach',
];
export function seekerChoose(pending: PendingEvent, c?: PolicyContext): string {
  if (SEEKER_EAGER.includes(pending.eventId)) {
    const first = pending.choices.find((x) => x.locked === null);
    if (first) return first.id;
  }
  return policyChoose('balanced', pending, c);
}
