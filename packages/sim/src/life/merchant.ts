// Thương nhân (v0.7 S3, ADR 0020 Q4): buôn tự do — đi buôn chuyến chở lương hay hàng (S3b, ADR 0021) từ quận đang đứng sang
// quận khác ăn chênh giá;
// hội viên thương hội — góp vốn, chia lãi theo quý (pha Thế lực), theo đoàn buôn ít rủi ro hơn nhưng nộp phần lời cho hội.
// Mọi đồng tiền đi giữa túi người chơi, quỹ quận, kho thế lực (sổ cái giữ). Thuần, tất định; ngẫu nhiên qua luồng được truyền vào.
import { GOODS, GRAIN_PER_DOU, type Cargo, type LogEntry, type PlanSlot, type Tick, type TravelPreview } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { idiv, mulDiv } from '../core/math';
import type { Rng } from '../core/rng';
import type { CharacterState } from './character';
import { acceptPpm, hasRank, rankStep, type CareerState } from './career';
import type { CountyEconomy, EconomyState } from '../economy/market';
import { routeDanger, routeEdges, routeRiskPct } from '../factions/impact';
import { GUILD_DUES, GUILD_MARGIN_PCT } from '../factions/guilds';
import type { FactionState, FactionWorldState } from '../factions/state';
import { caravanCutPct, isHostile, JOIN_ATTITUDE, shiftAttitude } from '../factions/attitude';
import { kinRole, lookup } from '../npc/family';
import type { NpcState, NpcWorldState } from '../npc/state';
import { ensureBond, type Bond } from '../social/bonds';
import { repAt } from '../social/reputation';

type Log = (e: Omit<LogEntry, 'tick'>) => void;

/** Vốn bỏ vào một chuyến theo bậc (văn): học việc, làm được, có tiếng. Dưới mức tối thiểu thì không đi. */
export const HAUL_CAPITAL = [1_000, 3_000, 10_000] as const;
export const HAUL_MIN_CAPITAL = 200;
/** Mỗi chuyến mua tối đa chừng ấy ‰ kho quận nguồn (như lái buôn trong mô phỏng chợ: 20‰ mỗi tháng, ADR 0012). */
export const HAUL_SHARE_PERMILLE = 50;
/**
 * Rủi ro vốn mỗi chuyến (ppm): đường xấu (địa hình, người giữ đường — `routeRiskPct`) 3% nhân hệ số đường, hỏng nửa hàng;
 * chặng có băng cướp giữ: 25%, mất cả hàng vào kho băng cướp. Theo đoàn buôn của thương hội: rủi ro còn một nửa.
 */
export const HAUL_MISHAP_PPM = 30_000;
export const HAUL_SPOIL_PCT = 50;
export const HAUL_ROBBED_PPM = 250_000;
export const CARAVAN_RISK_PCT = 50;
/** Hội viên theo đoàn nộp cho hội phần lời như lái buôn trên đường hội giữ (v0.6 S3). */
export const CARAVAN_CUT_PCT = GUILD_MARGIN_PCT;

/** Phí chở (văn/đấu) cả lộ trình, cùng công thức lái buôn của chợ (ADR 0012): mỗi chặng km × địa hình% × 5 / 10.000. */
export function routeTransport(logic: RegionLogic, route: readonly number[]): number {
  return routeEdges(logic, route).reduce((s, k) => {
    const [a, b] = logic.adjacency[k]!;
    return s + idiv(logic.seatKm[a]![b]! * logic.terrainPct[k]! * 5, 10_000);
  }, 0);
}

/**
 * Giá niêm yết của hàng chở ở một chợ (lương: văn/đấu; hàng: văn/phần) và kho của nó (thăng hay phân). Một đấu lương và
 * một phần hàng cùng là 10 đơn vị, nên mọi công thức chuyến buôn dùng chung cho cả hai (S3b, Q18).
 */
const cargoPrice = (ce: CountyEconomy, cargo: Cargo): number => (cargo === 'grain' ? ce.price : ce.goods[GOODS.indexOf(cargo)]!.price);
const cargoStock = (ce: CountyEconomy, cargo: Cargo): number => (cargo === 'grain' ? ce.grain : ce.goods[GOODS.indexOf(cargo)]!.stock);
function moveStock(ce: CountyEconomy, cargo: Cargo, qty: number): void {
  if (cargo === 'grain') ce.grain += qty;
  else ce.goods[GOODS.indexOf(cargo)]!.stock += qty;
}
const UNITS = GRAIN_PER_DOU;

/** Lời mỗi đấu (mỗi phần) nếu chở từ đầu tới cuối lộ trình lúc này: giá niêm yết nơi bán − nơi mua − phí chở. */
export function haulMargin(eco: EconomyState, logic: RegionLogic, route: readonly number[], cargo: Cargo = 'grain'): number {
  const from = eco.counties[route[0]!]!, to = eco.counties[route.at(-1)!]!;
  return cargoPrice(to, cargo) - cargoPrice(from, cargo) - routeTransport(logic, route);
}

/** Hội viên thương hội: hội người chơi đã vào, còn sống; null nếu không. */
export function guildOf(fw: FactionWorldState, career: CareerState | null | undefined): FactionState | null {
  if (!career?.faction) return null;
  return fw.list.find((f) => f.id === career.faction && f.kind === 'guild' && f.ended === null) ?? null;
}

/** Khóa lúc khởi hành (giữa chuyến không xét lại): đủ vốn tối thiểu, chuyến có lời. Lời đổi theo giá nên là khóa tạm. */
export function haulLock(c: CharacterState, eco: EconomyState, route: readonly number[], logic: RegionLogic, cargo: Cargo = 'grain'): string | null {
  if (c.household.money < HAUL_MIN_CAPITAL) return 'lock.money';
  return haulMargin(eco, logic, route, cargo) > 0 ? null : 'lock.no_profit';
}

export interface HaulWorld {
  eco: EconomyState;
  logic: RegionLogic;
  factions: FactionWorldState;
  roads: readonly number[] | null;
  career: CareerState | null;
  rng: Rng;
}
/** `grain`: số thăng lương hay số phân hàng đã mua. */
export interface HaulResult { grain: number; cost: number; revenue: number; cut: number; loss: 'robbed' | 'spoiled' | null }

/** Hàng (không phải lương) bị cướp chặn (S3b, Q18): băng bán tháo ở chợ quận sào huyệt, quỹ quận ấy trả nửa giá vào kho băng. */
export const ROBBED_GOODS_PCT = 50;

/**
 * Một chuyến buôn, tính trọn lúc khởi hành (các ô sau chỉ là đường đi): mua ở quận nguồn theo giá niêm yết, trả phí chở
 * (phu, xe) cho quận nguồn, rút một lần rủi ro vốn, bán phần còn lại ở quận đích theo giá niêm yết (không quá quỹ quận
 * ấy). Hội viên theo đoàn: rủi ro một nửa, nộp phần lời cho kho hội. Lương đi đúng dòng: kho quận nguồn → quận đích.
 */
/**
 * Một chuyến nếu đường êm, tính lúc này không rút RNG (chuyến thật và bảng chuyến buôn F3b dùng chung): mua bao nhiêu
 * (thăng hay phân) theo vốn bậc, 5% kho quận nguồn, quỹ quận đích; tiền mua cả phí chở; tiền bán ở quận đích.
 */
export function haulEstimate(money: number, career: CareerState | null, eco: EconomyState, logic: RegionLogic, route: readonly number[], cargo: Cargo = 'grain'): { units: number; perUnit: number; sellAt: number; cost: number; revenue: number } {
  const from = eco.counties[route[0]!]!, to = eco.counties[route.at(-1)!]!;
  const capital = Math.min(money, HAUL_CAPITAL[rankStep(career, 'merchant')]);
  const perUnit = Math.max(1, cargoPrice(from, cargo) + routeTransport(logic, route)), sellAt = cargoPrice(to, cargo);
  const units = Math.max(0, Math.min(idiv(capital * UNITS, perUnit), idiv(cargoStock(from, cargo) * HAUL_SHARE_PERMILLE, 1000), idiv(to.money * UNITS, Math.max(1, sellAt))));
  return { units, perUnit, sellAt, cost: idiv(units * perUnit, UNITS), revenue: Math.min(to.money, idiv(units * sellAt, UNITS)) };
}

export function haulTrip(c: CharacterState, preview: TravelPreview, w: HaulWorld, log: Log, cargo: Cargo = 'grain'): HaulResult {
  const h = c.household, route = preview.route;
  const from = w.eco.counties[route[0]!]!, to = w.eco.counties[route.at(-1)!]!;
  const plan = haulEstimate(h.money, w.career, w.eco, w.logic, route, cargo);
  const grain = plan.units, sellAt = plan.sellAt;
  const res: HaulResult = { grain, cost: 0, revenue: 0, cut: 0, loss: null };
  if (grain === 0) return res;
  res.cost = plan.cost;
  h.money -= res.cost; from.money += res.cost;
  moveStock(from, cargo, -grain);
  // Rủi ro vốn: rút một lần mỗi chuyến dù đường sạch hay không
  const guild = guildOf(w.factions, w.career);
  const bandits = routeDanger(w.factions, w.logic, route);
  const ppm = mulDiv(bandits ? HAUL_ROBBED_PPM : mulDiv(HAUL_MISHAP_PPM, routeRiskPct(w.logic, route, w.roads), 100), guild ? CARAVAN_RISK_PCT : 100, 100);
  let load = grain;
  if (w.rng.chance(ppm)) {
    if (bandits) {
      const band = w.factions.list.find((f) => f.id === bandits)!;
      if (cargo === 'grain') band.grain += load;
      else {
        // Hàng bán tháo ở chợ sào huyệt: hàng vào kho quận, quỹ quận trả nửa giá vào kho băng (quỹ thiếu thì trả được bao nhiêu)
        const seat = w.eco.counties[band.seat]!;
        const paid = Math.min(seat.money, mulDiv(idiv(load * cargoPrice(seat, cargo), UNITS), ROBBED_GOODS_PCT, 100));
        seat.money -= paid; band.money += paid;
        moveStock(seat, cargo, load);
      }
      load = 0;
      res.loss = 'robbed';
    } else {
      load -= mulDiv(load, HAUL_SPOIL_PCT, 100);
      res.loss = 'spoiled';
    }
  }
  res.revenue = Math.min(to.money, idiv(load * sellAt, UNITS));
  to.money -= res.revenue; h.money += res.revenue;
  moveStock(to, cargo, load);
  const profit = res.revenue - res.cost;
  if (guild && profit > 0) {
    res.cut = mulDiv(profit, caravanCutPct(CARAVAN_CUT_PCT, guild), 100);
    h.money -= res.cut; guild.money += res.cut;
  }
  const place = w.logic.counties[route.at(-1)!]?.name ?? 'place.unknown';
  const net = profit - res.cut;
  if (res.loss) log({ key: `log.haul.${res.loss}`, params: { place, coin: Math.max(0, -net) }, importance: 'major' });
  else if (cargo === 'grain') log({ key: net >= 0 ? 'log.haul.profit' : 'log.haul.loss', params: { place, dou: idiv(grain, GRAIN_PER_DOU), coin: Math.abs(net) }, importance: 'minor' });
  else log({ key: net >= 0 ? 'log.haul.goods_profit' : 'log.haul.goods_loss', params: { place, good: `good.${cargo}`, qty: idiv(grain, UNITS), coin: Math.abs(net) }, importance: 'minor' });
  return res;
}

export interface GuildJoinWorld {
  npcs: NpcWorldState;
  bonds: Bond[];
  factions: FactionWorldState;
  reputation: readonly number[];
  career: CareerState | null;
  tick: Tick;
  rng: Rng;
}

const personOf = (w: Pick<GuildJoinWorld, 'npcs'>, slot: PlanSlot): NpcState | null =>
  (slot.person === undefined ? null : lookup(w.npcs).get(slot.person) ?? null);
/** Thương hội mà một NPC là hội viên. */
const guildOfMember = (fw: FactionWorldState, id: string): FactionState | null =>
  fw.list.find((f) => f.kind === 'guild' && f.ended === null && f.members.includes(id)) ?? null;
/** Từ bậc này thương nhân mới xin vào hội được (Q4: hội nhận người đã buôn được). */
export const GUILD_MIN_RANK = 'journeyman';
/** Người lạ phải quen biết mới đứng ra bảo lãnh (như xin học việc). */
const SPONSOR_MIN_CLOSENESS = 20;

/** Khóa của ô xin vào thương hội: nhờ một hội viên cùng quận bảo lãnh; thương nhân từ bậc làm được, đủ tiền góp. */
export function joinGuildLock(slot: PlanSlot, c: CharacterState, w: Omit<GuildJoinWorld, 'rng'>): string | null {
  const n = personOf(w, slot);
  if (!n || n.death || n.character.location !== c.location) return 'lock.person_away';
  if (!hasRank(w.career, 'merchant', GUILD_MIN_RANK)) return 'lock.career';
  const g = guildOfMember(w.factions, n.id);
  if (!g) return 'lock.not_guild';
  if (w.career!.faction === g.id) return 'lock.member';
  if (isHostile(g)) return 'lock.hostile';
  if (!kinRole(c, n) && (w.bonds.find((b) => b.id === n.id)?.closeness ?? 0) < SPONSOR_MIN_CLOSENESS) return 'lock.stranger';
  return c.household.money < GUILD_DUES ? 'lock.money' : null;
}

/**
 * Một ô xin vào thương hội (khóa đã xét lúc đầu tuần): rút một lần trên luồng `social` theo quan hệ với người bảo lãnh,
 * như xin học việc. Nhận thì góp vốn vào kho hội, thân phận nghề ghi hội; từ chối thì thân thiết −2.
 */
export function joinGuild(slot: PlanSlot, c: CharacterState, w: GuildJoinWorld, log: Log): void {
  const n = personOf(w, slot);
  const g = n ? guildOfMember(w.factions, n.id) : null;
  if (!n || !g || !w.career) return;
  const rep = repAt(w.reputation, c.location);
  const b = ensureBond(w.bonds, n.id, rep);
  if (!w.rng.chance(acceptPpm(b, rep, kinRole(c, n) !== null))) {
    b.closeness = Math.max(0, b.closeness - 2);
    log({ key: 'log.guild.refused', params: { name: n.character.name }, importance: 'major' });
    return;
  }
  const dues = Math.min(GUILD_DUES, c.household.money);
  c.household.money -= dues; g.money += dues;
  w.career.faction = g.id;
  shiftAttitude(g, JOIN_ATTITUDE);
  log({ key: 'log.guild.join', params: { name: n.character.name, coin: dues }, importance: 'major' });
}
