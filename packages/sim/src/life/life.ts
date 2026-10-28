// Một đời người: vòng tick theo pha có nhịp (ADR 0002), tua, nhật ký, snapshot (ADR 0004).
import {
  GRAIN_PER_DOU, TICKS_PER_MONTH, TICKS_PER_YEAR, ageYearsAt, calendarOf, isMonthStart, isYearStart,
  type AdvanceMode, type Birthplace, type PlanSlot, type CharacterView, type LifeSummary, type LogEntry, type MarketView, type NpcView, type NewLifeConfig, type PendingEvent, type Tick, type MonthPlan, type SupplyBand,
} from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { digestOf } from '../core/digest';
import { hash32 } from '../core/hash';
import { idiv, mulDiv } from '../core/math';
import { RngStreams, type RngStreamsSnapshot } from '../core/rng';
import { createCharacter, toView, type CharacterState } from './character';
import { agingPhase, consequencesPhase, eventsPhase, type Death } from './health';
import { feedPhase, rationOf, stayAtHomeYear } from './household';
import { harvestPlayer } from '../economy/farming';
import { EVENTS } from '../events/catalog';
import { choose as chooseEvent, makeContext, newEventsState, pendingView, rollEvent, type EventsState } from '../events/engine';
import { headTax, HEAD_TAX, tradeGrain, yearlySpending } from '../economy/income';
import {
  buyPrice, countyMoney, createEconomy, economyMonth, epidemicAt, HARVEST_MONTH, marketView, supplyOf, worldYearStart, type EconomyState,
} from '../economy/market';
import { AGE_MILESTONES, UNTIL_EVENT_MAX_TICKS } from './params';
import { staminaMax } from './stamina';
import { decaySkills } from './skills';
import { ACTION_MIN_AGE, ACTIONS, actionDef, actionLock, actionOptions, validatePlan } from './actions';
import { playerPhase, type PlayerState, type SocialHooks } from './player';
import { fadeBonds, socialAct, socialLock, type SocialWorld } from '../social/actions';
import { previewTravel } from './travel';
import { npcPhase } from '../npc/phase';
import type { Inheritance } from '../npc/lifecycle';
import { seedPopulation } from '../npc/population';
import { newNpcWorld, npcMoney, npcView, peopleAt, type NpcState, type NpcWorldState } from '../npc/state';
import { assignPlayerParents, childrenOf, giversOf, kinHelp, kinRole, lookup, PLAYER_ID, seedFamilies } from '../npc/family';
import { bondOf, bondView, ensureBond, PARENT_CLOSENESS, PARENT_TRUST, type Bond } from '../social/bonds';
import { addReputation, fadeReputation, newReputation, repAt, reputationBand, spreadReputation } from '../social/reputation';

/** Việc xấu ngoài sự kiện, gắn tiếng ở quận nhà (v0.5 S6, Q9): thiếu thuế đinh, khất nợ vay. */
export const REP_TAX_SHORT = -5;
export const REP_LOAN_ROLLED = -5;
/** Tổng kết đời: bạn là người từ dải "bạn" (thân thiết 50), kẻ thù từ dải "kẻ thù" (thù hận 70) — như BondView. */
const FRIEND_CLOSENESS = 50;
const ENEMY_HOSTILITY = 70;

/** Hành động xã giao người chơi xếp được (v0.5 S4–S5), theo thứ tự bảng hành động. */
const SOCIAL_ACTIONS = ACTIONS.filter((d) => d.group === 'social' && !d.hidden).map((d) => d.id);

/** Thứ tự người thân trong danh sách người thân, người quen. */
const KIN_ORDER = ['father', 'mother', 'spouse', 'son', 'daughter', 'sibling'] as const;

/**
 * Đổi khi hình snapshot đổi, để save cũ bị từ chối rõ ràng (lỗi VERSION) thay vì lỗi schema. 0.3.1: hộ thêm nợ vay,
 * tai họa, lập thân (S6–S7) và bộ đếm năm đói (F5). 0.4.0: NPC trong snapshot, luồng `npc-world` (v0.4 Bước 0).
 */
export const SIM_VERSION = '0.5.0';
/**
 * `npc-world`: tạo dân số ban đầu và trẻ sinh mới (ADR 0016); mỗi NPC còn có luồng riêng trong NpcState.
 * `social`: hành động xã giao của người chơi (v0.5 S4, ADR 0017).
 */
export const STREAMS = ['accident', 'actions', 'character', 'economy', 'events', 'health', 'illness', 'names', 'npc-world', 'social', 'travel', 'weather'] as const;

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
  /** Người có tên quanh người chơi (ADR 0015, 0016). */
  npcs: NpcWorldState;
  /** Quan hệ của người chơi với từng người (v0.5, ADR 0017): kho thưa, sắp theo id. */
  bonds: Bond[];
  /** Phần thừa kế người chơi đã nhận, chờ báo tin tới đúng tuần người mất (v0.5 S3). */
  bequests: Inheritance[];
  /** Tiếng tăm của người chơi theo quận, −100..100 (v0.5 S6, Q9). */
  reputation: number[];
  /** Tin đồn từ quận kề, chờ tới tuần nghe được (trễ một tháng, v0.5 S6). */
  rumors: LogEntry[];
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
    seedFamilies(npcs, logic, streams.get('npc-world'), birthTick);
    // Cha mẹ thật (v0.5 Q2): một cặp ở quận sinh, cùng xuất thân; thân thiết, tin cậy sẵn
    const parents = assignPlayerParents(npcs, economy, logic, streams.get('npc-world'), birthTick, character);
    const bonds: Bond[] = [];
    for (const p of [parents.father, parents.mother]) Object.assign(ensureBond(bonds, p.id), { closeness: PARENT_CLOSENESS, trust: PARENT_TRUST });
    // Tuần sinh coi như đã qua: tick kế tiếp là tuần sau khi sinh
    const life = new Life({ simVersion: SIM_VERSION, config, tick: birthTick + 1, character, economy, events: newEventsState(), npcs, bonds, bequests: [], reputation: newReputation(logic.counties.length), rumors: [], rng: streams.snapshot(), death: null, plan: null, active: null, planWarned: false }, streams, [], logic);
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
    const c = this.s.character;
    // Tiếng tăm ở quận đang đứng (S6)
    const v = { ...toView(c, this.displayTick, buyPrice(this.s.economy.counties[c.location]!)), reputation: reputationBand(repAt(this.s.reputation, c.location)) };
    // Vợ/chồng còn sống (v0.5 S5)
    const sp = this.spouse();
    return sp && sp.death === null ? { ...v, spouse: sp.id } : v;
  }

  /** Vợ/chồng của người chơi (còn trong danh sách: còn sống, hoặc mất chưa quá một năm); null nếu chưa cưới. */
  private spouse(): NpcState | null {
    const id = this.s.character.kin.spouse;
    return id === null ? null : lookup(this.s.npcs).get(id) ?? null;
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

    // Tiếng tăm (S6): đầu năm phai, đầu tháng lan sang quận kề — trước việc làm mới của tuần này
    if (isYearStart(t)) fadeReputation(this.s.reputation);
    if (isMonthStart(t)) spreadReputation(this.s.reputation, this.logic);
    // 1 Thế giới: thời tiết (năm), chợ quận (tháng). 2 Thế lực: chưa có (v0.6). 3 NPC (ADR 0015): chưa có NPC tới S1
    this.worldPhase(t, log);
    const firstNew = this.s.npcs.nextId;
    // Người chơi trong luật gia đình (S5): nhận con như mọi cặp vợ chồng; là mẹ thì có thể sinh khó
    const family: { c: CharacterState; inherited: Inheritance[]; death: Death | null } = { c, inherited: this.s.bequests, death: null };
    npcPhase(this.s.npcs, this.s.economy, this.logic, t, c.location, { player: family });
    this.npcNews(t, firstNew, log);
    // Quan hệ phai dần mỗi năm (v0.5 S4)
    if (isYearStart(t)) fadeBonds(c, { npcs: this.s.npcs, bonds: this.s.bonds, rng: this.streams.get('social') });
    // Thừa kế (v0.5 S3): cha, mẹ, vợ/chồng mất thì người chơi nhận phần mình. Người ở tầng L1 tính cả tháng nên có thể
    // mất vào tuần sau: tin báo đúng tuần mất, sau tin người ấy mất (phần chia giữ trong snapshot tới lúc ấy)
    this.s.bequests = this.s.bequests.filter((x) => {
      if (x.tick > t) return true;
      log({ key: 'log.kin.inherit', params: { name: x.name, money: x.money, dou: idiv(x.grain, GRAIN_PER_DOU), grain: x.grain, land: x.landMu }, importance: 'major' });
      return false;
    });
    // Người thân giúp khi đói (Q6), cùng luật với NPC: đầu tháng, sau pha NPC
    if (isMonthStart(t)) {
      const got = kinHelp(c, giversOf(c, lookup(this.s.npcs), c.household.hunger > 0 ? childrenOf(this.s.npcs, PLAYER_ID) : []), rationOf(c, t));
      if (got > 0) log({ key: 'log.kin.help', params: { dou: idiv(got, GRAIN_PER_DOU) }, importance: 'major' });
    }
    // 4 Sự kiện (tuần): bệnh, tai nạn, rồi sự kiện có lựa chọn
    const here = this.s.economy.counties[c.location]!;
    const epidemic = epidemicAt(here, t) && !(c.household.shieldUntil > t);
    let death = family.death ?? eventsPhase(c, t, this.streams.get('illness'), this.streams.get('accident'), log, epidemic);
    if (!death) rollEvent(this.s.events, EVENTS, this.context(t), this.streams.get('events'));
    // 5 Người chơi: tuổi thơ hoặc ô kế hoạch tháng (ADR 0008).
    const action = death ? { death, carePct: 0 } : playerPhase(this.s, c, t, this.logic, this.s.economy, this.streams, log, this.s.npcs, this.socialHooks());
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
      const role = kinRole(c, n);
      // Con của mình chào đời (S5): tin quan trọng ở bất cứ quận nào
      if (newborn && (role === 'son' || role === 'daughter')) { log({ key: 'log.kin.birth', params: { role: `kin.${role}`, name: x.name }, importance: 'major' }); continue; }
      const known = dead && (role !== null || met.includes(n.id));
      // Người quen (có quan hệ) mất ở nơi khác: tin đồn tới sau một tháng (S6)
      if (dead && !known && x.location !== c.location && x.home !== c.home && bondOf(this.s.bonds, n.id)) {
        this.s.rumors.push({ tick: t + TICKS_PER_MONTH, key: 'log.rumor.death', params: { name: x.name, age: ageYearsAt(x.birthTick, t), cause: `death.${n.death!.cause}` }, importance: 'minor' });
        continue;
      }
      if (!known && x.location !== c.location && x.home !== c.home) continue;
      // Người thân mất: tin quan trọng, ghi vai (v0.5); vợ/chồng ghi theo giới (S5)
      const label = role === 'spouse' ? (x.gender === 'male' ? 'kin.husband' : 'kin.wife') : `kin.${role}`;
      if (dead && role) log({ key: 'log.kin.death', params: { role: label, name: x.name, age: ageYearsAt(x.birthTick, t), cause: `death.${n.death!.cause}` }, importance: 'major' });
      else if (dead) log({ key: 'log.npc.death', params: { name: x.name, age: ageYearsAt(x.birthTick, t), cause: `death.${n.death!.cause}` }, importance: known ? 'major' : 'minor' });
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
      if (c.household.taxDebt > debtBefore) {
        log({ key: 'log.tax.short', params: { paid, owed: c.household.taxDebt }, importance: 'major' });
        addReputation(this.s.reputation, c.home, REP_TAX_SHORT);
      }
      else if (paid > 0) log({ key: 'log.tax.paid', params: { paid: HEAD_TAX }, importance: 'minor' });
      const spent = yearlySpending(c, eco.counties[c.location]!);
      if (spent > 0) log({ key: 'log.spend', params: { coin: spent }, importance: 'minor' });
    }
    if (!isMonthStart(t)) return;
    const here = eco.counties[c.location]!;
    const before = supplyOf(here);
    const supplyBefore = eco.counties.map(supplyOf);
    economyMonth(eco, this.logic, t);
    this.rumorsMonth(t, supplyBefore, log);
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
      addReputation(this.s.reputation, this.s.character.home, REP_LOAN_ROLLED);
      log({ key: 'log.loan.rolled', params: { owed: h.loan }, importance: 'major' });
    }
  }

  /**
   * Tin đồn (v0.5 S6, Q9): đầu tháng, tin đã tới hạn thì nghe được; rồi ghi tin mới từ quận kề quận đang đứng (đói kém
   * mới bắt đầu, tai họa, dịch) để nghe sau một tháng. Tin đồn là tin thường, không ngắt tua.
   */
  private rumorsMonth(t: Tick, supplyBefore: readonly SupplyBand[], log: (e: Omit<LogEntry, 'tick'>) => void): void {
    this.s.rumors = this.s.rumors.filter((r) => {
      if (r.tick > t) return true;
      log({ key: r.key, params: r.params, importance: r.importance });
      return false;
    });
    const eco = this.s.economy, here = this.s.character.location, month = calendarOf(t).month;
    const later = (key: string, county: number) => this.s.rumors.push({ tick: t + TICKS_PER_MONTH, key, params: { county: this.logic.counties[county]!.name ?? 'place.unknown' }, importance: 'minor' });
    for (const [a, b] of this.logic.adjacency) {
      if (a !== here && b !== here) continue;
      const k = a === here ? b : a, ce = eco.counties[k]!;
      if (supplyOf(ce) === 'famine' && supplyBefore[k] !== 'famine') later('log.rumor.famine', k);
      if (ce.disaster && ce.disasterMonth === month) later(`log.rumor.${ce.disaster}`, k);
      if (ce.epidemicFrom === t) later('log.rumor.epidemic', k);
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

  /**
   * Người thân và người có quan hệ ở mọi quận (v0.5, ADR 0017, 0018), còn sống: người thân trước theo vai (cha, mẹ,
   * vợ/chồng, anh chị em), rồi người có quan hệ, theo id.
   */
  circle(): NpcView[] {
    const c = this.s.character;
    const rows = this.s.npcs.people.flatMap((n) => {
      if (n.death) return [];
      const role = kinRole(c, n);
      return role !== null || bondOf(this.s.bonds, n.id) ? [{ n, rank: role === null ? KIN_ORDER.length : KIN_ORDER.indexOf(role) }] : [];
    });
    rows.sort((a, b) => a.rank - b.rank || Number(a.n.id.slice(1)) - Number(b.n.id.slice(1)));
    return rows.map((r) => this.viewOf(r.n));
  }

  /**
   * Người có tên ở quận đang đứng (ADR 0016, Q8), sắp theo id; kèm vai, quan hệ với người chơi (v0.5), và khóa của từng
   * hành động xã giao nhắm vào người ấy (F2: bảng chọn người).
   */
  people(): NpcView[] {
    return peopleAt(this.s.npcs, this.s.character.location).map((n) => ({
      ...this.viewOf(n), social: SOCIAL_ACTIONS.map((action) => ({ action, locked: this.socialLock({ action, person: n.id }) })),
    }));
  }

  /**
   * Khóa của một ô xã giao lúc này, như khi ô ấy chạy (v0.5 S8): khóa chung của hành động (tuổi, sức, tiền quà) rồi khóa
   * theo người được nhắm tới; null là làm được. Cho người chơi máy `family` và bảng chọn người (F2). Không rút RNG.
   */
  socialLock(slot: PlanSlot): string | null {
    const c = this.s.character, d = actionDef(slot.action);
    if (!d || d.group !== 'social' || slot.person === undefined) return 'lock.action';
    return actionLock(d, c, this.s.tick, this.logic.settlementKind[c.location]!, this.s.economy.counties[c.location]!) ?? this.socialHooks().lock(slot, c);
  }

  /** Xã giao của người chơi (v0.5 S4): khóa theo người được nhắm tới, tác dụng lên kho quan hệ. */
  private socialHooks(): SocialHooks {
    const w: SocialWorld = { npcs: this.s.npcs, bonds: this.s.bonds, rng: this.streams.get('social'), tick: this.s.tick, logic: this.logic, reputation: this.s.reputation };
    return { lock: (slot, c) => socialLock(slot, c, w), act: (slot, c, log) => socialAct(slot, c, w, log) };
  }

  private viewOf(n: NpcState): NpcView {
    const v = npcView(n, this.s.tick);
    const role = kinRole(this.s.character, n), bond = bondOf(this.s.bonds, n.id);
    return { ...v, ...(role ? { kin: role } : {}), ...(bond ? { bond: bondView(bond) } : {}) };
  }

  private isKin(id: string): boolean {
    const n = lookup(this.s.npcs).get(id);
    return !!n && kinRole(this.s.character, n) !== null;
  }

  /**
   * Vợ/chồng và con của người chơi cho tổng kết đời (S5). Người mất quá một năm đã bị dọn khỏi danh sách nên không còn
   * tên ở đây.
   */
  private family(): Pick<LifeSummary['legacy'], 'spouse' | 'children'> {
    const sp = this.spouse();
    const kids = this.s.npcs.people.filter((n) => n.character.kin.father === PLAYER_ID || n.character.kin.mother === PLAYER_ID);
    return { spouse: sp ? { name: sp.character.name, alive: sp.death === null } : null, children: kids.map((n) => ({ name: n.character.name, alive: n.death === null })) };
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
    return makeContext(this.s.character, this.s.events, this.s, this.s.economy, this.logic, t, this.s.npcs, this.s.bonds, this.s.reputation);
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
      // Di sản quan hệ (ADR 0017, 0018): vợ/chồng, con (S5); bạn (từ "bạn" trở lên, không kể người thân), kẻ thù, tiếng
      // tăm ở quê nhà (S6)
      legacy: {
        ...this.family(),
        friends: this.s.bonds.filter((b) => b.closeness >= FRIEND_CLOSENESS && !this.isKin(b.id)).length,
        enemies: this.s.bonds.filter((b) => b.hostility >= ENEMY_HOSTILITY).length,
        reputation: reputationBand(repAt(this.s.reputation, c.home)),
      },
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
