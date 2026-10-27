// Một đời người: vòng tick theo pha có nhịp (ADR 0002), tua, nhật ký, snapshot (ADR 0004).
import {
  GRAIN_PER_DOU, TICKS_PER_MONTH, TICKS_PER_YEAR, ageYearsAt, calendarOf, isMonthStart, isYearStart,
  type AdvanceMode, type Birthplace, type CharacterView, type LifeSummary, type LogEntry, type MarketView, type NpcView, type NewLifeConfig, type PendingEvent, type Tick, type MonthPlan, type SupplyBand,
} from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { digestOf } from '../core/digest';
import { hash32 } from '../core/hash';
import { idiv, mulDiv } from '../core/math';
import { RngStreams, type RngStreamsSnapshot } from '../core/rng';
import { createCharacter, toView, type CharacterState } from './character';
import { agingPhase, consequencesPhase, eventsPhase, type Death } from './health';
import { feedPhase, stayAtHomeYear } from './household';
import { harvestPlayer } from '../economy/farming';
import { EVENTS } from '../events/catalog';
import { choose as chooseEvent, makeContext, newEventsState, pendingView, rollEvent, type EventsState } from '../events/engine';
import { headTax, HEAD_TAX, tradeGrain } from '../economy/income';
import {
  buyPrice, countyMoney, createEconomy, economyMonth, epidemicAt, HARVEST_MONTH, marketView, supplyOf, worldYearStart, type EconomyState,
} from '../economy/market';
import { AGE_MILESTONES, UNTIL_EVENT_MAX_TICKS } from './params';
import { staminaMax } from './stamina';
import { decaySkills } from './skills';
import { ACTION_MIN_AGE, actionOptions, validatePlan } from './actions';
import { playerPhase, type PlayerState } from './player';
import { previewTravel } from './travel';
import { npcPhase } from '../npc/phase';
import { seedPopulation } from '../npc/population';
import { newNpcWorld, npcMoney, npcViews, type NpcWorldState } from '../npc/state';

/**
 * Đổi khi hình snapshot đổi, để save cũ bị từ chối rõ ràng (lỗi VERSION) thay vì lỗi schema. 0.3.1: hộ thêm nợ vay,
 * tai họa, lập thân (S6–S7) và bộ đếm năm đói (F5). 0.4.0: NPC trong snapshot, luồng `npc-world` (v0.4 Bước 0).
 */
export const SIM_VERSION = '0.4.0';
/** `npc-world`: tạo dân số ban đầu và trẻ sinh mới (ADR 0016); mỗi NPC còn có luồng riêng trong NpcState. */
export const STREAMS = ['accident', 'actions', 'character', 'economy', 'events', 'health', 'illness', 'names', 'npc-world', 'travel', 'weather'] as const;

export interface LifeSnapshot extends PlayerState {
  simVersion: string;
  config: NewLifeConfig;
  /** Tick kế tiếp sẽ chạy. */
  tick: Tick;
  character: CharacterState;
  /** Chợ các quận của vùng (ADR 0012); thế giới chạy cùng đời người chơi. */
  economy: EconomyState;
  /** Sự kiện có lựa chọn: đang chờ, thời gian chờ, cờ một lần (ADR 0014). */
  events: EventsState;
  /** Người có tên quanh người chơi (ADR 0015, 0016); rỗng tới S1. */
  npcs: NpcWorldState;
  rng: RngStreamsSnapshot;
  death: Death | null;
}

export type AdvanceResult =
  | { status: 'done'; entries: LogEntry[] }
  | { status: 'interrupted'; entries: LogEntry[]; entry: LogEntry }
  /** Tua dừng vì có sự kiện cần chọn; ADVANCE bị từ chối cho tới khi chọn (ADR 0014). */
  | { status: 'event'; entries: LogEntry[]; pending: PendingEvent }
  | { status: 'died'; entries: LogEntry[] }
  | { status: 'stuck'; entries: LogEntry[] };

/** Seed gốc của đời: worldSeed + nơi sinh + lifeSeed (mặc định suy ra từ hai cái đầu, GDD 3.2 A). */
export function lifeRoot(config: NewLifeConfig): number {
  const lifeSeed = config.lifeSeed ?? hash32(config.worldSeed, config.birthplaceId);
  return hash32('tsvl-life', config.worldSeed, config.birthplaceId, lifeSeed);
}

export class Life {
  private constructor(
    private s: LifeSnapshot,
    private streams: RngStreams,
    readonly log: LogEntry[],
    readonly logic: RegionLogic,
  ) {}

  static create(config: NewLifeConfig, birthplace: Birthplace, logic: RegionLogic = singleCounty(birthplace)): Life {
    if (birthplace.id !== config.birthplaceId) throw new Error('nơi sinh không khớp cấu hình');
    const streams = RngStreams.create(lifeRoot(config), STREAMS);
    // Sinh vào một tuần bất kỳ của năm 1
    const birthTick = streams.get('character').int(0, TICKS_PER_YEAR - 1);
    const character = createCharacter({ birthTick, birthplaceId: birthplace.id, birthplaceKind: birthplace.kind, county: birthplace.county }, streams.get('character'), streams.get('names'));
    agingPhase(character, birthTick);
    character.health = character.healthMax;
    character.stamina = staminaMax(character, birthTick);
    // Người có tên quanh mình (ADR 0016): sinh cùng lúc với người chơi, từ luồng npc-world
    const economy = createEconomy(logic, birthTick);
    const npcs = newNpcWorld(lifeRoot(config), config.regionId);
    seedPopulation(npcs, economy, logic, streams.get('npc-world'), birthTick, birthplace.county);
    // Tuần sinh coi như đã qua: tick kế tiếp là tuần sau khi sinh
    const life = new Life({ simVersion: SIM_VERSION, config, tick: birthTick + 1, character, economy, events: newEventsState(), npcs, rng: streams.snapshot(), death: null, plan: null, active: null, planWarned: false }, streams, [], logic);
    life.push({ tick: birthTick, key: 'log.birth', params: { birthplace: birthplace.name, background: `background.${character.background}` }, importance: 'major' });
    return life;
  }

  static restore(snap: LifeSnapshot, log: LogEntry[], logic: RegionLogic = singleCounty({ county: snap.character.home, kind: snap.character.birthplaceKind })): Life {
    const s = structuredCloneSnapshot(snap);
    return new Life(s, RngStreams.restore(s.rng), [...log], logic);
  }

  get plan(): MonthPlan | null { return this.s.plan ? { slots: this.s.plan.slots.map((p) => ({ ...p })) as MonthPlan['slots'] } : null; }
  get active(): PlayerState['active'] { return this.s.active ? JSON.parse(JSON.stringify(this.s.active)) as PlayerState['active'] : null; }
  actions() { return actionOptions(this.s.character, this.displayTick, this.logic, this.s.economy); }
  travel() { return this.logic.counties.flatMap((_, county) => { const p = previewTravel(this.logic, this.s.character.location, county); return p ? [{ county, slots: p.slots, risk: p.risk }] : []; }); }
  previewTravel(county: number) { return previewTravel(this.logic, this.s.character.location, county); }
  setPlan(plan: MonthPlan): boolean {
    if (!this.alive || ageYearsAt(this.s.character.birthTick, this.s.tick) < ACTION_MIN_AGE || !validatePlan(plan, this.logic)) return false;
    this.s.plan = { slots: plan.slots.map((p) => ({ ...p })) as MonthPlan['slots'] };
    this.s.planWarned = false;
    return true;
  }

  get tick(): Tick {
    return this.s.tick;
  }
  get alive(): boolean {
    return this.s.death === null;
  }
  get character(): Readonly<CharacterState> {
    return this.s.character;
  }
  get death(): Death | null {
    return this.s.death;
  }

  /** Ngày hiện tại để hiển thị: tuần đang đứng (sắp chạy); đã chết thì là tuần mất. */
  get displayTick(): Tick {
    return this.s.death ? this.s.death.tick : this.s.tick;
  }

  view(): CharacterView {
    return toView(this.s.character, this.displayTick, buyPrice(this.s.economy.counties[this.s.character.location]!));
  }

  snapshot(): LifeSnapshot {
    this.s.rng = this.streams.snapshot();
    return structuredCloneSnapshot(this.s);
  }

  digest(): string {
    return digestOf(this.snapshot());
  }

  private push(e: LogEntry): void {
    this.log.push(e);
  }

  /** Chạy đúng một tick (một tuần) theo thứ tự pha của GDD 3.2 B. */
  private step(): Death | null {
    const t = this.s.tick;
    const c = this.s.character;
    const entries: LogEntry[] = [];
    const log = (e: Omit<LogEntry, 'tick'>) => entries.push({ tick: t, ...e });

    // 1 Thế giới: thời tiết (năm), chợ quận (tháng). 2 Thế lực: chưa có (v0.6). 3 NPC (ADR 0015): chưa có NPC tới S1
    this.worldPhase(t, log);
    const firstNew = this.s.npcs.nextId;
    npcPhase(this.s.npcs, this.s.economy, this.logic, t, c.location);
    this.npcNews(t, firstNew, log);
    // 4 Sự kiện (tuần): bệnh, tai nạn, rồi sự kiện có lựa chọn
    const here = this.s.economy.counties[c.location]!;
    const epidemic = epidemicAt(here, t) && !(c.household.shieldUntil > t);
    let death = eventsPhase(c, t, this.streams.get('illness'), this.streams.get('accident'), log, epidemic);
    if (!death) rollEvent(this.s.events, EVENTS, this.context(t), this.streams.get('events'));
    // 5 Người chơi: tuổi thơ hoặc ô kế hoạch tháng (ADR 0008).
    const action = death ? { death, carePct: 0 } : playerPhase(this.s, c, t, this.logic, this.s.economy, this.streams, log);
    death = action.death;
    // 6 Hậu quả: ăn (tuần), lão hóa (năm), diễn tiến (tuần), tử vong (cuối pha)
    if (!death) {
      const market = this.s.economy.counties[c.location]!;
      feedPhase(c, t, this.homeSupply(), this.streams.get('economy'), log, market);
      if (isYearStart(t)) { agingPhase(c, t); decaySkills(c, t); }
      death = consequencesPhase(c, t, this.streams.get('health'), log, action.carePct);
    }
    if (!death) {
      const age = ageYearsAt(c.birthTick, t);
      if ((t - c.birthTick) % TICKS_PER_YEAR === 0 && AGE_MILESTONES.includes(age)) {
        log({ key: 'log.age.milestone', params: { age }, importance: 'major' });
      }
    }
    if (death) {
      c.alive = false;
      c.conditions = [];
      this.s.events.pending = null;
      this.s.death = death;
      // Chết vì bệnh mà đang đói: vẫn là bệnh, kể thêm hoàn cảnh (ADR 0013)
      const key = death.cause === 'illness' && c.household.hunger > 0 ? 'log.death.hungry' : 'log.death';
      log({ key, params: { cause: `death.${death.cause}`, detail: death.detail, age: ageYearsAt(c.birthTick, t) }, importance: 'major' });
    }
    for (const e of entries) this.push(e);
    this.s.tick = t + 1;
    return death;
  }

  /**
   * Tin sinh, mất của người có tên ở quận đang đứng hoặc quận nhà (v0.4 S6). Người mất báo đúng tuần mất (NPC tầng L1
   * tính trước cả tháng nên có tuần mất sau tuần này). Người đã gặp trong sự kiện thì tin quan trọng, và tin về họ tới
   * được người chơi dù họ mất ở quận nào (F4: màn tổng kết kể "những người đã đi trước").
   */
  private npcNews(t: Tick, firstNew: number, log: (e: Omit<LogEntry, 'tick'>) => void): void {
    const c = this.s.character, met = this.s.events.met;
    const born = this.s.npcs.nextId > firstNew;
    for (const n of this.s.npcs.people) {
      // Tuần thường không có ai sinh, mất: xét điều kiện rẻ trước
      const dead = n.death?.tick === t, newborn = born && !n.death && Number(n.id.slice(1)) >= firstNew;
      if (!dead && !newborn) continue;
      const x = n.character;
      const known = dead && met.includes(n.id);
      if (!known && x.location !== c.location && x.home !== c.home) continue;
      if (dead) log({ key: 'log.npc.death', params: { name: x.name, age: ageYearsAt(x.birthTick, t), cause: `death.${n.death!.cause}` }, importance: known ? 'major' : 'minor' });
      else log({ key: 'log.npc.birth', params: { name: x.name }, importance: 'minor' });
    }
  }

  /** Tình hình lương thực của quận nhà, nơi hộ cha mẹ sống (ADR 0013). */
  private homeSupply(): SupplyBand {
    return supplyOf(this.s.economy.counties[this.s.character.home]!);
  }

  /** Pha Thế giới. Tin tức chỉ về quận đang đứng: người chơi không biết chuyện nơi khác. */
  private worldPhase(t: Tick, log: (e: Omit<LogEntry, 'tick'>) => void): void {
    const eco = this.s.economy;
    const c = this.s.character;
    if (isYearStart(t)) {
      worldYearStart(eco, this.streams.get('weather'), t);
      this.stayAtHome(t, log);
      const debtBefore = c.household.taxDebt;
      const paid = headTax(c, eco.counties[c.home]!, t);
      // Thiếu thuế là chuyện lớn với người tự nuôi mình; quan sai tới đòi ở S5
      if (c.household.taxDebt > debtBefore) log({ key: 'log.tax.short', params: { paid, owed: c.household.taxDebt }, importance: 'major' });
      else if (paid > 0) log({ key: 'log.tax.paid', params: { paid: HEAD_TAX }, importance: 'minor' });
    }
    if (!isMonthStart(t)) return;
    const here = eco.counties[c.location]!;
    const before = supplyOf(here);
    economyMonth(eco, this.logic, t);
    const county = this.logic.counties[c.location]!.name ?? 'place.unknown';
    if (calendarOf(t).month === HARVEST_MONTH) {
      const crop = harvestPlayer(c, eco, this.logic);
      if (crop.gross > 0 || crop.landlordIncome > 0) {
        const dou = (x: number) => idiv(x, GRAIN_PER_DOU);
        log({ key: crop.landlordIncome > 0 ? 'log.harvest.landlord' : 'log.harvest.own', params: { net: dou(crop.net), rent: dou(crop.rent), tax: dou(crop.tax), income: dou(crop.landlordIncome) }, importance: 'minor' });
      }
      // Mất mùa báo trước cơn đói: ngắt tua với người tự nuôi mình
      if (here.weatherPct <= 80) log({ key: 'log.world.harvest_bad', params: { county }, importance: c.household.independent ? 'major' : 'minor' });
      else if (here.weatherPct >= 110) log({ key: 'log.world.harvest_good', params: { county }, importance: 'minor' });
    }
    const after = supplyOf(here);
    if (after === 'famine' && before !== 'famine') log({ key: 'log.world.famine', params: { county }, importance: 'major' });
    else if (before === 'famine' && after !== 'famine') log({ key: 'log.world.famine_end', params: { county }, importance: 'minor' });
    // Tai họa và dịch: tin cho mọi người ở quận ấy (G3); người chơi chỉ được hỏi chọn nếu chạm tới mình (sự kiện)
    if (here.disaster && here.disasterMonth === calendarOf(t).month) log({ key: `log.world.${here.disaster}`, params: { county }, importance: 'major' });
    if (here.epidemicFrom === t) log({ key: 'log.world.epidemic', params: { county }, importance: 'major' });
    this.settleLoan(t, log);
  }

  /**
   * Nợ vay nặng lãi tới hạn (S6): trả bằng tiền, thiếu thì chủ nợ lấy lương theo giá mua ở quận nhà; còn thiếu nữa thì
   * khất sang năm, lãi thêm ba phân (36%). Tiền và lương đều về quỹ, kho quận nhà (sổ cái).
   */
  private settleLoan(t: Tick, log: (e: Omit<LogEntry, 'tick'>) => void): void {
    const h = this.s.character.household;
    if (h.loan <= 0 || t < h.loanDue) return;
    const home = this.s.economy.counties[this.s.character.home]!;
    const paid = Math.min(h.money, h.loan);
    h.money -= paid; home.money += paid; h.loan -= paid;
    const price = Math.max(1, buyPrice(home));
    const grainTaken = Math.min(h.grain, idiv(h.loan * GRAIN_PER_DOU + price - 1, price));
    h.grain -= grainTaken; home.grain += grainTaken;
    h.loan = Math.max(0, h.loan - idiv(grainTaken * price, GRAIN_PER_DOU));
    if (h.loan === 0) {
      h.loanDue = -1;
      log({ key: 'log.loan.paid', params: { paid, grain: idiv(grainTaken, GRAIN_PER_DOU) }, importance: 'minor' });
    } else {
      h.loan = mulDiv(h.loan, 136, 100);
      h.loanDue = t + TICKS_PER_YEAR;
      log({ key: 'log.loan.rolled', params: { owed: h.loan }, importance: 'major' });
    }
  }

  /** Lập thân "ở lại" (ADR 0013): mỗi đầu năm nửa túi về quỹ, kho quận nhà; tới tuổi hẹn thì ra riêng với phần chia lớn hơn. */
  private stayAtHome(t: Tick, log: (e: Omit<LogEntry, 'tick'>) => void): void {
    const c = this.s.character;
    const got = stayAtHomeYear(c, this.s.economy.counties[c.home]!, t);
    if (got) log({ key: 'log.coming_of_age.leave_late', params: { money: got.money, grain: idiv(got.grain, GRAIN_PER_DOU), land: got.landMu }, importance: 'major' });
  }

  /** Lệnh TRADE (ADR 0012): mua (> 0) hoặc bán (< 0) thăng ở chợ đang đứng, không tốn ô. Trả lý do từ chối hoặc null. */
  trade(grain: number): string | null {
    if (!this.alive) return 'đã chết';
    if (ageYearsAt(this.s.character.birthTick, this.s.tick) < ACTION_MIN_AGE) return 'chưa đủ tuổi tự lo liệu';
    return tradeGrain(this.s.character.household, this.s.economy.counties[this.s.character.location]!, grain);
  }

  /** Chợ quận đang đứng. */
  market(): MarketView {
    return marketView(this.s.economy, this.s.character.location);
  }

  /** Người có tên ở quận đang đứng (ADR 0016, Q8), sắp theo id. */
  people(): NpcView[] {
    return npcViews(this.s.npcs, this.s.character.location, this.s.tick);
  }

  /** Người có tên đã mất còn trong danh sách (giữ một năm rồi dọn, S4), mọi quận: id, tuổi lúc mất, nguyên nhân. Cho đo đạc. */
  npcDeaths(): { id: string; tick: Tick; ageYears: number; cause: string }[] {
    return this.s.npcs.people.filter((n) => n.death).map((n) => ({ id: n.id, tick: n.death!.tick, ageYears: ageYearsAt(n.character.birthTick, n.death!.tick), cause: n.death!.cause }));
  }

  /** Sổ cái: tổng tiền của vùng (quỹ quận + túi người chơi), không đổi qua mọi tick (ADR 0012). */
  totalMoney(): number {
    return countyMoney(this.s.economy) + this.s.character.household.money + npcMoney(this.s.npcs);
  }

  /** Tick đích của một chế độ tua: dừng ở ranh giới lịch (ADR 0002). */
  targetOf(mode: AdvanceMode): Tick {
    const t = this.s.tick;
    switch (mode) {
      case 'week':
        return t + 1;
      case 'month':
        return (Math.floor(t / TICKS_PER_MONTH) + 1) * TICKS_PER_MONTH;
      case 'year':
        return (Math.floor(t / TICKS_PER_YEAR) + 1) * TICKS_PER_YEAR;
      case 'untilEvent':
        return t + UNTIL_EVENT_MAX_TICKS;
    }
  }

  /** Tua tới đích, dừng sớm khi có mục nhật ký quan trọng hoặc khi chết. */
  advance(mode: AdvanceMode): AdvanceResult {
    if (!this.alive) throw new Error('đã chết');
    if (this.s.events.pending) throw new Error('đang có sự kiện chờ chọn');
    const target = this.targetOf(mode);
    const from = this.log.length;
    while (this.s.tick < target) {
      const before = this.log.length;
      const death = this.step();
      const entries = this.log.slice(from);
      if (death) return { status: 'died', entries };
      const pending = this.pendingEvent();
      if (pending) return { status: 'event', entries, pending };
      const major = this.log.slice(before).find((e) => e.importance === 'major' || e.key === 'log.plan.invalid');
      if (major) return { status: 'interrupted', entries, entry: major };
    }
    const entries = this.log.slice(from);
    return mode === 'untilEvent' ? { status: 'stuck', entries } : { status: 'done', entries };
  }

  /** Chạy tới khi chết (CLI, test). Gặp sự kiện thì chọn bằng `pick`; mặc định lựa chọn đầu tiên đang mở. */
  runToDeath(maxTicks = 200 * TICKS_PER_YEAR, pick: (p: PendingEvent) => string = firstOpenChoice): void {
    const end = this.s.tick + maxTicks;
    while (this.alive && this.s.tick < end) {
      this.step();
      const pending = this.pendingEvent();
      if (pending) {
        const refused = this.choose(pending.instance, pick(pending));
        if (refused) throw new Error(`runToDeath: ${refused}`);
      }
    }
  }

  private context(t: Tick) {
    return makeContext(this.s.character, this.s.events, this.s, this.s.economy, this.logic, t, this.s.npcs);
  }

  /** Sự kiện đang chờ chọn như người chơi thấy; null nếu không có. */
  pendingEvent(): PendingEvent | null {
    return pendingView(this.s.events, EVENTS, this.context(this.s.tick));
  }

  /** Lệnh CHOOSE (ADR 0014). Trả lý do từ chối, hoặc null khi đã áp hậu quả. */
  choose(instance: number, choice: string): string | null {
    if (!this.alive) return 'đã chết';
    return chooseEvent(this.s.events, EVENTS, this.context(this.s.tick), instance, choice, this.streams.get('events'), (e) => this.push({ tick: this.displayTick, ...e }));
  }

  summary(): LifeSummary {
    const d = this.s.death;
    if (!d) throw new Error('chưa chết');
    const c = this.s.character;
    return {
      config: this.s.config,
      name: c.name,
      birthTick: c.birthTick,
      deathTick: d.tick,
      ageYears: ageYearsAt(c.birthTick, d.tick),
      cause: d.cause,
      causeDetail: d.detail,
      birthplaceId: c.birthplaceId,
      milestones: this.log.filter((e) => e.importance === 'major'),
      estate: { money: c.household.money, grain: c.household.grain, landMu: c.household.landMu, tenure: c.household.tenure },
      hungerYears: c.household.hungerYears,
      digest: this.digest(),
    };
  }
}

/** Phần chia khi ở lại tới hẹn: hằng ở household.ts (dùng chung với NPC), xuất lại cho mã cũ. */
export { STAY_SHARE_PCT } from './household';

/** Lựa chọn đầu tiên đang mở; luôn có vì lựa chọn cuối là lối ra không điều kiện (ADR 0014). */
export const firstOpenChoice = (p: PendingEvent): string => p.choices.find((ch) => ch.locked === null)!.id;

function structuredCloneSnapshot(s: LifeSnapshot): LifeSnapshot {
  return JSON.parse(JSON.stringify(s)) as LifeSnapshot;
}

/** Môi trường một quận cho test/đời độc lập; SimHost luôn truyền logic vùng thật. */
function singleCounty(b: Pick<Birthplace, 'county' | 'kind'>): RegionLogic {
  const n = b.county + 1;
  return { kmPerCellMilli: 1000, counties: Array.from({ length: n }, (_, i) => ({ worldIndex: i, area: 1, seat: { x: i, y: 0 } })), settlementKind: Array.from({ length: n }, () => b.kind), adjacency: [], terrainPct: [], seatKm: Array.from({ length: n }, () => Array<number>(n).fill(0)), fertilityPct: Array<number>(n).fill(100) };
}
