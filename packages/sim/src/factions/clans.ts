// Gia tộc (v0.6 S2, ADR 0019 Q4): suy từ dòng họ v0.5 — dòng theo đường cha, đủ người lớn cùng quận và đủ của thì lập;
// trưởng họ, uy thế; tách khi một chi đủ người ở quận khác, nhập khi hai họ nhỏ thông gia, tàn khi hết người. Không có
// kho chung: của vẫn trong túi từng người. Thuần, tất định, số nguyên, không rút RNG; duyệt theo id.
import { ageYearsAt, type Tick } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { COMING_OF_AGE } from '../life/household';
import type { NpcState, NpcWorldState } from '../npc/state';
import type { FactionState, FactionWorldState } from './state';

/**
 * Lập gia tộc: từng ấy người lớn còn sống cùng một dòng cha, cùng quận nhà (Q4). S8 (chủ dự án chọn): 4 → 5 — có dòng họ
 * dựng sẵn từ đầu (`seedLineage`) thì với 4, năm vùng vượt mười gia tộc trong 50 năm; với 5, mọi vùng 2–9.
 */
export const CLAN_MIN_ADULTS = 5;
/** …và đủ của: tổng ruộng của những người lớn ấy, hoặc tổng tiền. */
export const CLAN_MIN_LAND_MU = 20;
export const CLAN_MIN_MONEY = 20_000;
/** Tàn khi người lớn còn ở quận trị sở dưới ngưỡng này. */
export const CLAN_END_ADULTS = 3;
/**
 * Họ nhỏ (người lớn ở trị sở dưới ngưỡng này) thông gia với họ nhỏ khác cùng quận thì nhập vào họ đông hơn. S8: 6 → 7,
 * theo ngưỡng lập 5 (vẫn hai bậc trên ngưỡng lập).
 */
export const CLAN_SMALL_ADULTS = 7;
/** Uy thế (văn tương đương): tiền + ruộng × giá một mẫu + người lớn × giá một người. */
export const MU_VALUE = 1_000;
export const PERSON_VALUE = 2_000;
/** Thái độ giữa chi tách ra và họ gốc, giữa hai họ đã nhập (cùng máu, thông gia). */
export const KIN_ATTITUDE = 50;

const idNum = (id: string) => Number(id.slice(1));
const byIdOrder = (a: string, b: string) => idNum(a) - idNum(b);
const isAdult = (n: NpcState, t: Tick) => ageYearsAt(n.character.birthTick, t) >= COMING_OF_AGE;
const surnameOf = (n: NpcState) => n.character.name.split(' ')[0]!;

/** Người lớn còn sống của gia tộc ở quận trị sở. */
function adultsAtSeat(f: FactionState, byId: ReadonlyMap<string, NpcState>, t: Tick): NpcState[] {
  return f.members.flatMap((id) => {
    const n = byId.get(id);
    return n && n.death === null && n.character.home === f.seat && isAdult(n, t) ? [n] : [];
  });
}

/** Uy thế của gia tộc (Q4): ruộng + tiền + người, chỉ tính người lớn ở quận trị sở. */
export function clanPrestige(f: FactionState, byId: ReadonlyMap<string, NpcState>, t: Tick): number {
  return adultsAtSeat(f, byId, t).reduce((s, n) => s + n.character.household.money + n.character.household.landMu * MU_VALUE + PERSON_VALUE, 0);
}

/** Trưởng họ: người nam lớn tuổi nhất còn sống ở trị sở; không có nam thì người lớn tuổi nhất. */
function headOf(adults: readonly NpcState[]): NpcState | null {
  const eldest = (xs: readonly NpcState[]) => xs.reduce<NpcState | null>((best, n) => (best === null || n.character.birthTick < best.character.birthTick ? n : best), null);
  return eldest(adults.filter((n) => n.character.gender === 'male')) ?? eldest(adults);
}

function newClan(fw: FactionWorldState, logic: RegionLogic, surname: string, seat: number, members: string[], t: Tick): FactionState {
  const f: FactionState = {
    id: `f${fw.nextId++}`, kind: 'clan', name: { key: 'faction.clan.name', params: { surname, place: logic.counties[seat]!.name ?? 'place.unknown' } },
    seat, counties: [], holds: [], roads: [], members: [...members].sort(byIdOrder), leader: null, power: 0, losses: 0, greed: 0, termEnds: 0, relations: [], money: 0, grain: 0, founded: t, ended: null,
  };
  fw.list.push(f);
  return f;
}

function befriend(a: FactionState, b: FactionState): void {
  for (const [x, y] of [[a, b], [b, a]] as const) {
    const r = x.relations.find((q) => q.other === y.id);
    if (r) r.attitude = Math.max(r.attitude, KIN_ATTITUDE);
    else x.relations.push({ other: y.id, attitude: KIN_ATTITUDE });
    x.relations.sort((p, q) => byIdOrder(p.other, q.other));
  }
}

function end(f: FactionState, t: Tick): void {
  f.ended = t;
  f.members = [];
  f.counties = [];
  f.holds = [];
  f.leader = null;
}

/** Tổ dòng cha (`KinLinks.lineage`); người đầu dòng là chính mình. */
const lineOf = (n: NpcState) => n.character.kin.lineage ?? n.id;

/**
 * Gia tộc mỗi quý, sau quan phủ: cập nhật người (bỏ người mất, nhận con của nam trong họ), tách chi, tàn, nhập họ nhỏ
 * thông gia, lập họ mới; rồi trưởng họ và họ đứng đầu mỗi quận (`counties` của gia tộc: quận nó đứng đầu — chưa phải
 * quận nó cai quản; cát cứ ở S5).
 */
export function clansQuarter(fw: FactionWorldState, npcs: NpcWorldState, logic: RegionLogic, t: Tick): void {
  const byId = new Map(npcs.people.map((n) => [n.id, n]));
  const living = (id: string) => { const n = byId.get(id); return n !== undefined && n.death === null; };
  const clans = () => fw.list.filter((f) => f.kind === 'clan' && f.ended === null);

  // 1 Người: bỏ người đã mất; con có cha trong họ thì vào họ (duyệt theo id: cha luôn có id nhỏ hơn con)
  const clanOf = new Map<string, FactionState>();
  for (const f of clans()) {
    f.members = f.members.filter(living);
    for (const id of f.members) clanOf.set(id, f);
  }
  for (const n of npcs.people) {
    if (n.death !== null || clanOf.has(n.id) || n.character.kin.father === null) continue;
    const f = clanOf.get(n.character.kin.father);
    if (!f) continue;
    f.members.push(n.id);
    clanOf.set(n.id, f);
  }
  for (const f of clans()) f.members.sort(byIdOrder);

  // 2 Tách: người lớn của họ ở một quận khác đủ ngưỡng thì chi ấy (mọi người có quận nhà ở đó) thành họ riêng
  for (const f of clans()) {
    const adultsBy = new Map<number, number>();
    for (const id of f.members) {
      const n = byId.get(id)!;
      if (n.character.home !== f.seat && isAdult(n, t)) adultsBy.set(n.character.home, (adultsBy.get(n.character.home) ?? 0) + 1);
    }
    for (const county of [...adultsBy.keys()].sort((a, b) => a - b)) {
      if (adultsBy.get(county)! < CLAN_MIN_ADULTS) continue;
      const branch = f.members.filter((id) => byId.get(id)!.character.home === county);
      f.members = f.members.filter((id) => byId.get(id)!.character.home !== county);
      const b = newClan(fw, logic, String(f.name.params.surname), county, branch, t);
      befriend(f, b);
    }
  }

  // 3 Tàn: người lớn ở trị sở dưới ngưỡng
  for (const f of clans()) if (adultsAtSeat(f, byId, t).length < CLAN_END_ADULTS) end(f, t);

  // 4 Nhập: hai họ nhỏ cùng quận có người trong họ lấy nhau → họ ít người hơn nhập vào họ đông hơn (bằng nhau: id lớn vào id nhỏ)
  clanOf.clear();
  for (const f of clans()) for (const id of f.members) clanOf.set(id, f);
  for (const a of clans()) {
    if (a.ended !== null) continue;
    const na = adultsAtSeat(a, byId, t).length;
    if (na >= CLAN_SMALL_ADULTS) continue;
    for (const id of a.members) {
      const spouse = byId.get(id)!.character.kin.spouse;
      const b = spouse === null ? undefined : clanOf.get(spouse);
      if (!b || b === a || b.ended !== null || b.seat !== a.seat) continue;
      const nb = adultsAtSeat(b, byId, t).length;
      if (nb >= CLAN_SMALL_ADULTS) continue;
      const [keep, gone] = na > nb || (na === nb && idNum(a.id) < idNum(b.id)) ? [a, b] : [b, a];
      keep.members = [...keep.members, ...gone.members].sort(byIdOrder);
      for (const m of gone.members) clanOf.set(m, keep);
      befriend(keep, gone);
      end(gone, t);
      break;
    }
  }

  // 5 Lập: dòng cha chưa thuộc họ nào, đủ người lớn cùng quận nhà và đủ của
  const lines = new Map<string, NpcState[]>();
  for (const n of npcs.people) {
    if (n.death !== null || clanOf.has(n.id)) continue;
    const r = lineOf(n);
    const line = lines.get(r);
    if (line) line.push(n); else lines.set(r, [n]);
  }
  // Dòng chưa đủ người (phần lớn: một người một dòng) không lập được: bỏ trước khi sắp (S8, hiệu năng; kết quả giữ nguyên)
  const ready = [...lines].filter(([, line]) => line.length >= CLAN_MIN_ADULTS);
  for (const [, line] of ready.sort(([a], [b]) => byIdOrder(a, b))) {
    let best: { county: number; adults: NpcState[] } | null = null;
    for (const county of [...new Set(line.map((n) => n.character.home))].sort((a, b) => a - b)) {
      const adults = line.filter((n) => n.character.home === county && isAdult(n, t));
      if (adults.length < CLAN_MIN_ADULTS) continue;
      const land = adults.reduce((s, n) => s + n.character.household.landMu, 0);
      const money = adults.reduce((s, n) => s + n.character.household.money, 0);
      if (land < CLAN_MIN_LAND_MU && money < CLAN_MIN_MONEY) continue;
      if (!best || adults.length > best.adults.length) best = { county, adults };
    }
    if (!best) continue;
    const head = headOf(best.adults)!;
    newClan(fw, logic, surnameOf(head), best.county, line.filter((n) => n.character.home === best.county).map((n) => n.id), t);
  }

  // 6 Trưởng họ; họ đứng đầu mỗi quận theo uy thế (bằng nhau: id nhỏ)
  const lead = new Map<number, { f: FactionState; p: number }>();
  for (const f of clans()) {
    f.leader = headOf(adultsAtSeat(f, byId, t))?.id ?? null;
    f.counties = [];
    const p = (f.power = clanPrestige(f, byId, t));
    const cur = lead.get(f.seat);
    if (!cur || p > cur.p) lead.set(f.seat, { f, p });
  }
  for (const [county, { f }] of lead) f.counties = [county];
}
