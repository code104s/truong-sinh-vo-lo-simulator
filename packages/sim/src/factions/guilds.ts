// Thương hội (v0.6 S3, ADR 0019 Q5): một mỗi trấn, thành có đủ thương nhân; hội viên là thương nhân NPC ở đó. Giữ những
// con đường chạm trị sở, ăn một phần lời của dòng lương đi qua; trả phí hội quán, chia lãi cho hội viên; lỗ kéo dài
// hay hết hội viên thì tan. Không nắm giá chợ. Thuần, tất định, số nguyên, không rút RNG; duyệt theo id.
import type { Tick } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { idiv, mulDiv } from '../core/math';
import type { EconomyState } from '../economy/market';
import type { NpcState, NpcWorldState } from '../npc/state';
import type { FactionState, FactionWorldState } from './state';

/**
 * Lập: từng ấy thương nhân còn sống có quận nhà ở trấn, thành chưa có thương hội. S8 (chủ dự án chọn): 3 → 2, bằng ngưỡng
 * tan — với 3, có vùng một phần tư số năm không có hội nào.
 */
export const GUILD_MIN_MERCHANTS = 2;
/** Lập: mỗi hội viên góp chừng ấy văn vào kho (không đủ thì góp hết túi). */
export const GUILD_DUES = 1_000;
/** Tan khi hội viên dưới ngưỡng này. */
export const GUILD_END_MEMBERS = 2;
/**
 * Phần lời của lái buôn trên đường thương hội giữ mà thương hội lấy (%), từ quận mua — đã trừ người áp tải, phu khuân:
 * chỉ tốn khi có hàng đi.
 */
export const GUILD_MARGIN_PCT = 25;
/** Phí hội quán mỗi quý (văn), có buôn hay không — trả vào quỹ quận trị sở. */
export const GUILD_UPKEEP = 300;
/** Giữ lại trong kho bằng từng ấy quý phí; phần vượt chia một nửa cho hội viên. */
export const GUILD_RESERVE_QUARTERS = 20;
/**
 * Lỗ: quý thu dưới phí mà kho đã tụt dưới mức giữ lại. Lời buôn đến theo đợt: năm được mùa đều, giá các quận ngang nhau
 * thì không ai chở, có đường im nhiều năm liền (đo thử: 71% số quý không có thu dù cả năm lãi gấp mười phí). Từng ấy
 * quý lỗ liền mà kho không đủ một quý phí thì tan.
 */
export const GUILD_LOSS_QUARTERS = 20;
/**
 * Việc làm (v0.6 S6, Q10): thương hội kho trên mức giữ lại thì thuê người khuân vác, áp tải ở trị sở — lương làm thuê ở
 * đó bằng chừng ấy % lệ thường. Quỹ quận trả lương rồi được thương hội hoàn phần trả thêm đầu quý sau.
 */
export const GUILD_WAGE_PCT = 125;


/** Thương nhân còn sống theo quận nhà, theo id (gom một lần mỗi quý: trong pha này không ai đổi nghề, đổi quận). */
function merchantsByCounty(npcs: NpcWorldState): Map<number, NpcState[]> {
  const out = new Map<number, NpcState[]>();
  for (const n of npcs.people) {
    if (n.death !== null || n.occupation !== 'merchant') continue;
    const xs = out.get(n.character.home);
    if (xs) xs.push(n); else out.set(n.character.home, [n]);
  }
  return out;
}

/** Tan: kho chia đều cho hội viên còn lại, phần lẻ (hay cả kho khi không còn ai) vào quỹ quận trị sở. */
function dissolve(f: FactionState, eco: EconomyState, byId: ReadonlyMap<string, NpcState>, t: Tick): void {
  const members = f.members.flatMap((id) => { const n = byId.get(id); return n ? [n] : []; });
  if (members.length > 0) {
    const each = idiv(f.money, members.length);
    for (const n of members) n.character.household.money += each;
    f.money -= each * members.length;
  }
  eco.counties[f.seat]!.money += f.money;
  f.money = 0;
  f.ended = t;
  f.members = [];
  f.roads = [];
  f.counties = [];
  f.leader = null;
}

/**
 * Thương hội mỗi quý, sau gia tộc: hội viên, đường giữ (mọi đường chạm trị sở; nối hai trị sở thì chia đôi), thu
 * phần lời đã ghi trong quý (`EconomyState.tradeMargin`), trả phí, chia lãi, tan, lập.
 */
export function guildsQuarter(fw: FactionWorldState, eco: EconomyState, npcs: NpcWorldState, logic: RegionLogic, t: Tick): void {
  const byId = new Map(npcs.people.map((n) => [n.id, n]));
  const guilds = () => fw.list.filter((f) => f.kind === 'guild' && f.ended === null);
  const merchants = merchantsByCounty(npcs);
  const merchantsAt = (county: number): NpcState[] => merchants.get(county) ?? [];

  // 1 Hội viên, hội trưởng (người giàu nhất), thế = kho + túi hội viên
  for (const f of guilds()) {
    const members = merchantsAt(f.seat);
    f.members = members.map((n) => n.id);
    f.leader = members.reduce<NpcState | null>((best, n) => (best === null || n.character.household.money > best.character.household.money ? n : best), null)?.id ?? null;
    f.power = f.money + members.reduce((s, n) => s + n.character.household.money, 0);
    f.roads = [];
  }

  // 2 Đường: thương hội giữ mọi đường chạm trị sở; đường nối hai trị sở thì hai bên cùng giữ, chia đôi phần lấy
  const holders = logic.adjacency.map(() => 0);
  logic.adjacency.forEach(([a, b], k) => {
    for (const f of guilds()) if (f.seat === a || f.seat === b) { f.roads.push(k); holders[k]!++; }
  });

  for (const f of guilds()) {
    // 3 Thu: một phần lời lái buôn trên đường mình giữ, từ quận mua (không quá quỹ quận ấy)
    let income = 0;
    for (const k of f.roads) {
      const [a, b] = logic.adjacency[k]!;
      for (const [side, county] of [[0, a], [1, b]] as const) {
        const ce = eco.counties[county]!;
        const take = Math.min(ce.money, idiv(mulDiv(eco.tradeMargin[k]![side], GUILD_MARGIN_PCT, 100), holders[k]!));
        ce.money -= take; f.money += take; income += take;
      }
    }
    // 4 Phí hội quán, lương thuê thêm quỹ quận đã ứng trong quý (S6) vào quỹ quận trị sở; lỗ liên tiếp
    const seat = eco.counties[f.seat]!;
    const upkeep = Math.min(f.money, GUILD_UPKEEP + seat.wageBonus);
    f.money -= upkeep; seat.money += upkeep;
    const reserve = GUILD_RESERVE_QUARTERS * GUILD_UPKEEP;
    f.losses = income < GUILD_UPKEEP && f.money < reserve ? f.losses + 1 : 0;
    // 5 Chia lãi: nửa phần vượt mức giữ lại, chia đều hội viên
    if (f.money > reserve && f.members.length > 0) {
      const each = idiv(idiv(f.money - reserve, 2), f.members.length);
      for (const id of f.members) byId.get(id)!.character.household.money += each;
      f.money -= each * f.members.length;
    }
    // 6 Tan: hết hội viên, hay lỗ kéo dài mà kho không đủ một quý phí
    if (f.members.length < GUILD_END_MEMBERS || (f.losses >= GUILD_LOSS_QUARTERS && f.money < GUILD_UPKEEP)) dissolve(f, eco, byId, t);
  }

  // 7 Lập: trấn, thành chưa có thương hội, đủ thương nhân
  logic.settlementKind.forEach((kind, county) => {
    // Thương hội vừa tan còn trong danh sách một năm: quận ấy chưa lập lại
    if (kind === 'village' || fw.list.some((f) => f.kind === 'guild' && f.seat === county)) return;
    const members = merchantsAt(county);
    if (members.length < GUILD_MIN_MERCHANTS) return;
    let dues = 0;
    for (const n of members) { const d = Math.min(GUILD_DUES, n.character.household.money); n.character.household.money -= d; dues += d; }
    fw.list.push({
      id: `f${fw.nextId++}`, kind: 'guild', name: { key: 'faction.guild.name', params: { place: logic.counties[county]!.name ?? 'place.unknown' } },
      seat: county, counties: [county], holds: [], roads: [], members: members.map((n) => n.id), leader: null, power: 0, losses: 0, greed: 0, termEnds: 0, relations: [],
      money: dues, grain: 0, founded: t, ended: null,
    });
  });

  // 8 Việc làm (S6, Q10): trấn có thương hội kho trên mức giữ lại thì quý tới thuê thêm, trả lương cao hơn
  for (const ce of eco.counties) ce.wagePct = 100;
  for (const f of guilds()) if (f.money >= GUILD_RESERVE_QUARTERS * GUILD_UPKEEP) eco.counties[f.seat]!.wagePct = GUILD_WAGE_PCT;
}
