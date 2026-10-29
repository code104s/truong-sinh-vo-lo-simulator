import { ageYearsAt, isYearStart, TICKS_PER_MONTH, TICKS_PER_YEAR, type LogEntry, type MonthPlan, type PlanSlot, type Tick, type TravelPreview } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import type { Rng, RngStreams } from '../core/rng';

/** Nguồn RNG theo tên luồng: người chơi dùng các luồng của đời; NPC dùng một luồng riêng cho mọi tên (ADR 0015). */
export type RngSource = Pick<RngStreams, 'get'>;
import { mulDiv } from '../core/math';
import { ACTION_MIN_AGE, actionDef, slotLock, type ActionDef } from './actions';
import { hasCondition, type CharacterState } from './character';
import { pickIllness, startCondition, type Death } from './health';
import { ACCIDENT_FATAL_PPM } from './params';
import { gainSkill, skillRiskPct } from './skills';
import { fatiguePct, recoverStamina, spendStamina } from './stamina';
import { previewTravel } from './travel';
import { routeRiskPct } from '../factions/impact';
import { rankStep, type CareerState } from './career';
import { DRIFTER_ROAD_RISK_PCT } from './wayward';
import { HUNT_RANK_RISK_PCT } from '../economy/income';
import { recordFarmWeek } from '../economy/farming';
import { settleAction } from '../economy/income';
import { physicianIn, type NpcWorldState, type PlayerDoctor } from '../npc/state';
import { epidemicAt, type CountyEconomy, type EconomyState } from '../economy/market';

export interface ActiveAction { slot: PlanSlot; remaining: number; total: number; preview: TravelPreview | null }
export interface PlayerState {
  plan: MonthPlan | null;
  active: ActiveAction | null;
  /** Đã báo kế hoạch hỏng (ngắt tua) chưa; chỉ báo một lần cho tới khi sửa kế hoạch hoặc đổi nơi ở. */
  planWarned: boolean;
  /** Thân phận nghề (v0.7, chỉ người chơi): mở việc riêng của nghề, đổi thu nhập, rủi ro theo bậc (S2). NPC không có. */
  career?: CareerState | null;
}
type Log = (e: Omit<LogEntry, 'tick'>) => void;

const REST: PlanSlot = { action: 'action.rest' };
/** Việc tự vào nghề (S6). */
const OWN_ACTIONS: ReadonlySet<string> = new Set(['action.drift', 'action.build_hut']);
/**
 * Khóa tạm thời: tự hết theo mùa hoặc khi hồi sức. Ô đó nghỉ, không ngắt tua, chuyến đi dở giữ nguyên.
 * Các khóa khác (sai nơi, không có đường) là kế hoạch hỏng: nghỉ và ngắt tua một lần để người chơi sửa.
 */
export const TRANSIENT_LOCKS: ReadonlySet<string> = new Set(['lock.winter', 'lock.stamina', 'lock.health', 'lock.hunger', 'lock.money', 'lock.no_work', 'lock.no_land', 'lock.no_profit']);

/** Pha 5. Mỗi ô chỉ trừ giá một lần; hành động đang dở tiếp tục qua ranh tháng. */
/** Hành động xã giao của người chơi (v0.5 S4): khóa riêng (người ấy có ở đây không) và tác dụng lên quan hệ. */
export interface SocialHooks {
  lock(slot: PlanSlot, c: CharacterState): string | null;
  act(slot: PlanSlot, c: CharacterState, log: Log): void;
  /** Ô vừa làm xong phần mình (không bị khóa): tính vào năm làm nghề (v0.7 S1). */
  worked?(action: string): void;
  /** Đi buôn chuyến (v0.7 S3): khóa lúc khởi hành (vốn, có lời không), và chuyến buôn tính trọn lúc khởi hành. */
  haulLock?(slot: PlanSlot, c: CharacterState): string | null;
  haul?(slot: PlanSlot, preview: TravelPreview, c: CharacterState, log: Log): void;
  /** Ứng tuyển sai dịch (v0.7 S4): khóa theo quan phủ (trị sở, chỗ trống), và vào nghề lính. */
  enlistLock?(c: CharacterState): string | null;
  enlist?(c: CharacterState, log: Log): void;
  /** Bỏ quê đi lang bạt, dựng lều ẩn cư (v0.7 S6): tự vào nghề. */
  ownLock?(action: string, c: CharacterState): string | null;
  own?(action: string, c: CharacterState, log: Log): void;
}

/** `doctor`: người chơi hành nghề thuốc, chỉ pha NPC truyền vào — người bệnh NPC trả phí cho người chơi (S5). */
export function playerPhase(s: PlayerState, c: CharacterState, tick: Tick, logic: RegionLogic, eco: EconomyState, rng: RngSource, log: Log, people: NpcWorldState | null = null, social: SocialHooks | null = null, roads: readonly number[] | null = null, doctor: PlayerDoctor | null = null): { death: Death | null; carePct: number } {
  const age = ageYearsAt(c.birthTick, tick);
  if (age < ACTION_MIN_AGE) {
    if (age >= 5 && isYearStart(tick)) {
      const educated = c.background === 'comfortable' || c.background === 'wealthy';
      gainSkill(c, educated ? 'literacy' : 'farming', tick, 8);
      if (!educated) spendStamina(c, 20);
      log({ key: educated ? 'log.child.study' : 'log.child.help', params: { age }, importance: 'minor' });
    }
    recoverStamina(c, tick);
    return { death: null, carePct: 0 };
  }
  if (tick - c.birthTick === ACTION_MIN_AGE * TICKS_PER_YEAR) log({ key: 'log.adulthood', params: { age }, importance: 'major' });

  const planned = s.active?.slot ?? s.plan?.slots[tick % TICKS_PER_MONTH] ?? REST;
  const market = eco.counties[c.location]!;
  const d0 = actionDef(planned.action);
  const career = s.career ?? null;
  const lock = slotLock(planned, c, tick, logic, market, career) ?? (d0?.group === 'social' ? (social ? social.lock(planned, c) : 'lock.person_away') : null)
    // Chuyến buôn chỉ xét vốn, lời lúc khởi hành; đang đi dở thì đi tiếp
    ?? (!s.active && d0?.id === 'action.haul' ? (social?.haulLock ? social.haulLock(planned, c) : 'lock.career') : null)
    ?? (d0?.id === 'action.enlist' ? (social?.enlistLock ? social.enlistLock(c) : 'lock.not_seat') : null)
    ?? (d0 && OWN_ACTIONS.has(d0.id) ? (social?.ownLock ? social.ownLock(d0.id, c) : 'lock.career') : null);
  if (lock && !TRANSIENT_LOCKS.has(lock)) {
    if (!s.planWarned) log({ key: 'log.plan.invalid', params: { action: planned.action, reason: lock }, importance: 'minor' });
    s.planWarned = true;
    s.active = null;
  }
  // Khóa tạm thời mà đang đi dở: nghỉ ô này, chuyến đi chờ ô sau.
  if (lock) return perform(actionDef(REST.action)!, null, c, tick, logic, market, rng, log, age, people, roads, career, doctor);

  const d = actionDef(planned.action)!;
  if (!s.active) {
    const preview = d.group === 'travel' ? previewTravel(logic, c.location, planned.target!, roads) : null;
    // Chuyến buôn đi về (S3): gấp đôi đường, không đổi nơi ở
    const total = preview ? preview.slots * (d.id === 'action.haul' ? 2 : 1) : d.slots;
    s.active = { slot: { ...planned }, total, remaining: total, preview };
    if (d.id === 'action.haul' && preview) social?.haul?.(planned, preview, c, log);
  }
  const active = s.active;
  const result = perform(d, active.preview, c, tick, logic, market, rng, log, age, people, roads, career, doctor);
  if (result.death) return result;
  if (d.group === 'social' && social) social.act(active.slot, c, log);
  if (d.id === 'action.enlist') social?.enlist?.(c, log);
  if (OWN_ACTIONS.has(d.id)) social?.own?.(d.id, c, log);
  social?.worked?.(d.id);
  active.remaining--;
  if (active.remaining === 0) {
    s.active = null;
    if (active.preview && d.id === 'action.travel') arrive(s, c, active.preview.county, logic, log);
  } else log({ key: 'log.travel.progress', params: { remaining: active.remaining }, importance: 'minor' });
  return result;
}

/** Tới nơi: ô di chuyển tới đây trong kế hoạch thành nghỉ (đi một lần, không lặp), và kế hoạch được xét lại ở nơi mới. */
function arrive(s: PlayerState, c: CharacterState, county: number, logic: RegionLogic, log: Log): void {
  c.location = county;
  if (s.plan) {
    s.plan = { slots: s.plan.slots.map((p) => (p.action === 'action.travel' && p.target === county ? { ...REST } : p)) as MonthPlan['slots'] };
  }
  s.planWarned = false;
  log({ key: 'log.travel.arrived', params: { county: logic.counties[county]!.name ?? 'place.unknown' }, importance: 'minor' });
}

/**
 * Thầy thuốc hành nghề lây bệnh của người bệnh (ppm mỗi ô, S5, Q6): ngày thường 0,5%, quận đang có dịch 6% — cộng thêm
 * vào khởi phát bệnh thường của tuần (dịch đã gấp ba). Mùa dịch phí gấp đôi: lúc cần và lúc nguy.
 */
export const PRACTICE_INFECT_PPM = 5_000;
export const PRACTICE_INFECT_EPIDEMIC_PPM = 60_000;

/** Trừ giá, cho kết quả và tính rủi ro của một ô. Việc thường ngày không ghi nhật ký. */
function perform(d: ActionDef, route: TravelPreview | null, c: CharacterState, tick: Tick, logic: RegionLogic, market: CountyEconomy, rng: RngSource, log: Log, age: number, people: NpcWorldState | null, roads: readonly number[] | null, career: CareerState | null, doctor: PlayerDoctor | null): { death: Death | null; carePct: number } {
  const { ppm, carePct } = slotEffects(d, route, c, tick, logic, market, rng, log, people, roads, career, doctor);
  // Mỗi hệ thống dùng luồng riêng; nguy hiểm đường tính trên dữ liệu nguyên đã lưu.
  const death = d.riskPpm > 0 ? slotMishap(c, tick, ppm, d.group === 'travel' ? 'accident.travel' : 'accident.action', rng.get(d.group === 'travel' ? 'travel' : 'actions'), log, age) : null;
  if (death) return { death, carePct };
  recoverStamina(c, tick, d.group === 'rest');
  return { death: null, carePct };
}

/**
 * Phần tất định và kinh tế của một ô (trừ thể lực, kỹ năng, tuần công, tiền, nghỉ, chữa), trả về rủi ro (ppm) của ô.
 * Tầng NPC L1 (ADR 0015) gọi ba lần rồi rút rủi ro một lần cho cả tháng. `roads`: hệ số rủi ro mỗi đường theo người giữ
 * (v0.6 S6, `roadRisk`); null thì đường chỉ theo địa hình. `career`: thân phận nghề của người chơi (v0.7 S2).
 */
export function slotEffects(d: ActionDef, route: TravelPreview | null, c: CharacterState, tick: Tick, logic: RegionLogic, market: CountyEconomy, rng: RngSource, log: Log, people: NpcWorldState | null = null, roads: readonly number[] | null = null, career: CareerState | null = null, doctor: PlayerDoctor | null = null): { ppm: number; carePct: number } {
  const tired = fatiguePct(c, tick);
  if (spendStamina(c, d.stamina)) log({ key: 'log.exhaustion', params: {}, importance: 'minor' });
  if (d.skill) gainSkill(c, d.skill, tick, d.skillGain);
  // Tuần công tính cho mùa tới; gặt đầu tháng thu hoạch (ADR 0012)
  if (d.id === 'action.farm') recordFarmWeek(c.household, c.location);
  // Tiền, lương của ô này ở chợ đang đứng (ADR 0012); đi đường thiếu tiền trọ thì rủi ro cao hơn
  // Chữa bệnh: phí vào túi thầy thuốc NPC ở quận đang đứng nếu có (v0.5 S3); người chơi hành nghề ở đây thì vào túi người chơi (S5)
  const physician = d.id !== 'action.heal' ? null : doctor?.county === c.location ? doctor.purse : people ? physicianIn(people, c.location)?.character.household ?? null : null;
  const land = c.household.landMu;
  const moneyRiskPct = settleAction(d.id, c, tick, market, rng.get('actions'), physician, career);
  // Hành nghề y (S5): ngồi giữa người bệnh thì dễ lây, mùa dịch nhiều hơn hẳn (luồng illness, chỉ rút khi đang không bệnh)
  if (d.id === 'action.practice' && !hasCondition(c, 'illness')) {
    const r = rng.get('illness');
    if (r.chance(epidemicAt(market, tick) ? PRACTICE_INFECT_EPIDEMIC_PPM : PRACTICE_INFECT_PPM)) startCondition(c, pickIllness(c, tick, r), 'illness', r, log, ageYearsAt(c.birthTick, tick));
  }
  // Mua được ruộng (v0.7 S2): ghi nhật ký, không ngắt tua
  if (c.household.landMu > land) log({ key: c.household.tenure === 'landlord' ? 'log.land.bought_landlord' : 'log.land.bought', params: { land: c.household.landMu }, importance: 'minor' });
  let carePct = 0;
  if (d.group === 'rest') { c.health = Math.min(c.healthMax, c.health + 18); carePct = 10; }
  if (d.group === 'heal') {
    c.health = Math.min(c.healthMax, c.health + 100); carePct = 50;
    for (const condition of c.conditions) condition.weeksLeft = Math.max(1, condition.weeksLeft - 1);
  }
  const terrain = route ? routeRiskPct(logic, route.route, roads) : 100;
  let ppm = mulDiv(mulDiv(mulDiv(d.riskPpm, terrain, 100), tired, 100), moneyRiskPct, 100);
  if (d.skill) ppm = mulDiv(ppm, skillRiskPct(c, d.skill), 100);
  // Thợ săn lành nghề ít gặp nạn hơn (S2); người lưu lạc từng trải đi đường ít nạn hơn (S6)
  if (d.id === 'action.hunt' || d.id === 'action.trap') ppm = mulDiv(ppm, HUNT_RANK_RISK_PCT[rankStep(career, 'hunter')], 100);
  if (d.id === 'action.travel') ppm = mulDiv(ppm, DRIFTER_ROAD_RISK_PCT[rankStep(career, 'drifter')], 100);
  return { ppm, carePct };
}

/** Rút rủi ro của ô (hay của cả tháng ở tầng L1): chết vì tai nạn, hoặc bị thương nhẹ. */
export function slotMishap(c: CharacterState, tick: Tick, ppm: number, fatal: string, r: Rng, log: Log, age: number): Death | null {
  if (!r.chance(ppm)) return null;
  if (r.chance(mulDiv(ACCIDENT_FATAL_PPM, skillRiskPct(c, 'martial'), 100))) return { tick, cause: 'accident', detail: fatal };
  if (!hasCondition(c, 'injury')) {
    c.conditions.push({ id: 'injury.wound', kind: 'injury', severity: 'mild', weeksLeft: r.int(1, 3) });
    log({ key: 'log.injury.onset', params: { injury: 'injury.wound', age }, importance: 'major' });
  }
  return null;
}
