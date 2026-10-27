// Một đời người: vòng tick theo pha có nhịp (ADR 0002), tua, nhật ký, snapshot (ADR 0004).
import {
  TICKS_PER_MONTH, TICKS_PER_YEAR, ageYearsAt, calendarOf, isMonthStart, isYearStart,
  type AdvanceMode, type Birthplace, type CharacterView, type LifeSummary, type LogEntry, type MarketView, type NewLifeConfig, type Tick, type MonthPlan, type SupplyBand,
} from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { digestOf } from '../core/digest';
import { hash32 } from '../core/hash';
import { RngStreams, type RngStreamsSnapshot } from '../core/rng';
import { createCharacter, toView, type CharacterState } from './character';
import { agingPhase, consequencesPhase, eventsPhase, type Death } from './health';
import { feedPhase } from './household';
import {
  buyGrain, buyPrice, countyMoney, createEconomy, economyMonth, HARVEST_MONTH, marketView, rollWeather, supplyOf, type EconomyState,
} from '../economy/market';
import { AGE_MILESTONES, UNTIL_EVENT_MAX_TICKS } from './params';
import { staminaMax } from './stamina';
import { decaySkills } from './skills';
import { ACTION_MIN_AGE, actionOptions, validatePlan } from './actions';
import { playerPhase, type PlayerState } from './player';
import { previewTravel } from './travel';

export const SIM_VERSION = '0.3.0';
export const STREAMS = ['accident', 'actions', 'character', 'economy', 'events', 'health', 'illness', 'names', 'travel', 'weather'] as const;

export interface LifeSnapshot extends PlayerState {
  simVersion: string;
  config: NewLifeConfig;
  /** Tick kế tiếp sẽ chạy. */
  tick: Tick;
  character: CharacterState;
  /** Chợ các quận của vùng (ADR 0012); thế giới chạy cùng đời người chơi. */
  economy: EconomyState;
  rng: RngStreamsSnapshot;
  death: Death | null;
}

export type AdvanceResult =
  | { status: 'done'; entries: LogEntry[] }
  | { status: 'interrupted'; entries: LogEntry[]; entry: LogEntry }
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
    // Tuần sinh coi như đã qua: tick kế tiếp là tuần sau khi sinh
    const life = new Life({ simVersion: SIM_VERSION, config, tick: birthTick + 1, character, economy: createEconomy(logic, birthTick), rng: streams.snapshot(), death: null, plan: null, active: null, planWarned: false }, streams, [], logic);
    life.push({ tick: birthTick, key: 'log.birth', params: { birthplace: birthplace.name, background: `background.${character.background}` }, importance: 'major' });
    return life;
  }

  static restore(snap: LifeSnapshot, log: LogEntry[], logic: RegionLogic = singleCounty({ county: snap.character.home, kind: snap.character.birthplaceKind })): Life {
    const s = structuredCloneSnapshot(snap);
    return new Life(s, RngStreams.restore(s.rng), [...log], logic);
  }

  get plan(): MonthPlan | null { return this.s.plan ? { slots: this.s.plan.slots.map((p) => ({ ...p })) as MonthPlan['slots'] } : null; }
  get active(): PlayerState['active'] { return this.s.active ? JSON.parse(JSON.stringify(this.s.active)) as PlayerState['active'] : null; }
  actions() { return actionOptions(this.s.character, this.displayTick, this.logic); }
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

    // 1 Thế giới: thời tiết (năm), chợ quận (tháng). 2 Thế lực, 3 NPC: chưa có
    this.worldPhase(t, log);
    // 4 Sự kiện (tuần)
    let death = eventsPhase(c, t, this.streams.get('illness'), this.streams.get('accident'), log);
    // 5 Người chơi: tuổi thơ hoặc ô kế hoạch tháng (ADR 0008).
    const action = death ? { death, carePct: 0 } : playerPhase(this.s, c, t, this.logic, this.streams, log);
    death = action.death;
    // 6 Hậu quả: ăn (tuần), lão hóa (năm), diễn tiến (tuần), tử vong (cuối pha)
    if (!death) {
      const market = this.s.economy.counties[c.location]!;
      feedPhase(c, t, this.homeSupply(), this.streams.get('economy'), log, (need) => buyGrain(market, c.household, need));
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
      this.s.death = death;
      // Chết vì bệnh mà đang đói: vẫn là bệnh, kể thêm hoàn cảnh (ADR 0013)
      const key = death.cause === 'illness' && c.household.hunger > 0 ? 'log.death.hungry' : 'log.death';
      log({ key, params: { cause: `death.${death.cause}`, detail: death.detail, age: ageYearsAt(c.birthTick, t) }, importance: 'major' });
    }
    for (const e of entries) this.push(e);
    this.s.tick = t + 1;
    return death;
  }

  /** Tình hình lương thực của quận nhà, nơi hộ cha mẹ sống (ADR 0013). */
  private homeSupply(): SupplyBand {
    return supplyOf(this.s.economy.counties[this.s.character.home]!);
  }

  /** Pha Thế giới. Tin tức chỉ về quận đang đứng: người chơi không biết chuyện nơi khác. */
  private worldPhase(t: Tick, log: (e: Omit<LogEntry, 'tick'>) => void): void {
    const eco = this.s.economy;
    if (isYearStart(t)) rollWeather(eco, this.streams.get('weather'));
    if (!isMonthStart(t)) return;
    const c = this.s.character;
    const here = eco.counties[c.location]!;
    const before = supplyOf(here);
    economyMonth(eco, this.logic, t);
    const county = this.logic.counties[c.location]!.name ?? 'place.unknown';
    if (calendarOf(t).month === HARVEST_MONTH) {
      // Mất mùa báo trước cơn đói: ngắt tua với người tự nuôi mình
      if (here.weatherPct <= 80) log({ key: 'log.world.harvest_bad', params: { county }, importance: c.household.independent ? 'major' : 'minor' });
      else if (here.weatherPct >= 110) log({ key: 'log.world.harvest_good', params: { county }, importance: 'minor' });
    }
    const after = supplyOf(here);
    if (after === 'famine' && before !== 'famine') log({ key: 'log.world.famine', params: { county }, importance: 'major' });
    else if (before === 'famine' && after !== 'famine') log({ key: 'log.world.famine_end', params: { county }, importance: 'minor' });
  }

  /** Chợ quận đang đứng. */
  market(): MarketView {
    return marketView(this.s.economy, this.s.character.location);
  }

  /** Sổ cái: tổng tiền của vùng (quỹ quận + túi người chơi), không đổi qua mọi tick (ADR 0012). */
  totalMoney(): number {
    return countyMoney(this.s.economy) + this.s.character.household.money;
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
    const target = this.targetOf(mode);
    const from = this.log.length;
    while (this.s.tick < target) {
      const before = this.log.length;
      const death = this.step();
      const entries = this.log.slice(from);
      if (death) return { status: 'died', entries };
      const major = this.log.slice(before).find((e) => e.importance === 'major' || e.key === 'log.plan.invalid');
      if (major) return { status: 'interrupted', entries, entry: major };
    }
    const entries = this.log.slice(from);
    return mode === 'untilEvent' ? { status: 'stuck', entries } : { status: 'done', entries };
  }

  /** Chạy tới khi chết (CLI, batch). */
  runToDeath(maxTicks = 200 * TICKS_PER_YEAR): void {
    const end = this.s.tick + maxTicks;
    while (this.alive && this.s.tick < end) this.step();
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
      digest: this.digest(),
    };
  }
}

function structuredCloneSnapshot(s: LifeSnapshot): LifeSnapshot {
  return JSON.parse(JSON.stringify(s)) as LifeSnapshot;
}

/** Môi trường một quận cho test/đời độc lập; SimHost luôn truyền logic vùng thật. */
function singleCounty(b: Pick<Birthplace, 'county' | 'kind'>): RegionLogic {
  const n = b.county + 1;
  return { kmPerCellMilli: 1000, counties: Array.from({ length: n }, (_, i) => ({ worldIndex: i, area: 1, seat: { x: i, y: 0 } })), settlementKind: Array.from({ length: n }, () => b.kind), adjacency: [], terrainPct: [], seatKm: Array.from({ length: n }, () => Array<number>(n).fill(0)), fertilityPct: Array<number>(n).fill(100) };
}
