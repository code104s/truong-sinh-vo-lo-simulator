// Băng cướp (v0.6 S4, ADR 0019 Q6, Q9): lập trong năm khó ở quận xa trị sở quan phủ hoặc có đường núi, từ người lớn
// không ruộng, nghèo; mỗi quý cướp kho quận sào huyệt và quận kề, chia cho người trong đảng; năm khó dụ thêm người, năm
// thường người bỏ về nghề cũ; dưới 3 người thì tan. Người theo cướp đổi nghề `bandit`, cùng luật sống chết với mọi người.
// Chưa chiếm quận (cát cứ, tiễu phỉ ở S5); rủi ro đường cho người chơi ở S6. Thuần, tất định, số nguyên; RNG luồng `factions`.
import { ageYearsAt, type Tick } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { idiv } from '../core/math';
import type { Rng } from '../core/rng';
import { supplyOf, type CountyEconomy, type EconomyState } from '../economy/market';
import { COMING_OF_AGE, RATION_ADULT } from '../life/household';
import { baseOccupation } from '../npc/lifecycle';
import type { NpcState, NpcWorldState } from '../npc/state';
import { governmentSeat } from './government';
import type { FactionState, FactionWorldState } from './state';

/** Lập, và tan khi dưới ngưỡng này. */
export const BANDIT_MIN_MEMBERS = 3;
/** Người theo được: người lớn tới 50 tuổi, không ruộng, túi dưới ngưỡng này, quận nhà ở sào huyệt hay quận kề. */
export const BANDIT_POOR_MONEY = 2_000;
export const BANDIT_MAX_AGE = 50;
/**
 * Mỗi quý năm khó, quận hợp làm sào huyệt có đủ người theo được thì nổi một đảng với xác suất này (‰). Đo ở S4: mỗi
 * quận chỉ khoảng 0,4 người đủ điều kiện mỗi quý, nên đòi ba người cùng rút trúng thì gần như không bao giờ có đảng.
 */
export const BANDIT_FOUND_PERMILLE = 150;
/** Mỗi quý năm khó, mỗi người đủ điều kiện quanh sào huyệt theo cướp với xác suất này (‰) × hệ số tính cách. */
export const BANDIT_JOIN_PERMILLE = 100;
/** Mỗi quý năm thường (quận sào huyệt không khó), mỗi người trong đảng bỏ về nghề cũ với xác suất này (‰). */
export const BANDIT_LEAVE_PERMILLE = 100;
/** Hệ số theo cướp theo tính cách (Q6: nóng nảy, xảo trá dễ theo hơn); người chính trực, hiền, trung tín, nhút nhát không theo. */
export const BANDIT_TEMPER: Readonly<Record<string, number>> = {
  hot_tempered: 2, cunning: 2, greedy: 2, ambitious: 1, aloof: 1, eccentric: 1, cheerful: 1, calm: 1,
  righteous: 0, kind: 0, loyal: 0, timid: 0,
};
/** Mỗi quý mỗi người trong đảng cần chừng ấy lương (ăn một quý) và tiền; cướp không quá 50‰ kho, quỹ một quận. */
export const BANDIT_GRAIN_PER_MEMBER = 12 * RATION_ADULT;
export const BANDIT_MONEY_PER_MEMBER = 300;
export const BANDIT_RAID_PERMILLE = 50;
/** Đường núi: hệ số địa hình từ chừng này (ADR 0012: núi ×2). */
export const MOUNTAIN_TERRAIN_PCT = 200;
/** Thế mỗi người (văn tương đương, cùng thang uy thế gia tộc). */
const PERSON_VALUE = 2_000;

/** Quận năm khó: đói kém, khan lương, hay năm có tai họa (Q6). */
export const hardCounty = (ce: CountyEconomy): boolean => ce.disaster !== null || supplyOf(ce) === 'famine' || supplyOf(ce) === 'scarce';

/** Nơi lập sào huyệt được: không phải trị sở quan phủ, và không kề trị sở hoặc có đường núi (Q6: xa trị sở, giáp núi rừng). */
export function lairSite(logic: RegionLogic, county: number, seat: number): boolean {
  if (county === seat) return false;
  let nearSeat = false, mountain = false;
  logic.adjacency.forEach(([a, b], k) => {
    if (a !== county && b !== county) return;
    if (a === seat || b === seat) nearSeat = true;
    if (logic.terrainPct[k]! >= MOUNTAIN_TERRAIN_PCT) mountain = true;
  });
  return !nearSeat || mountain;
}

/** Nơi băng cướp với tới: quận sào huyệt trước, rồi quận kề theo chỉ số. */
function reachOf(logic: RegionLogic, county: number): number[] {
  const near: number[] = [];
  for (const [a, b] of logic.adjacency) { if (a === county) near.push(b); else if (b === county) near.push(a); }
  return [county, ...near.sort((x, y) => x - y)];
}

/** Người lớn có thể theo cướp, quận nhà ở sào huyệt hay quận kề, theo id. */
function recruitsAt(npcs: NpcWorldState, reach: readonly number[], t: Tick, taken: ReadonlySet<string>): NpcState[] {
  return npcs.people.filter((n) => {
    const c = n.character, h = c.household, age = ageYearsAt(c.birthTick, t);
    return n.death === null && reach.includes(c.home) && h.independent && age >= COMING_OF_AGE && age <= BANDIT_MAX_AGE && h.landMu === 0
      && h.money < BANDIT_POOR_MONEY && !taken.has(n.id) && (n.occupation === 'farmer' || n.occupation === 'laborer' || n.occupation === 'hunter');
  });
}

const temper = (n: NpcState) => BANDIT_TEMPER[n.character.personality] ?? 1;
/** Quan tham thì dân oán, dễ theo cướp hơn (S5): xác suất × (100 + độ tham)%. */
const joins = (n: NpcState, rng: Rng, greed: number) => rng.int(0, 999) < idiv(BANDIT_JOIN_PERMILLE * temper(n) * (100 + greed), 100);

function leave(n: NpcState, logic: RegionLogic): void {
  n.occupation = baseOccupation(n.character, logic);
}

/** Tan: người còn lại về nghề cũ, kho chia đều cho họ, phần lẻ (hay cả kho khi không còn ai) về quận sào huyệt. */
function disband(f: FactionState, eco: EconomyState, byId: ReadonlyMap<string, NpcState>, logic: RegionLogic, t: Tick): void {
  const members = f.members.map((id) => byId.get(id)!);
  for (const n of members) leave(n, logic);
  if (members.length > 0) {
    const money = idiv(f.money, members.length), grain = idiv(f.grain, members.length);
    for (const n of members) { n.character.household.money += money; n.character.household.grain += grain; }
    f.money -= money * members.length; f.grain -= grain * members.length;
  }
  const lair = eco.counties[f.seat]!;
  lair.money += f.money; lair.grain += f.grain;
  f.money = f.grain = 0;
  f.ended = t;
  f.members = []; f.roads = []; f.counties = []; f.holds = []; f.leader = null;
}

/**
 * Băng cướp mỗi quý, sau thương hội: người (bỏ người mất), cướp kho, chia cho người trong đảng, bỏ đi hay dụ thêm, tan,
 * lập mới. Rút RNG theo thứ tự id người, rồi theo chỉ số quận.
 */
export function banditsQuarter(fw: FactionWorldState, eco: EconomyState, npcs: NpcWorldState, logic: RegionLogic, t: Tick, rng: Rng): void {
  const byId = new Map(npcs.people.map((n) => [n.id, n]));
  const bands = () => fw.list.filter((f) => f.kind === 'bandits' && f.ended === null);
  const taken = new Set<string>();
  const greed = fw.list.find((f) => f.kind === 'government' && f.ended === null)?.greed ?? 0;
  // Họ đứng đầu mỗi quận (S5: gia tộc giữ làng trước cướp, Q8)
  const leadClan = new Map<number, FactionState>();
  for (const f of fw.list) if (f.kind === 'clan' && f.ended === null) for (const c of f.counties) leadClan.set(c, f);

  for (const f of bands()) {
    f.members = f.members.filter((id) => { const n = byId.get(id); return n !== undefined && n.death === null && n.occupation === 'bandit'; });
    for (const id of f.members) taken.add(id);
  }

  for (const f of bands()) {
    const reach = reachOf(logic, f.seat);
    // 1 Cướp kho làng: đủ ăn một quý và tiêu vặt cho cả đảng, mỗi quận không quá 50‰ kho, quỹ
    let wantGrain = f.members.length * BANDIT_GRAIN_PER_MEMBER, wantMoney = f.members.length * BANDIT_MONEY_PER_MEMBER;
    for (const c of reach) {
      const ce = eco.counties[c]!;
      // Họ đứng đầu quận giữ làng (Q8): đọ uy thế với thế cướp; giữ được thì quận ấy không mất gì, đảng mất một người
      const clan = leadClan.get(c);
      if (clan && f.members.length > 0 && rng.int(0, clan.power + f.power - 1) < clan.power) {
        leave(byId.get(f.members.pop()!)!, logic);
        continue;
      }
      const g = Math.min(wantGrain, idiv(ce.grain * BANDIT_RAID_PERMILLE, 1000));
      const m = Math.min(wantMoney, idiv(ce.money * BANDIT_RAID_PERMILLE, 1000));
      ce.grain -= g; f.grain += g; wantGrain -= g;
      ce.money -= m; f.money += m; wantMoney -= m;
    }
    // 2 Chia: hết lương, nửa tiền, đều cho mỗi người
    if (f.members.length > 0) {
      const grain = idiv(f.grain, f.members.length), money = idiv(idiv(f.money, 2), f.members.length);
      for (const id of f.members) { const h = byId.get(id)!.character.household; h.grain += grain; h.money += money; }
      f.grain -= grain * f.members.length; f.money -= money * f.members.length;
    }
    // 3 Năm khó dụ thêm người quanh sào huyệt; năm thường người bỏ về nghề cũ
    if (hardCounty(eco.counties[f.seat]!)) {
      for (const n of recruitsAt(npcs, reach, t, taken)) if (joins(n, rng, greed)) { n.occupation = 'bandit'; f.members.push(n.id); taken.add(n.id); }
      f.members.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    } else {
      f.members = f.members.filter((id) => { if (rng.int(0, 999) >= BANDIT_LEAVE_PERMILLE) return true; leave(byId.get(id)!, logic); return false; });
    }
    // 4 Tan khi dưới ngưỡng người
    if (f.members.length < BANDIT_MIN_MEMBERS) { disband(f, eco, byId, logic, t); continue; }
    // 5 Đầu đảng: người võ nghệ cao nhất (bằng nhau: id nhỏ); thế = kho + mỗi người (giá một người + võ nghệ)
    const members = f.members.map((id) => byId.get(id)!);
    f.leader = members.reduce((best, n) => (n.character.skillXp.martial > best.character.skillXp.martial ? n : best)).id;
    f.power = f.money + members.reduce((s, n) => s + PERSON_VALUE + n.character.skillXp.martial, 0);
  }

  // 6 Lập: quận năm khó, hợp làm sào huyệt, chưa có băng (kể cả băng vừa tan còn trong danh sách một năm), đủ người theo
  const seat = fw.list.find((f) => f.kind === 'government' && f.ended === null)?.seat ?? governmentSeat(logic);
  eco.counties.forEach((ce, county) => {
    if (!hardCounty(ce) || !lairSite(logic, county, seat) || fw.list.some((f) => f.kind === 'bandits' && f.seat === county)) return;
    const pool = recruitsAt(npcs, reachOf(logic, county), t, taken).filter((n) => temper(n) > 0);
    if (pool.length < BANDIT_MIN_MEMBERS || rng.int(0, 999) >= idiv(BANDIT_FOUND_PERMILLE * (100 + greed), 100)) return;
    // Người dễ theo nhất theo trước (nóng nảy, xảo trá, tham), rồi người thường cho đủ ba
    const eager = pool.filter((n) => temper(n) >= 2);
    const joined = [...eager, ...pool.filter((n) => temper(n) < 2).slice(0, Math.max(0, BANDIT_MIN_MEMBERS - eager.length))]
      .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
    for (const n of joined) { n.occupation = 'bandit'; taken.add(n.id); }
    const roads: number[] = [];
    logic.adjacency.forEach(([a, b], k) => { if (a === county || b === county) roads.push(k); });
    fw.list.push({
      id: `f${fw.nextId++}`, kind: 'bandits', name: { key: 'faction.bandits.name', params: { place: logic.counties[county]!.name ?? 'place.unknown' } },
      seat: county, counties: [], holds: [], roads, members: joined.map((n) => n.id), leader: joined[0]!.id, power: joined.length * PERSON_VALUE, losses: 0, greed: 0, termEnds: 0,
      relations: [], money: 0, grain: 0, founded: t, ended: null,
    });
  });
}
