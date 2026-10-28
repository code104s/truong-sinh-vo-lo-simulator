// Pha NPC trong tick (GDD 3.2 B: thế giới → thế lực → NPC → sự kiện → người chơi → hậu quả). ADR 0015.
// S2 v0.4: tầng L0 chạy mỗi tuần đúng luật người chơi — cùng hàm bệnh, tai nạn, hành động, ăn, hậu quả, lão hóa, thuế
// đinh, mùa gặt; chỉ khác chỗ kế hoạch tháng do bộ não nhu cầu xếp. Tầng L1 (gộp ba tuần ở đầu tháng) có từ S3; tới đó
// NPC ở L1 đứng yên. NPC không nhận sự kiện có lựa chọn (đó là của người chơi).
import { ageYearsAt, calendarOf, HARVEST_MONTH, isMonthStart, isYearStart, TICKS_PER_MONTH, type Tick } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { idiv, mulDiv } from '../core/math';
import { Rng } from '../core/rng';
import { harvestPlayer } from '../economy/farming';
import { headTax, tradeGrain, yearlySpending } from '../economy/income';
import { epidemicAt, marketView, supplyOf, type EconomyState } from '../economy/market';
import { ACTION_MIN_AGE, actionDef, actionLock } from '../life/actions';
import { hasCondition, type CharacterState } from '../life/character';
import { accidentFatalPpm, accidentPpm, agingPhase, compoundPpm, consequencesPhase, eventsPhase, illnessPpm, pickIllness, pickInjury, startCondition, type Death } from '../life/health';
import { COMING_OF_AGE, feedPhase, rationOf, stayAtHomeYear, type ParentFeed } from '../life/household';
import { childrenIndex, feedersOf, giversOf, kinHelp, lookup, playerStandIn } from './family';
import { playerPhase, slotEffects, slotMishap } from '../life/player';
import { recoverStamina } from '../life/stamina';
import { decaySkills } from '../life/skills';
import { HEALTH_FULL } from '../life/params';
import { ambitionPlan, needsPlan, tradeDecision, weakPlan, workChoice, type BrainInput } from './brain';
import { baseOccupation, comeOfAge, die, npcYearStart, type DeathContext, type Inheritance } from './lifecycle';
export { die } from './lifecycle';
import type { NpcState, NpcWorldState, Occupation } from './state';

/** Việc của nghề: thầy đồ, thầy thuốc chưa có hành động nghề riêng (v0.7), tạm làm thuê như người ở trấn. */
export const OCCUPATION_ACTION: Record<Occupation, string | undefined> = {
  child: undefined, farmer: 'action.farm', hunter: 'action.hunt', laborer: 'action.hire', teacher: 'action.hire', physician: 'action.hire', merchant: 'action.trade',
};

/**
 * Việc của nghề lúc này. Thương nhân chỉ buôn khi vốn đủ lời bằng đi làm thuê (lãi người mới khoảng 15‰ vốn mỗi tuần,
 * lương 60 văn ⇒ vốn từ 4.000); vốn mỏng thì đi làm thuê, buôn thua lỗ vốn mỏng là chết đói (đo ở S4).
 */
export const MERCHANT_LIVING_CAPITAL = 4_000;
function occupationAction(n: NpcState): string | undefined {
  if (n.occupation === 'merchant' && n.character.household.money < MERCHANT_LIVING_CAPITAL) return 'action.hire';
  return OCCUPATION_ACTION[n.occupation];
}

function noLog(): void {}

const NO_DEPENDENTS: ReadonlyMap<string, number> = new Map();

/** Đầu tháng: người đang đói được người thân cùng quận chia lương (Q6, cùng luật với người chơi). */
function helpHungry(world: NpcWorldState, tick: Tick, me: NpcState | null): void {
  const byId = lookup(world);
  let kids: Map<string, NpcState[]> | null = null;
  for (const n of world.people) {
    if (n.death || n.character.household.hunger === 0 || !n.character.household.independent) continue;
    // Bảng con theo cha mẹ chỉ dựng khi có người đói (tháng thường không có ai)
    kids ??= childrenIndex(world);
    kinHelp(n.character, giversOf(n.character, byId, kids.get(n.id) ?? [], me), rationOf(n.character, tick));
  }
}

/** Đầu tháng: mỗi người nuôi con ăn thêm bao nhiêu mỗi tuần (thăng) — để bộ não tính theo cả nhà (S2 v0.5). */
function dependentNeeds(world: NpcWorldState, tick: Tick, me: NpcState | null): Map<string, number> {
  const out = new Map<string, number>();
  const byId = lookup(world);
  for (const n of world.people) {
    if (n.death || n.character.household.independent || (n.character.kin.mother === null && n.character.kin.father === null)) continue;
    if (ageYearsAt(n.character.birthTick, tick) >= COMING_OF_AGE) continue;
    // Cha mẹ cùng gánh: mỗi người tính một nửa miệng ăn của con (phần lẻ cho người mẹ)
    const ps = feedersOf(n, byId, me), r = rationOf(n.character, tick);
    ps.forEach((p, i) => out.set(p.id, (out.get(p.id) ?? 0) + (ps.length === 1 ? r : i === 0 ? r - Math.floor(r / 2) : Math.floor(r / 2))));
  }
  return out;
}

/** Con dưới 16 có cha mẹ thật ăn vào kho người nuôi (S2 v0.5), kể cả kho người chơi (S5); người lớn, trẻ mồ côi: null. */
function parentFeed(n: NpcState, world: NpcWorldState, eco: EconomyState, me: NpcState | null): ParentFeed | null {
  const k = n.character.kin;
  if (n.character.household.independent || (k.mother === null && k.father === null)) return null;
  const ps = feedersOf(n, lookup(world), me);
  // Con 12–15 tuổi đi làm thì ăn vào túi, kho của chính mình trước (ADR 0013: tiền làm ra vào túi riêng)
  return ps.length ? { own: n.character.household, parents: ps.map((p) => p.character.household), market: eco.counties[ps[0]!.character.location]! } : null;
}

const REST = actionDef('action.rest')!;

function memo(f: (id: string) => boolean): (id: string) => boolean {
  const seen = new Map<string, boolean>();
  return (id) => { let v = seen.get(id); if (v === undefined) { v = f(id); seen.set(id, v); } return v; };
}

/** Một luồng RNG cho mọi tên luồng (ADR 0015). Lớp thay cho closure tạo mỗi tuần: vòng NPC là đường nóng. */
class SingleStream {
  constructor(readonly r: Rng) {}
  get(): Rng { return this.r; }
}

export interface NpcPhaseOptions {
  /** Chạy mọi NPC ở tầng L0 (đo tương đương, thế giới tự chạy khi kiểm S2). */
  allL0?: boolean;
  /**
   * Người chơi (đời đang chơi): nhận thừa kế khi cha, mẹ, vợ/chồng mất (v0.5 S3), phần nhận ghi vào `inherited`; nuôi
   * con, nhận con, giúp người thân khi đói như mọi người (S5). Sinh khó khi là mẹ thì ghi vào `death`.
   */
  player?: { c: CharacterState; inherited: Inheritance[]; death?: Death | null };
}

/**
 * Một tick của mọi NPC còn sống, theo id. Đầu tháng xếp lại tầng theo quận người chơi đang đứng (ADR 0015): quận đó L0,
 * quận khác L1. L0 chạy mỗi tuần; L1 chạy một lần ở đầu tháng, gộp cả ba tuần.
 * `playerCounty`: null khi thế giới tự chạy (mọi NPC L1, trừ khi `allL0`).
 */
export function npcPhase(world: NpcWorldState, eco: EconomyState, logic: RegionLogic, tick: Tick, playerCounty: number | null, opts: NpcPhaseOptions = {}): void {
  const monthStart = isMonthStart(tick);
  // Bộ não xếp kế hoạch đầu tháng theo miệng ăn cả nhà: đếm con đang nuôi một lần cho cả tháng
  // Đầu năm: dọn người đã mất, sinh trẻ, xét lại nghề (S4); trẻ mới sinh chạy luôn tuần này
  const me = opts.player ? playerStandIn(opts.player.c) : null;
  const deaths: DeathContext = { world, player: opts.player ?? null, me };
  if (isYearStart(tick)) npcYearStart(world, eco, logic, tick, opts.allL0 ? null : playerCounty, deaths);
  const needs = monthStart ? dependentNeeds(world, tick, me) : NO_DEPENDENTS;
  if (monthStart) helpHungry(world, tick, me);
  for (const n of world.people) {
    if (n.death) continue;
    if (monthStart) n.tier = opts.allL0 || n.character.location === playerCounty ? 'L0' : 'L1';
    if (n.tier === 'L0') stepL0(n, world, eco, logic, tick, needs, deaths);
    else if (monthStart) stepL1(n, world, eco, logic, tick, needs, deaths);
  }
}

/** Đầu vào bộ não nhu cầu của một NPC, đọc từ trạng thái của chính người ấy và chợ quận đang đứng. */
export function npcBrainInput(n: NpcState, eco: EconomyState, logic: RegionLogic, tick: Tick, need = rationOf(n.character, tick)): BrainInput {
  const c = n.character;
  const market = eco.counties[c.location]!;
  const kind = logic.settlementKind[c.location]!;
  return {
    ageYears: ageYearsAt(c.birthTick, tick), healthPct: idiv(c.health * 100, HEALTH_FULL), sick: c.conditions.length > 0,
    independent: c.household.independent, money: c.household.money, grain: c.household.grain, month: calendarOf(tick).month,
    // Mỗi lần xếp kế hoạch hỏi lại vài hành động nhiều lần: nhớ kết quả trong lần gọi này (khóa không đổi trong lúc xếp)
    usable: memo((id) => { const d = actionDef(id); return !!d && actionLock(d, c, tick, kind, market) === null; }),
    market: marketView(eco, c.location),
    need,
  };
}

/** Đầu tháng: mua bán lương (cùng luật lệnh TRADE), rồi xếp kế hoạch ba ô theo nhu cầu và nghề. */
export function planMonth(n: NpcState, eco: EconomyState, logic: RegionLogic, tick: Tick, r: Rng, dependents: ReadonlyMap<string, number> = NO_DEPENDENTS): void {
  const c = n.character;
  if (ageYearsAt(c.birthTick, tick) < ACTION_MIN_AGE || n.active) return;
  comeOfAge(n, eco, logic, tick, r);
  // Một đầu vào cho cả tháng: mua bán xong thì cập nhật túi, kho, chợ (khóa tiền của hành động xét sau khi mua bán)
  const b = npcBrainInput(n, eco, logic, tick, rationOf(c, tick) + (dependents.get(n.id) ?? 0));
  const grain = tradeDecision(b);
  if (grain !== 0 && tradeGrain(c.household, eco.counties[c.location]!, grain) === null) {
    b.money = c.household.money; b.grain = c.household.grain; b.market = marketView(eco, c.location);
  }
  const w = workChoice(b, occupationAction(n));
  n.plan = weakPlan(b, w) ?? (b.independent ? ambitionPlan(b, w, AMBITION_ACTION[c.personality] ?? null) : null) ?? needsPlan(b, w);
  n.planWarned = false;
}

/** Việc riêng theo tính cách khi đã đủ ăn lâu dài: người chuộng chữ nghĩa thì học, người ham lời thì buôn (S4). */
const AMBITION_ACTION: Record<string, string> = {
  righteous: 'action.study', calm: 'action.study', kind: 'action.study', loyal: 'action.study', aloof: 'action.study', eccentric: 'action.study',
  ambitious: 'action.trade', cunning: 'action.trade', greedy: 'action.trade', cheerful: 'action.trade',
};

/** Đầu năm, như người chơi ở pha Thế giới: người hẹn ở lại nộp nửa túi về nhà (tới 20 tuổi thì ra riêng), rồi thuế đinh. */
function npcNewYear(n: NpcState, eco: EconomyState, logic: RegionLogic, t: Tick): void {
  const c = n.character;
  if (stayAtHomeYear(c, eco.counties[c.home]!, t)) n.occupation = baseOccupation(c, logic);
  headTax(c, eco.counties[c.home]!, t);
  yearlySpending(c, eco.counties[c.location]!);
}

/** Một tuần ở tầng L0. Thứ tự như người chơi: thuế đầu năm, mùa gặt, kế hoạch, sự kiện, hành động, ăn, lão hóa, hậu quả. */
function stepL0(n: NpcState, world: NpcWorldState, eco: EconomyState, logic: RegionLogic, t: Tick, needs: ReadonlyMap<string, number>, deaths: DeathContext): void {
  const c = n.character;
  const rng = Rng.fromState(n.rng);
  const one = new SingleStream(rng);
  if (isYearStart(t)) npcNewYear(n, eco, logic, t);
  if (isMonthStart(t)) {
    if (calendarOf(t).month === HARVEST_MONTH) harvestPlayer(c, eco, logic);
    planMonth(n, eco, logic, t, rng, needs);
  }
  const market = eco.counties[c.location]!;
  const epidemic = epidemicAt(market, t) && !(c.household.shieldUntil > t);
  let death: Death | null = eventsPhase(c, t, rng, rng, noLog, epidemic);
  const action = death ? { death, carePct: 0 } : playerPhase(n, c, t, logic, eco, one, noLog, world);
  death = action.death;
  if (!death) {
    feedPhase(c, t, supplyOf(eco.counties[c.home]!), rng, noLog, market, parentFeed(n, world, eco, deaths.me ?? null));
    if (isYearStart(t)) { agingPhase(c, t); decaySkills(c, t); }
    death = consequencesPhase(c, t, rng, noLog, action.carePct);
  }
  if (death) die(n, death, eco, deaths);
  n.rng = rng.state();
}

/**
 * Một tháng ở tầng L1, chạy ở tuần đầu tháng (ADR 0015). Cùng hàm luật với L0; chỉ gộp chỗ đắt mà không làm lệch:
 * - xác suất bệnh, tai nạn tính một lần cho cả tháng (1 − (1 − p)³), rút một lần; khởi phát rơi vào một tuần ngẫu nhiên
 *   của tháng và chỉ có tác dụng từ tuần đó (khởi phát luôn ở tuần đầu thì người bệnh làm trọn tháng với kế hoạch cũ: lệch);
 * - ba ô kế hoạch, ăn, hậu quả chạy xen theo từng tuần như L0 (chính chúng quyết định đói, chết đói, chữa bệnh);
 * - không qua lớp kế hoạch dở của người chơi (`playerPhase`), luồng RNG dựng một lần mỗi tháng.
 */
function stepL1(n: NpcState, world: NpcWorldState, eco: EconomyState, logic: RegionLogic, t: Tick, needs: ReadonlyMap<string, number>, deaths: DeathContext): void {
  const c = n.character;
  const rng = Rng.fromState(n.rng);
  const one = new SingleStream(rng);
  if (isYearStart(t)) npcNewYear(n, eco, logic, t);
  if (calendarOf(t).month === HARVEST_MONTH) harvestPlayer(c, eco, logic);
  planMonth(n, eco, logic, t, rng, needs);
  const market = eco.counties[c.location]!;
  const kind = logic.settlementKind[c.location]!;
  const epidemic = epidemicAt(market, t) && !(c.household.shieldUntil > t);
  const age = ageYearsAt(c.birthTick, t);
  // Bệnh, tai nạn của cả tháng: rút trước, áp vào đúng tuần
  const illWeek = !hasCondition(c, 'illness') && rng.chance(compoundPpm(illnessPpm(c, t, epidemic), TICKS_PER_MONTH)) ? rng.int(0, TICKS_PER_MONTH - 1) : -1;
  const illness = illWeek >= 0 ? pickIllness(c, t, rng) : null;
  const hurtWeek = rng.chance(compoundPpm(accidentPpm(c, t), TICKS_PER_MONTH)) ? rng.int(0, TICKS_PER_MONTH - 1) : -1;
  let death: Death | null = null;
  const feed = parentFeed(n, world, eco, deaths.me ?? null);
  for (let k = 0; k < TICKS_PER_MONTH && !death; k++) {
    const tk = t + k;
    if (k === illWeek && illness && !hasCondition(c, 'illness')) startCondition(c, illness, 'illness', rng, noLog, age);
    if (k === hurtWeek) {
      if (rng.chance(accidentFatalPpm(c))) { death = { tick: tk, cause: 'accident', detail: 'accident.fatal' }; break; }
      if (!hasCondition(c, 'injury')) startCondition(c, pickInjury(rng), 'injury', rng, noLog, age);
    }
    let care = 0;
    if (age < ACTION_MIN_AGE) playerPhase(n, c, tk, logic, eco, one, noLog, world);
    else {
      const def = actionDef(n.plan?.slots[k]?.action ?? 'action.rest')!;
      const d = actionLock(def, c, tk, kind, market) ? REST : def;
      const slot = slotEffects(d, null, c, tk, logic, market, one, noLog, world);
      care = slot.carePct;
      death = d.riskPpm > 0 ? slotMishap(c, tk, slot.ppm, 'accident.action', rng, noLog, age) : null;
      if (death) break;
      recoverStamina(c, tk, d.group === 'rest');
    }
    feedPhase(c, tk, supplyOf(eco.counties[c.home]!), rng, noLog, market, feed);
    if (k === 0 && isYearStart(t)) { agingPhase(c, t); decaySkills(c, t); }
    death = consequencesPhase(c, tk, rng, noLog, care);
  }
  if (death) die(n, death, eco, deaths);
  n.rng = rng.state();
}

