// Vòng đời dân số NPC (ADR 0016, v0.4 S4): sinh để giữ hạn mức, dọn người đã mất, lập thân lúc 16 tuổi, nghề đổi theo
// kỹ năng (thầy đồ, thầy thuốc, thương nhân nảy từ mô phỏng). Thuần, tất định.
import { ageYearsAt, birthplaceId, TICKS_PER_YEAR, type SettlementKind, type Tick } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { hash32 } from '../core/hash';
import { Rng } from '../core/rng';
import { payBridePrice, TRADE_MIN_CAPITAL } from '../economy/income';
import { buyPrice, type EconomyState } from '../economy/market';
import { createCharacter, type CharacterState } from '../life/character';
import { agingPhase } from '../life/health';
import { becomeIndependent, COMING_OF_AGE, RATION_CHILD, rationOf, type HouseholdState } from '../life/household';
import { staminaMax } from '../life/stamina';
import { nearestTownFrom } from '../life/travel';
import { NPC_QUOTA, PHYSICIAN_PERSONALITIES } from './population';
import { allocateNpc, type NpcState, type NpcWorldState, type Occupation } from './state';
import { adopt, byIdOf, childrenOf, couplesFor, fitsAge, pickCouple, PLAYER_ID, single, wed } from './family';
import type { Death } from '../life/health';

/** Người đã mất ở lại trong danh sách chừng ấy tick (đám ma, tin tức) rồi bị dọn khỏi snapshot. */
export const DEAD_KEEP_TICKS = TICKS_PER_YEAR;
/** Sinh nền mỗi năm = hạn mức / tuổi thọ trung bình; cộng một phần ba chỗ thiếu; không vượt 130% hạn mức (ADR 0016). */
export const BIRTH_LIFESPAN_YEARS = 35;
export const BIRTH_DEFICIT_DIV = 3;
export const POPULATION_CAP_PCT = 130;
/** Lập thân: nhà bần cùng ở lại tới 20 với xác suất này (‰); người có chí lớn, khéo xoay xở ở làng lên trấn (‰). */
export const STAY_PERMILLE_DESTITUTE = 500;
export const LEAVE_TOWN_PERMILLE = 300;
export const STAY_UNTIL = 20;
const LEAVE_TOWN_PERSONALITIES: readonly string[] = ['ambitious', 'cunning'];
/** Ngưỡng kỹ năng đổi nghề: "Thạo" 1.000, "Giỏi" 4.000 (skills.ts). */
const XP_PRACTICED = 1_000;
const XP_SKILLED = 4_000;
const PHYSICIAN_MIN_AGE = 30;
/** Thương nhân tối đa một phần năm hạn mức của trấn, thành. */
const MERCHANT_SHARE_DIV = 5;

const alive = (n: NpcState) => n.death === null;

/**
 * Đầu năm: dọn người đã mất quá một năm, hôn nhân (S2 v0.5), sinh trẻ cho từng quận, xét lại nghề người lớn. Gọi
 * trước pha tuần của NPC.
 */
export function npcYearStart(world: NpcWorldState, eco: EconomyState, logic: RegionLogic, t: Tick, playerCounty: number | null, ctx: DeathContext | null = null): number {
  const regionId = world.regionId;
  world.people = world.people.filter((n) => alive(n) || n.death!.tick >= t - DEAD_KEEP_TICKS);
  marryYear(world, logic, t);
  let born = 0;
  logic.settlementKind.forEach((kind, county) => { born += birthsIn(world, eco, logic, regionId, county, kind, t, playerCounty, ctx); });
  for (const n of world.people) if (alive(n)) refreshOccupation(n, world, logic, t);
  return born;
}

/**
 * Mất (thừa kế: v0.5 S3, Q5): tiền, lương, ruộng về vợ/chồng còn sống; không có thì chia đều cho các con còn sống
 * (người chơi cũng là con, nếu người mất là cha hoặc mẹ); không có ai thì tiền, lương về quỹ, kho quận nhà như v0.4,
 * ruộng về dân nền. Sổ cái chỉ chuyển giữa các túi. `ctx` null: không xét người thừa kế (công cụ, test cũ).
 */
export function die(n: NpcState, death: Death, eco: EconomyState, ctx: DeathContext | null = null): void {
  const c = n.character, h = c.household, home = eco.counties[c.home]!;
  c.alive = false;
  c.conditions = [];
  // Chết già đúng tuần sức khỏe cạn thì consequencesPhase trả về trước khi chặn dưới 0: người mất vẫn phải qua schema save
  c.health = Math.max(0, c.health);
  n.death = death;
  n.plan = null; n.active = null;
  const heirs = ctx ? heirsOf(n, ctx) : [];
  if (heirs.length) {
    const got = bequeath(h, heirs.map((x) => x.household));
    heirs.forEach((x, i) => { if (x.isPlayer && (got[i]!.money > 0 || got[i]!.grain > 0 || got[i]!.landMu > 0)) ctx!.player!.inherited.push({ from: n.id, name: c.name, tick: death.tick, ...got[i]! }); });
  } else {
    home.money += h.money; home.grain += h.grain;
  }
  h.money = 0; h.grain = 0; h.landMu = 0;
}

/** Người thừa kế mà người chơi nhận được (để ghi tin `log.kin.inherit`). */
export interface Inheritance { from: string; name: string; tick: number; money: number; grain: number; landMu: number }
/**
 * Người chơi trong thế giới NPC lúc có người mất, người sinh: để chia của cho người chơi khi người mất là cha, mẹ,
 * vợ/chồng; để người chơi đã có vợ/chồng nhận con như mọi cặp (v0.5 S5). `death`: người chơi là mẹ mà sinh khó.
 */
export interface DeathContext {
  world: NpcWorldState;
  player: { c: CharacterState; inherited: Inheritance[]; death?: Death | null } | null;
  /** Người chơi trong dáng người có tên (`playerStandIn`); null khi thế giới tự chạy. */
  me?: NpcState | null;
}

interface Heir { household: HouseholdState; birthTick: number; id: string; isPlayer: boolean }

/** Người thừa kế theo thứ tự: vợ/chồng còn sống; không có thì các con còn sống, người lớn tuổi trước (cùng tuổi theo id). */
function heirsOf(n: NpcState, ctx: DeathContext): Heir[] {
  const player = ctx.player?.c ?? null;
  const k = n.character.kin;
  if (k.spouse !== null) {
    const s = ctx.world.people.find((x) => x.id === k.spouse && x.death === null);
    if (s) return [{ household: s.character.household, birthTick: s.character.birthTick, id: s.id, isPlayer: false }];
  }
  if (player && player.alive && player.kin.spouse === n.id) return [{ household: player.household, birthTick: player.birthTick, id: '', isPlayer: true }];
  const heirs: Heir[] = ctx.world.people
    .filter((x) => x.death === null && (x.character.kin.father === n.id || x.character.kin.mother === n.id))
    .map((x) => ({ household: x.character.household, birthTick: x.character.birthTick, id: x.id, isPlayer: false }));
  if (player && player.alive && (player.kin.father === n.id || player.kin.mother === n.id)) heirs.push({ household: player.household, birthTick: player.birthTick, id: '', isPlayer: true });
  return heirs.sort((a, b) => a.birthTick - b.birthTick || Number(a.id.slice(1)) - Number(b.id.slice(1)));
}

/**
 * Chia tiền, lương, ruộng cho người thừa kế: chia đều, phần lẻ cho người đầu (con cả). Người nhận ruộng mà chưa có ruộng
 * (tá điền, chưa có gì) thành tự canh; người chưa ra riêng giữ ruộng tới lúc lập thân. Trả phần mỗi người nhận.
 */
export function bequeath(from: HouseholdState, to: readonly HouseholdState[]): { money: number; grain: number; landMu: number }[] {
  const k = to.length;
  const part = (total: number, i: number) => Math.floor(total / k) + (i === 0 ? total % k : 0);
  return to.map((h, i) => {
    const got = { money: part(from.money, i), grain: part(from.grain, i), landMu: part(from.landMu, i) };
    h.money += got.money; h.grain += got.grain; h.landMu += got.landMu;
    if (got.landMu > 0 && h.independent && (h.tenure === 'none' || h.tenure === 'tenant')) h.tenure = 'owner';
    return got;
  });
}

/** Hôn nhân mỗi năm (Q3): người chưa có vợ/chồng 18–35 tuổi; xác suất (‰) theo tuổi người nữ. */
export const MARRY_AGE: readonly [number, number] = [18, 35];
export const MARRY_PERMILLE: readonly (readonly [number, number])[] = [[26, 450], [36, 250]];
/** Rủi ro sinh khó cho người mẹ mỗi lần sinh (ppm, Q4). */
export const CHILDBIRTH_DEATH_PPM = 10_000;

/**
 * Ghép đôi đầu năm, chỉ một nam với một nữ (Q3): duyệt người nữ theo id, rút xác suất theo tuổi, chọn người nam hợp
 * tuổi trong quận, không có thì ở quận kề. RNG riêng theo (đời, năm) nên không phụ thuộc thứ tự quận. Người ít ruộng
 * hơn chuyển về quận người kia (bằng nhau thì người trẻ hơn), mang theo con dưới 16.
 */
function marryYear(world: NpcWorldState, logic: RegionLogic, t: Tick): void {
  const r = Rng.fromSeed(hash32(world.root, 'marry', t));
  const byId = byIdOf(world);
  const inAge = (n: NpcState) => { const a = ageYearsAt(n.character.birthTick, t); return a >= MARRY_AGE[0] && a <= MARRY_AGE[1]; };
  const free = (n: NpcState, g: string) => alive(n) && n.character.gender === g && n.character.household.independent && inAge(n) && single(n, byId);
  const men = world.people.filter((n) => free(n, 'male'));
  for (const w of world.people) {
    if (!free(w, 'female')) continue;
    const age = ageYearsAt(w.character.birthTick, t);
    if (r.int(0, 999) >= MARRY_PERMILLE.find(([upTo]) => age < upTo)![1]) continue;
    const home = w.character.home;
    const ok = (m: NpcState) => single(m, byId) && fitsAge(w, m, t);
    let pool = men.filter((m) => m.character.home === home && ok(m));
    if (!pool.length) pool = men.filter((m) => logic.adjacency.some(([a, b]) => (a === home && b === m.character.home) || (b === home && a === m.character.home)) && ok(m));
    // Quận kề: chỉ ghép khi ít nhất một bên chuyển tới được (quận kia chưa đầy)
    if (pool.length && pool[0]!.character.home !== home) pool = pool.filter((m) => !full(world, logic, m.character.home, household(world, w)) || !full(world, logic, home, household(world, m)));
    if (!pool.length) continue;
    const m = pool[r.int(0, pool.length - 1)]!;
    wed(w, m);
    payBridePrice(m.character, w.character);
    if (m.character.home !== home) {
      const wl = w.character.household.landMu, ml = m.character.household.landMu;
      let mover = wl < ml || (wl === ml && w.character.birthTick > m.character.birthTick) ? w : m;
      // Không chuyển vào quận đã đầy (trần dân số như khi sinh); khi ấy người kia chuyển
      if (full(world, logic, mover === w ? m.character.home : home, household(world, mover))) mover = mover === w ? m : w;
      moveTo(world, mover, mover === w ? m.character.home : home, logic);
    }
  }
}

/**
 * Người chơi cưới một NPC (v0.5 S5, ADR 0018 Q8): cùng luật như hôn nhân NPC — nhà trai đưa sính lễ sang túi người vợ;
 * hai người khác quận nhà thì người ít ruộng hơn chuyển về quận người kia (bằng nhau thì người trẻ hơn), mang theo con
 * còn ở nhà; NPC không chuyển vào quận đã đầy, khi ấy người chơi chuyển. Người chơi chuyển thì đổi quận nhà, vẫn đứng
 * ở nơi đang đứng (tự đi về). Trả sính lễ đã đưa và ai chuyển.
 */
export function wedPlayer(world: NpcWorldState, me: NpcState, n: NpcState, logic: RegionLogic): { bridePrice: number; mover: 'player' | 'spouse' | null } {
  wed(me, n);
  const [groom, bride] = me.character.gender === 'male' ? [me, n] : [n, me];
  const bridePrice = payBridePrice(groom.character, bride.character);
  const ph = me.character.home, nh = n.character.home;
  if (ph === nh) return { bridePrice, mover: null };
  const pl = me.character.household.landMu, nl = n.character.household.landMu;
  let mover = pl < nl || (pl === nl && me.character.birthTick > n.character.birthTick) ? me : n;
  if (mover === n && full(world, logic, ph, household(world, n))) mover = me;
  moveTo(world, mover, mover === me ? nh : ph, logic);
  return { bridePrice, mover: mover === me ? 'player' : 'spouse' };
}

/** Quận đã chạm trần dân số (130% hạn mức, như khi sinh). */
function full(world: NpcWorldState, logic: RegionLogic, county: number, incoming = 1): boolean {
  const n = world.people.reduce((s, x) => s + (x.death === null && x.character.home === county ? 1 : 0), 0);
  return n + incoming > Math.floor((NPC_QUOTA[logic.settlementKind[county]!] * POPULATION_CAP_PCT) / 100);
}

/** Người chuyển nhà khi cưới đi kèm bao nhiêu người (mình và con còn ở nhà). */
const household = (world: NpcWorldState, n: NpcState) => 1 + childrenOf(world, n.id).filter((k) => !k.character.household.independent).length;

/** Nhà còn đủ ăn bấy nhiêu tuần cho cả nhà sau khi thêm một miệng ăn thì mới nhận trẻ sinh (S2 v0.5). */
export const BIRTH_AFFORD_WEEKS = 26;
function canAfford(world: NpcWorldState, w: NpcState, h: NpcState, t: Tick, price: number): boolean {
  const kids = world.people.filter((k) => k.death === null && !k.character.household.independent && (k.character.kin.mother === w.id || k.character.kin.father === h.id));
  const need = rationOf(w.character, t) + rationOf(h.character, t) + RATION_CHILD + kids.reduce((s, k) => s + rationOf(k.character, t), 0);
  const hw = w.character.household, hh = h.character.household;
  const food = hw.grain + hh.grain + Math.floor(((hw.money + hh.money) * 10) / price);
  return food >= need * BIRTH_AFFORD_WEEKS;
}

/**
 * Chuyển về quận của vợ/chồng, mang theo con còn ở nhà (chưa ra riêng); người lớn làm lại nghề theo nơi mới (nghề đặc
 * biệt xét lại đầu năm). Tầng L0/L1 xếp lại ngay sau đó, ở đầu tháng.
 */
function moveTo(world: NpcWorldState, n: NpcState, county: number, logic: RegionLogic): void {
  for (const x of [n, ...childrenOf(world, n.id).filter((k) => !k.character.household.independent)]) {
    x.character.home = county;
    // Người chơi tự đi đường về nhà mới (S5); NPC và con nhỏ dọn về ngay
    if (x.id === PLAYER_ID) continue;
    x.character.location = county;
    x.plan = null;
    if (x.occupation !== 'child') x.occupation = baseOccupation(x.character, logic);
  }
}

/** Số trẻ sinh năm nay ở một quận: nền + bù thiếu, rút theo RNG riêng của (đời, năm, quận) — không phụ thuộc thứ tự. */
function birthsIn(world: NpcWorldState, eco: EconomyState, logic: RegionLogic, regionId: string, county: number, kind: SettlementKind, t: Tick, playerCounty: number | null, ctx: DeathContext | null): number {
  const quota = NPC_QUOTA[kind];
  const living = world.people.reduce((s, n) => s + (alive(n) && n.character.home === county ? 1 : 0), 0);
  const cap = Math.floor((quota * POPULATION_CAP_PCT) / 100);
  const expectMilli = Math.floor((quota * 1000) / BIRTH_LIFESPAN_YEARS) + Math.floor((Math.max(0, quota - living) * 1000) / BIRTH_DEFICIT_DIV);
  const r = Rng.fromSeed(hash32(world.root, 'birth', t, county));
  const births = Math.min(Math.max(0, cap - living), Math.floor(expectMilli / 1000) + (r.int(0, 999) < expectMilli % 1000 ? 1 : 0));
  for (let k = 0; k < births; k++) {
    const { id, rng: state } = allocateNpc(world, world.root);
    const own = Rng.fromState(state);
    const birthTick = t - r.int(0, TICKS_PER_YEAR - 1);
    // Cha mẹ thật (S2 v0.5, Q4): một cặp vợ chồng trong quận, người mẹ 18–42 tuổi, không sinh trong vòng một năm trước đó
    const byId = byIdOf(world);
    const price = Math.max(1, buyPrice(eco.counties[county]!));
    const couples = couplesFor(world, byId, county, birthTick, ctx?.me ?? null).filter(([w, h]) => !world.people.some((k) => k.character.kin.mother === w.id && Math.abs(k.character.birthTick - birthTick) < TICKS_PER_YEAR)
      && canAfford(world, w, h, t, price));
    const pair = pickCouple(world, couples, r);
    const place = { birthTick, birthplaceId: birthplaceId(`${regionId}/c${logic.counties[county]!.worldIndex}`), birthplaceKind: kind, county };
    const c = createCharacter(pair ? { ...place, background: pair[1].character.background } : place, own, own);
    agingPhase(c, t);
    c.health = c.healthMax;
    c.stamina = staminaMax(c, t);
    world.people.push({ id, character: c, occupation: 'child', tier: county === playerCounty ? 'L0' : 'L1', rng: own.state(), death: null, plan: null, active: null, planWarned: false });
    if (pair) {
      adopt(c, pair[1], pair[0]);
      if (r.chance(CHILDBIRTH_DEATH_PPM)) {
        const death: Death = { tick: t, cause: 'illness', detail: 'illness.childbirth' };
        // Người chơi là mẹ: cái chết đi qua vòng tick của đời (Life), không qua `die` của NPC
        if (pair[0].id === PLAYER_ID) { if (ctx?.player) ctx.player.death = death; } else die(pair[0], death, eco, ctx);
      }
    }
  }
  return births;
}

/**
 * Lập thân của NPC, cùng ba ngả với người chơi (sự kiện "Lập thân", ADR 0013): ở lại làm cho nhà tới 20 tuổi, lên trấn
 * không lấy ruộng, hay ra riêng với phần chia. Gọi đầu tháng khi đủ 16 tuổi mà chưa ra riêng, chưa hẹn ở lại.
 */
export function comeOfAge(n: NpcState, eco: EconomyState, logic: RegionLogic, t: Tick, r: Rng): void {
  const c = n.character, h = c.household;
  if (h.independent || h.stayUntil !== 0 || ageYearsAt(c.birthTick, t) < COMING_OF_AGE) return;
  const home = eco.counties[c.home]!;
  if (c.background === 'destitute' && r.int(0, 999) < STAY_PERMILLE_DESTITUTE) { h.stayUntil = STAY_UNTIL; return; }
  const town = logic.settlementKind[c.location] === 'village' ? nearestTownFrom(logic, c.location) : null;
  if (town !== null && LEAVE_TOWN_PERSONALITIES.includes(c.personality) && r.int(0, 999) < LEAVE_TOWN_PERMILLE) {
    becomeIndependent(c, home, { landless: true });
    c.location = town;
  } else becomeIndependent(c, home);
  n.occupation = baseOccupation(c, logic);
  n.plan = null;
}

/** Nghề lúc mới tự lo: theo nơi đang ở và kỹ năng đã có từ nhỏ. */
export function baseOccupation(c: CharacterState, logic: RegionLogic): Occupation {
  if (logic.settlementKind[c.location] === 'village') return c.skillXp.hunting >= XP_PRACTICED ? 'hunter' : 'farmer';
  return 'laborer';
}

/**
 * Nghề đổi theo kỹ năng đã luyện (ADR 0016: nghề đặc biệt nảy từ mô phỏng, không đặt cố định). Chỉ người làm thuê ở
 * trấn, thành đổi nghề; thầy thuốc tối đa một người mỗi quận, thương nhân tối đa một phần năm hạn mức.
 */
function refreshOccupation(n: NpcState, world: NpcWorldState, logic: RegionLogic, t: Tick): void {
  const c = n.character;
  if (n.occupation === 'child' && c.household.independent) n.occupation = baseOccupation(c, logic);
  // Thương nhân hết vốn tối thiểu thì quay lại làm thuê
  if (n.occupation === 'merchant' && c.household.money < TRADE_MIN_CAPITAL) n.occupation = 'laborer';
  if (n.occupation !== 'laborer' || !c.household.independent) return;
  const kind = logic.settlementKind[c.location]!;
  if (kind === 'village') return;
  const here = (o: Occupation) => world.people.reduce((s, m) => s + (alive(m) && m.occupation === o && m.character.location === c.location ? 1 : 0), 0);
  const xp = c.skillXp;
  if (xp.literacy >= XP_PRACTICED && ageYearsAt(c.birthTick, t) >= PHYSICIAN_MIN_AGE && PHYSICIAN_PERSONALITIES.includes(c.personality) && here('physician') === 0) n.occupation = 'physician';
  else if (xp.literacy >= XP_SKILLED) n.occupation = 'teacher';
  else if (xp.trade >= XP_PRACTICED && c.household.money >= TRADE_MIN_CAPITAL && here('merchant') < Math.floor(NPC_QUOTA[kind] / MERCHANT_SHARE_DIV)) n.occupation = 'merchant';
}
