// Người chơi máy theo nghề (v0.7 S9, ADR 0020 Q2): mỗi nghề một chiến lược, cho batch `--policy paths` đo "6+ con đường
// khác biệt rõ". Như sáu chiến lược v0.6, chỉ đọc view và khóa sim công bố; sống còn trước (bộ não nhu cầu chung với NPC):
// yếu thì nghỉ chữa, túng thì kiếm ăn ngay. Chưa vào nghề thì tìm đường vào (thầy, nha môn, bỏ quê, dựng lều, đường cướp);
// vào rồi thì làm việc của nghề.
import { CAREERS, type CareerId, type MonthPlan, type NpcView, type PendingEvent, type PlanSlot, type SettlementKind } from '@tsvl/shared';
import { CAREER_EVENTS_OF, earnPlan, foodWeeks, hash32, MERCHANT_LIVING_CAPITAL, Rng, SURVIVAL_WEEKS, weakPlan, workChoice } from '@tsvl/sim';
import { brainInput, policyChoose, type PolicyContext } from './policies';

export const PATHS = CAREERS;
export type PathName = CareerId;
export const isPath = (p: string): p is PathName => (CAREERS as readonly string[]).includes(p);

/** Nghề NPC dạy nghề (thầy) theo khóa nội dung của `NpcView.occupation`. */
const MENTOR_OCCUPATION: Partial<Record<PathName, string>> = {
  farmer: 'occupation.farmer', artisan: 'occupation.laborer', hunter: 'occupation.hunter', merchant: 'occupation.merchant', physician: 'occupation.physician',
};
/** Nơi thầy nghề hay ở: thợ, buôn, thuốc ở trấn, thành; nông, săn ở làng. */
const MENTOR_PLACE: Partial<Record<PathName, SettlementKind | 'town'>> = { farmer: 'village', hunter: 'village', artisan: 'town', merchant: 'town', physician: 'town' };
/** Tuổi bắt đầu tìm đường vào nghề. */
export const PATH_START_AGE = 15;

const slot = (action: string, extra: Partial<PlanSlot> = {}): PlanSlot => ({ action, ...extra });
const plan = (a: PlanSlot, b: PlanSlot, c: PlanSlot): MonthPlan => ({ slots: [a, b, c] });
const lockOf = (c: PolicyContext, id: string): string | null | undefined => c.actions.find((a) => a.id === id)?.locked;
const usable = (c: PolicyContext, id: string) => lockOf(c, id) === null;
const socialLock = (p: NpcView, action: string): string | null | undefined => p.social?.find((x) => x.action === action)?.locked;
/** Một đích đi theo điều kiện, chọn tất định theo (đời, tick). */
function pickTravel(c: PolicyContext, ok: (county: number) => boolean): number | null {
  const xs = c.travel.filter((o) => ok(o.county));
  if (!xs.length) return null;
  return xs[Rng.fromSeed(hash32('path', c.seed, c.date.tick)).int(0, xs.length - 1)]!.county;
}
const isTown = (c: PolicyContext, county: number) => c.settlements[county] !== 'village';

/** Đi học việc với thầy cùng quận nếu có; người lạ thì sang thăm cho quen; không có thầy thì đi nơi khác tìm. */
function mentorSlot(path: PathName, c: PolicyContext): PlanSlot | null {
  const occ = MENTOR_OCCUPATION[path];
  if (!occ) return null;
  const people = (c.people?.() ?? []).filter((p) => p.occupation === occ);
  const open = people.find((p) => socialLock(p, 'action.apprentice') === null);
  if (open) return slot('action.apprentice', { person: open.id });
  const stranger = people.find((p) => socialLock(p, 'action.apprentice') === 'lock.stranger' && socialLock(p, 'action.visit') === null);
  if (stranger) return slot('action.visit', { person: stranger.id });
  if (people.some((p) => socialLock(p, 'action.apprentice') === 'lock.money')) return null;
  const want = MENTOR_PLACE[path];
  const target = pickTravel(c, (k) => (want === 'town' ? isTown(c, k) : c.settlements[k] === want));
  return target === null ? null : slot('action.travel', { target });
}

/** Ô tìm đường vào nghề khi chưa vào; null thì kiếm ăn như người điều độ. */
function entrySlot(path: PathName, c: PolicyContext): PlanSlot | null {
  switch (path) {
    case 'soldier': {
      const lock = lockOf(c, 'action.enlist');
      if (lock === null) return slot('action.enlist');
      if (lock === 'lock.not_seat') {
        const seat = c.factions?.().find((f) => f.kind === 'government')?.seat;
        return seat !== undefined && c.travel.some((o) => o.county === seat) ? slot('action.travel', { target: seat }) : null;
      }
      // Chưa đủ tuổi, hết chỗ: luyện võ cho hơn người đang làm (võ đường nếu có tiền)
      return slot(usable(c, 'action.dojo') ? 'action.dojo' : 'action.train');
    }
    case 'drifter':
      return usable(c, 'action.drift') ? slot('action.drift') : null;
    case 'recluse': {
      if (usable(c, 'action.build_hut')) return slot('action.build_hut');
      const target = pickTravel(c, (k) => !!c.mountain?.[k]);
      return target === null ? null : slot('action.travel', { target });
    }
    case 'outlaw': {
      // Theo cướp chỉ vào được qua sự kiện (rủ rê, bị bắt theo): đi trên đường băng cướp giữ
      const danger = c.travel.filter((o) => o.danger);
      return danger.length ? slot('action.travel', { target: danger[Rng.fromSeed(hash32('path', c.seed, c.date.tick)).int(0, danger.length - 1)]!.county }) : null;
    }
    default:
      return mentorSlot(path, c);
  }
}

/** Việc của nghề khi đã vào; ô học việc với thầy khi còn học việc. */
function careerPlan(path: PathName, c: PolicyContext, w: ReturnType<typeof workChoice>): MonthPlan {
  const career = c.character.career!;
  const apprentice = career.rank === 'apprentice';
  const work = (id: string, fallback = w.work) => slot(usable(c, id) ? id : fallback);
  const lesson = () => (apprentice ? mentorSlot(path, c) : null);
  switch (path) {
    // Nông dân lúc nông nhàn hái lượm, không đi săn (để nông và săn là hai đường khác nhau)
    case 'farmer': { const p = earnPlan(w); return plan(...(p.slots.map((s) => (s.action === 'action.hunt' && usable(c, 'action.forage') ? slot('action.forage') : s)) as [PlanSlot, PlanSlot, PlanSlot])); }
    case 'artisan': return plan(lesson() ?? work('action.craft'), work('action.craft'), work('action.hire'));
    case 'hunter': return plan(lesson() ?? work('action.hunt'), work('action.trap'), work('action.hunt'));
    case 'merchant': {
      // Buôn chuyến mỗi quý khi đủ vốn: đích là một quận kề (sim khóa lúc khởi hành nếu không có lời)
      const haul = !apprentice && c.date.month % 3 === 1 && c.date.tenDay === 0 && c.character.household.money >= 2_000 ? pickTravel(c, () => true) : null;
      // Buôn nhỏ chỉ khi vốn đủ lời bằng đi làm thuê, như thương nhân NPC (MERCHANT_LIVING_CAPITAL); vốn mỏng thì làm thuê
      const trade = c.character.household.money >= MERCHANT_LIVING_CAPITAL ? work('action.trade') : slot(w.work);
      return plan(haul !== null ? slot('action.haul', { target: haul }) : lesson() ?? trade, trade, trade);
    }
    case 'physician': return plan(lesson() ?? work('action.practice'), work('action.practice'), work('action.practice'));
    // Lương sai dịch nuôi người: hai ô đi tuần, một ô luyện võ
    case 'soldier': return plan(work('action.patrol'), work('action.patrol'), work('action.train', 'action.rest'));
    case 'drifter': {
      const target = c.date.tenDay === 0 ? pickTravel(c, () => true) : null;
      return plan(target !== null ? slot('action.travel', { target }) : slot(w.quick), slot(w.quick), slot(w.quick));
    }
    case 'recluse':
      if (c.character.location !== c.character.home && c.travel.some((o) => o.county === c.character.home)) return plan(slot('action.travel', { target: c.character.home }), slot(w.quick), slot(w.quick));
      return plan(work('action.forage'), work('action.forage'), work('action.hunt', w.quick));
    case 'outlaw': return plan(work('action.forage'), work('action.train', w.quick), slot(w.work));
  }
}

/** Kế hoạch tháng của người chơi máy theo nghề `path`. */
export function pathPlan(path: PathName, c: PolicyContext): MonthPlan | null {
  if (!c.character.canAct || c.active) return null;
  const b = brainInput(c);
  const inPath = c.character.career?.id === path;
  const preferred = !inPath ? undefined : path === 'farmer' ? 'action.farm' : path === 'hunter' ? 'action.hunt' : path === 'recluse' ? 'action.forage' : undefined;
  const w = workChoice(b, preferred);
  const weak = weakPlan(b, w);
  if (weak) return weak;
  // Túng thì kiếm ăn trước (người đã ra riêng còn dưới mức sống còn)
  if (b.independent && foodWeeks(b) < SURVIVAL_WEEKS) return earnPlan(w);
  if (inPath) return careerPlan(path, c, w);
  if (c.character.ageYears < PATH_START_AGE) return earnPlan(w);
  const entry = entrySlot(path, c);
  const base = earnPlan(w);
  return entry ? plan(entry, base.slots[1], base.slots[2]) : base;
}

/**
 * Lựa chọn sự kiện: theo cướp thì nhận lời lên núi. Sự kiện riêng của nghề mình: người theo nghề làm đúng việc nghề (lựa
 * chọn đầu đang mở: vào làng dịch, theo dấu hổ, nhận đơn hàng…). Còn lại như người điều độ.
 */
export function pathChoose(path: PathName, pending: PendingEvent, c?: PolicyContext): string {
  if (path === 'outlaw') {
    const join = pending.choices.find((x) => (x.id === 'join' || x.id === 'go_along') && x.locked === null);
    if (join) return join.id;
  }
  if (CAREER_EVENTS_OF[path]!.includes(pending.eventId)) {
    const first = pending.choices.find((x) => x.locked === null);
    if (first) return first.id;
  }
  return policyChoose('balanced', pending, c);
}
