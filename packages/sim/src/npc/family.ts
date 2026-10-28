// Gia đình (v0.5, ADR 0018): vợ chồng, cha mẹ con cái giữa người có tên; cha mẹ thật của người chơi; vai ruột thịt
// nhìn từ người chơi. Hôn nhân chỉ ghép một nam với một nữ (Q3). Thuần, tất định.
import { ageYearsAt, type Gender, type KinRole, type Tick } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import type { Rng } from '../core/rng';
import type { EconomyState } from '../economy/market';
import type { CharacterState } from '../life/character';
import { COMING_OF_AGE } from '../life/household';
import { spawnNpc } from './population';
import type { NpcState, NpcWorldState } from './state';

/** Tuổi cha mẹ lúc sinh con: người mẹ 18–42 (Q4), người cha 20–55. */
export const MOTHER_AGE: readonly [number, number] = [18, 42];
export const FATHER_AGE: readonly [number, number] = [20, 55];
/** Chênh tuổi chồng − vợ khi ghép đôi. */
export const SPOUSE_AGE_GAP: readonly [number, number] = [-3, 12];
/** Dân số ban đầu: tỉ lệ (‰) người nữ đã có chồng theo tuổi — những cuộc hôn nhân có từ trước khi đời người chơi bắt đầu. */
export const SEED_MARRIED_PERMILLE: readonly (readonly [number, number])[] = [[20, 300], [25, 650], [200, 850]];
/** Trẻ có cha mẹ thật được ưu tiên vào nhà ít con: trọng số = trần − số con đang nuôi; đủ trần thì không nhận thêm. */
const FEWER_CHILDREN_CAP = 5;

/**
 * Id của người chơi trong liên kết ruột thịt của NPC (v0.5 S5): vợ/chồng, cha mẹ của con người chơi. NPC cấp id từ "n1"
 * nên không trùng. Người chơi không nằm trong danh sách NPC; luật gia đình nhận người chơi qua `playerStandIn`.
 */
export const PLAYER_ID = 'n0';

/**
 * Người chơi trong dáng một người có tên, để luật gia đình (nuôi con, sinh con, giúp khi đói, chuyển nhà khi cưới) chạy
 * cùng một đường với NPC. Chỉ mang `id` và `character` thật; phần kế hoạch là bản đứng chỗ, không ai đọc.
 */
export function playerStandIn(c: CharacterState): NpcState {
  return { id: PLAYER_ID, character: c, occupation: 'farmer', tier: 'L0', rng: STAND_IN_RNG, death: c.alive ? null : STAND_IN_DEATH, plan: null, active: null, planWarned: false };
}
const STAND_IN_RNG: NpcState['rng'] = [0, 0, 0, 0];
const STAND_IN_DEATH: NonNullable<NpcState['death']> = { tick: 0, cause: 'old_age', detail: 'old_age.natural' };

/** Tra một người trong liên kết ruột thịt: NPC theo id, hoặc người chơi (`me`, nếu có). */
const kinAt = (id: string | null, byId: ReadonlyMap<string, NpcState>, me: NpcState | null): NpcState | undefined =>
  (id === null ? undefined : id === PLAYER_ID ? me ?? undefined : byId.get(id));

export const byIdOf = (world: NpcWorldState): Map<string, NpcState> => new Map(world.people.map((n) => [n.id, n]));

/**
 * Tra người theo id cho đường nóng (mỗi tuần): giữ bảng theo mảng người, dựng lại khi mảng đổi (dọn người mất đầu năm)
 * hoặc dài thêm (trẻ sinh, dựng thêm người). Người chỉ được thêm vào cuối, không bị thay giữa chừng.
 */
const lookups = new WeakMap<NpcState[], { len: number; map: Map<string, NpcState> }>();
export function lookup(world: NpcWorldState): Map<string, NpcState> {
  const hit = lookups.get(world.people);
  if (hit && hit.len === world.people.length) return hit.map;
  const map = byIdOf(world);
  lookups.set(world.people, { len: world.people.length, map });
  return map;
}

/** Người nuôi một đứa trẻ: mẹ rồi cha, ai còn sống (kể cả người chơi); không còn ai thì hộ trừu tượng (mảng rỗng). */
export function feedersOf(n: NpcState, byId: ReadonlyMap<string, NpcState>, me: NpcState | null = null): NpcState[] {
  const k = n.character.kin, out: NpcState[] = [];
  const m = kinAt(k.mother, byId, me), f = kinAt(k.father, byId, me);
  if (living(m)) out.push(m);
  if (living(f)) out.push(f);
  return out;
}
const living = (n: NpcState | undefined): n is NpcState => !!n && n.death === null;
const ageOf = (n: NpcState, t: Tick) => ageYearsAt(n.character.birthTick, t);

/** Chưa có vợ/chồng, hoặc vợ/chồng đã mất (góa). Vợ/chồng của người chơi luôn coi là đã có gia đình. */
export function single(n: NpcState, byId: ReadonlyMap<string, NpcState>): boolean {
  const s = n.character.kin.spouse;
  return s === null || (s !== PLAYER_ID && !living(byId.get(s)));
}

/** Nên vợ nên chồng (chỉ nối liên kết; chuyển nhà ở `lifecycle`). */
export function wed(a: NpcState, b: NpcState): void {
  a.character.kin.spouse = b.id;
  b.character.kin.spouse = a.id;
}

/** Người chồng có hợp tuổi với người vợ không. */
export function fitsAge(wife: NpcState, husband: NpcState, t: Tick): boolean {
  const gap = ageOf(husband, t) - ageOf(wife, t);
  return gap >= SPOUSE_AGE_GAP[0] && gap <= SPOUSE_AGE_GAP[1] && ageOf(husband, t) >= MOTHER_AGE[0];
}

/** Con còn sống theo cha, theo mẹ: id cha mẹ → con, theo id. */
export function childrenIndex(world: NpcWorldState): Map<string, NpcState[]> {
  const out = new Map<string, NpcState[]>();
  for (const n of world.people) {
    if (n.death) continue;
    for (const p of [n.character.kin.father, n.character.kin.mother]) if (p !== null) { const xs = out.get(p); if (xs) xs.push(n); else out.set(p, [n]); }
  }
  return out;
}

/** Con (mọi tuổi) của một người, còn sống, theo id. */
export function childrenOf(world: NpcWorldState, id: string): NpcState[] {
  return world.people.filter((n) => n.death === null && (n.character.kin.mother === id || n.character.kin.father === id));
}

/**
 * Cặp vợ chồng có thể nhận một đứa con sinh lúc `birthTick` ở quận: vợ 18–42 tuổi lúc ấy, chồng còn sống. Người chơi
 * (`me`) đã có vợ/chồng cũng là một cặp như mọi cặp (v0.5 S5), xét sau cùng.
 */
export function couplesFor(world: NpcWorldState, byId: ReadonlyMap<string, NpcState>, county: number, birthTick: Tick, me: NpcState | null = null): [NpcState, NpcState][] {
  const out: [NpcState, NpcState][] = [];
  for (const w of me ? [...world.people, me] : world.people) {
    const c = w.character;
    if (w.death || c.gender !== 'female' || c.home !== county || c.kin.spouse === null) continue;
    const h = kinAt(c.kin.spouse, byId, me);
    if (!living(h)) continue;
    const age = ageYearsAt(c.birthTick, birthTick);
    if (age >= MOTHER_AGE[0] && age <= MOTHER_AGE[1]) out.push([w, h]);
  }
  return out;
}

/** Chọn cặp cho một đứa trẻ, ưu tiên nhà ít con; rút RNG một lần nếu có cặp. */
export function pickCouple(world: NpcWorldState, couples: readonly [NpcState, NpcState][], rng: Rng): [NpcState, NpcState] | null {
  // Nhà đang nuôi đủ `FEWER_CHILDREN_CAP` con thì không nhận thêm
  const open = couples.map(([w]) => FEWER_CHILDREN_CAP - world.people.filter((n) => n.death === null && n.character.kin.mother === w.id && !n.character.household.independent).length);
  if (!open.some((k) => k > 0)) return null;
  return couples[rng.weighted(open.map((k) => Math.max(0, k)))]!;
}

/** Con nhận cha mẹ: liên kết, mang họ cha. */
export function adopt(child: CharacterState, father: NpcState, mother: NpcState): void {
  child.kin.father = father.id;
  child.kin.mother = mother.id;
  child.name = `${father.character.name.split(' ')[0]} ${child.name.split(' ').slice(1).join(' ')}`;
}

/**
 * Gia đình của dân số ban đầu (S2): những cuộc hôn nhân và con cái có từ trước khi đời người chơi bắt đầu.
 * - Người nữ đã ra riêng có chồng theo tỉ lệ tuổi (`SEED_MARRIED_PERMILLE`), chồng là người nam cùng quận hợp tuổi.
 * - Trẻ dưới 16 được gán cho một cặp cùng quận, cùng xuất thân, người mẹ 18–42 tuổi lúc trẻ sinh; không có thì không cha mẹ.
 * Gọi ngay sau `seedPopulation`, cùng luồng.
 */
export function seedFamilies(world: NpcWorldState, logic: RegionLogic, rng: Rng, tick: Tick): void {
  const byId = byIdOf(world);
  logic.settlementKind.forEach((_, county) => {
    const here = world.people.filter((n) => n.death === null && n.character.home === county);
    const men = here.filter((n) => n.character.gender === 'male' && n.character.household.independent);
    for (const w of here) {
      const c = w.character;
      if (c.gender !== 'female' || !c.household.independent || !single(w, byId)) continue;
      const age = ageOf(w, tick);
      const permille = SEED_MARRIED_PERMILLE.find(([upTo]) => age < upTo)![1];
      if (rng.int(0, 999) >= permille) continue;
      const pool = men.filter((m) => single(m, byId) && fitsAge(w, m, tick));
      if (pool.length) wed(w, pool[rng.int(0, pool.length - 1)]!);
    }
    for (const kid of here) {
      const c = kid.character;
      if (ageOf(kid, tick) >= COMING_OF_AGE || c.kin.mother !== null) continue;
      const couples = couplesFor(world, byId, county, c.birthTick).filter(([w, h]) => w.character.background === c.background && h.character.background === c.background);
      const pair = pickCouple(world, couples, rng);
      if (pair) adopt(c, pair[1], pair[0]);
    }
  });
}

/**
 * Cha mẹ của người chơi (Q2): ưu tiên một cặp vợ chồng ở quận sinh, cùng xuất thân, người mẹ 18–42 tuổi; không có thì
 * ghép một nam, một nữ chưa có vợ/chồng; thiếu nữa thì dựng thêm người ở quận ấy (trừ dân nền một miệng ăn). Người chơi
 * mang họ cha. Nuôi con, phần chia lúc lập thân vẫn theo hộ trừu tượng (ADR 0013).
 */
export function assignPlayerParents(world: NpcWorldState, eco: EconomyState, logic: RegionLogic, rng: Rng, tick: Tick, player: CharacterState): { father: NpcState; mother: NpcState } {
  const county = player.home;
  const byId = byIdOf(world);
  const couples = couplesFor(world, byId, county, tick).filter(([w, h]) => w.character.background === player.background && h.character.background === player.background
    && w.character.location === county && h.character.location === county && ageOf(h, tick) >= FATHER_AGE[0] && ageOf(h, tick) <= FATHER_AGE[1]);
  const pair = pickCouple(world, couples, rng);
  if (pair) {
    adopt(player, pair[1], pair[0]);
    return { father: pair[1], mother: pair[0] };
  }
  const pick = (gender: Gender, [lo, hi]: readonly [number, number]): NpcState => {
    const pool = world.people.filter((n) => {
      const c = n.character, age = ageOf(n, tick);
      return !n.death && c.home === county && c.location === county && c.gender === gender && c.household.independent
        && c.background === player.background && single(n, byId) && age >= lo && age <= hi;
    });
    if (pool.length) return pool[rng.int(0, pool.length - 1)]!;
    const ce = eco.counties[county]!;
    ce.mouths = Math.max(1, ce.mouths - 1);
    const hasPhysician = world.people.some((n) => !n.death && n.occupation === 'physician' && n.character.location === county);
    return spawnNpc(world, eco, logic, rng, tick, county, county, { gender, background: player.background, age: rng.int(lo, hi), hasPhysician });
  };
  const mother = pick('female', MOTHER_AGE);
  const father = pick('male', FATHER_AGE);
  wed(father, mother);
  adopt(player, father, mother);
  return { father, mother };
}

/** Vai của một người đối với người chơi; null nếu không phải người thân. */
export function kinRole(player: CharacterState, n: NpcState): KinRole | null {
  if (player.kin.father === n.id) return 'father';
  if (player.kin.mother === n.id) return 'mother';
  if (player.kin.spouse === n.id) return 'spouse';
  const k = n.character.kin;
  if (k.father === PLAYER_ID || k.mother === PLAYER_ID) return n.character.gender === 'male' ? 'son' : 'daughter';
  if ((k.father !== null && k.father === player.kin.father) || (k.mother !== null && k.mother === player.kin.mother)) return 'sibling';
  return null;
}

/** Người thân giúp khi đói (Q6): mỗi tháng tối đa chừng ấy tuần ăn của người nhận; người cho giữ lại một năm ăn của mình. */
export const KIN_HELP_WEEKS = 4;
export const KIN_KEEP_GRAIN = 360;

/**
 * Người đang đói (đã ra riêng) được vợ/chồng, cha mẹ, con đã ra riêng ở cùng quận chia lương, theo thứ tự đó; mỗi người
 * cho chỉ phần trên một năm ăn của mình. Cùng luật cho người chơi và NPC (ADR 0018). Trả số lương nhận được.
 */
export function kinHelp(receiver: CharacterState, givers: readonly NpcState[], ration: number): number {
  const h = receiver.household;
  if (!h.independent || h.hunger === 0) return 0;
  let want = ration * KIN_HELP_WEEKS, got = 0;
  for (const g of givers) {
    const gh = g.character.household;
    if (g.death || !gh.independent || g.character.location !== receiver.location) continue;
    const give = Math.min(want, Math.max(0, gh.grain - KIN_KEEP_GRAIN));
    gh.grain -= give; h.grain += give; got += give; want -= give;
    if (want === 0) break;
  }
  return got;
}

/** Người thân có thể giúp một người: vợ/chồng, cha, mẹ (kể cả người chơi, `me`), rồi con (đã ra riêng), theo id. */
export function giversOf(c: CharacterState, byId: ReadonlyMap<string, NpcState>, children: readonly NpcState[], me: NpcState | null = null): NpcState[] {
  const out: NpcState[] = [];
  for (const id of [c.kin.spouse, c.kin.father, c.kin.mother]) { const n = kinAt(id, byId, me); if (living(n)) out.push(n); }
  for (const k of children) if (living(k) && k.character.household.independent) out.push(k);
  return out;
}
