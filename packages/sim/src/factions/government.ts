// Quan phủ (v0.6, ADR 0019 Q3, Q7, Q8): một mỗi vùng, trị sở ở thành, ban đầu giữ mọi quận. S1: kho nhận phần thuế đã có,
// chi ở trị sở. S5: thuế dân nền, quan và độ tham, sai dịch (NPC `official`), phát chẩn, tiễu phỉ, mất quận khi gia tộc
// hay băng cướp mạnh hơn (cát cứ), lấy lại khi mạnh lên. Thuần, tất định, số nguyên; RNG luồng `factions`.
import { ageYearsAt, CAREER_RANKS, GRAIN_PER_DOU, TICKS_PER_YEAR, type Tick } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { idiv, mulDiv } from '../core/math';
import type { Rng } from '../core/rng';
import { buyPrice, supplyOf, type EconomyState } from '../economy/market';
import { hasCondition, type CharacterState } from '../life/character';
import { accidentFatalPpm, pickInjury, startCondition, type Death } from '../life/health';
import { COMING_OF_AGE } from '../life/household';
import { INJURIES } from '../life/params';
import { skillRiskPct } from '../life/skills';
import { PLAYER_ID } from '../npc/family';
import { baseOccupation, die, type DeathContext } from '../npc/lifecycle';
import type { NpcState, NpcWorldState } from '../npc/state';
import type { FactionPlayer, FactionState, FactionWorldState } from './state';
import { wageAttitudePct } from './attitude';

/**
 * Phần thuế quận nộp lên quan phủ (Q3: một nửa). Thuế đinh (tiền) và thuế điền (lương) vốn vào quỹ, kho quận; quận
 * ghi số đã thu trong quý (`taxMoney`, `taxGrain`), đầu quý sau quan phủ lấy phần mình từ các quận nó giữ.
 */
export const GOV_TAX_SHARE_PCT = 50;
/**
 * Thuế dân nền (S5, chủ dự án chọn): đầu năm mỗi quận quan phủ giữ nộp chừng ấy ‰ quỹ quận — 7‰ với quan thanh liêm nhất,
 * thêm tới 8‰ theo độ tham (quan tham nhất 15‰; trung bình khoảng 10‰ ≈ 1 văn mỗi miệng ăn).
 */
export const GOV_BASE_TAX_PERMILLE = 7;
export const GOV_GREED_TAX_PERMILLE = 8;
/**
 * Chi nha môn mỗi quý (%): lương quan lại, lính, phu dịch, sửa sang thành — tiêu ở trị sở, vào quỹ, kho quận trị sở.
 * Không có dòng ra này thì tiền, lương dồn mãi vào kho quan.
 */
export const GOV_SPEND_PCT = 25;
/** Quan nhậm chức từ 6 tới 12 năm rồi thay; độ tham mỗi quan rút 0–100 (Q7). Từ 67 là quan tham, dưới 34 thanh liêm. */
export const MAGISTRATE_TERM_YEARS: readonly [number, number] = [6, 12];
export const GREEDY_FROM = 67;
export const HONEST_BELOW = 34;
/** Sai dịch (Q9): một người cho trị sở cộng một người mỗi 3 quận giữ, tối đa 6; lương mỗi quý từ kho (75 văn/tuần, hơn làm thuê). */
export const OFFICIALS_MAX = 6;
export const OFFICIAL_WAGE = 900;
/** Tuyển thêm khi kho đủ trả chừng ấy quý lương cho cả đội; kho không đủ một quý thì cho nghỉ người tuyển sau cùng. */
export const OFFICIAL_HIRE_QUARTERS = 4;
export const OFFICIAL_AGE: readonly [number, number] = [18, 45];
/**
 * Thay người kém (v0.7 S4, chủ dự án chọn): mỗi quý, ứng viên giỏi nhất chưa được tuyển (chữ + võ) hơn sai dịch kém nhất
 * từ chừng ấy điểm thì thay người ấy; người bị thay về nghề cũ. Người chơi ứng tuyển, bị thay cùng luật.
 */
export const OFFICIAL_REPLACE_MARGIN = 500;
/**
 * Lương sai dịch theo bậc của người chơi (%): học việc, làm được, có tiếng. NPC không có bậc nên lương lệ. v0.7 S9 (hướng
 * A): 85 / 95 / 110% (S4 là 100 / 120 / 150%): lương lính đủ sống mà không giàu bằng thợ, buôn — cái được của nghề là chỗ
 * đứng ở nha môn, cái giá là đi tuần, theo trận.
 */
export const OFFICIAL_RANK_PCT = [85, 95, 110] as const;
/**
 * Nợ lương (v0.7 S4, Q5): quan tham (từ `GREEDY_FROM`) giữ lại (độ tham − 50)% lương mỗi quý — 17 tới 50% — ghi nợ
 * từng người; quan không tham thì trả hết nợ cũ cùng lương quý. Người thôi việc thì mất phần nợ (tiền ở lại kho).
 */
export const ARREARS_FROM = 50;
/**
 * Thương vong mỗi trận tiễu phỉ (v0.7 S4, Q5), cho mọi người tham chiến hai bên: bị thương (ppm) bên thắng, bên thua —
 * nhân theo võ nghệ như tai nạn. Bị thương thì có thể chết ngay như tai nạn (`accidentFatalPpm`); bên thua bị thương nặng.
 */
export const BATTLE_WOUND_PPM = [50_000, 200_000] as const;
/** Phát chẩn: mỗi quận đói kém, quan phủ chi tới 20% kho × (100 − độ tham)% mua lương ở quận rẻ nhất mình giữ chở sang. */
export const RELIEF_PCT = 20;
/** Tiễu phỉ: mỗi quý mỗi băng, quan đi tiễu với xác suất (1000 − 10 × độ tham)‰; phí mỗi trận mỗi sai dịch vào quỹ trị sở. */
export const CAMPAIGN_COST = 200;
/** Đọ thế (Q8): sai dịch giá như một người (2.000) + võ nghệ; kho góp tới chừng ấy văn mỗi trận. Núi: thế cướp ×2. */
export const CAMPAIGN_CHEST = 20_000;
export const PERSON_VALUE = 2_000;
export const MOUNTAIN_EDGE_PCT = 200;
/**
 * Uy quan phủ ở mỗi quận (văn tương đương): phép nước, lính tráng ngoài sai dịch có tên. Quan tham thì uy giảm, tới một
 * nửa. Không có phần này thì sức quan phủ chỉ là kho, mà kho phập phồng theo mùa thuế: đo ở S5, ngưỡng cát cứ dao động
 * từng quý, quận đổi người giữ tới 15 lần trong 10 năm.
 */
export const GOV_PRESENCE = 150_000;
/**
 * Cát cứ của gia tộc (Q7): họ đứng đầu một quận quan phủ giữ, uy thế vượt chừng ấy lần sức quan phủ ở quận ấy thì chiếm
 * quận; giữ tới khi tàn hay uy thế tụt dưới một nửa ngưỡng ấy (quan phủ lấy lại).
 */
export const CLAN_REVOLT_MULT = 4;
/** Cướp thắng trận mà thế gấp chừng ấy lần quan phủ thì chiếm quận sào huyệt. */
export const BANDIT_SEIZE_MULT = 2;

/** Sức quan phủ ở mỗi quận nó giữ: uy (giảm theo độ tham) cộng thế đọ được chia đều các quận. */
export function governmentAuthority(f: FactionState, byId: ReadonlyMap<string, NpcState>, soldier: CharacterState | null = null): number {
  return mulDiv(GOV_PRESENCE, 200 - f.greed, 200) + idiv(governmentForce(f, byId, soldier), Math.max(1, f.counties.length));
}

/** Trị sở quan phủ: thành của vùng; vùng không có thành (đời thử một quận) thì trấn đầu tiên, rồi quận 0. */
export function governmentSeat(logic: RegionLogic): number {
  const kinds = logic.settlementKind;
  const city = kinds.indexOf('city');
  if (city >= 0) return city;
  const town = kinds.indexOf('town');
  return town >= 0 ? town : 0;
}

/** Lập quan phủ lúc thế giới bắt đầu: giữ mọi quận, kho trống. Quan đầu tiên nhậm chức ở pha Thế lực đầu tiên. */
export function foundGovernment(fw: FactionWorldState, logic: RegionLogic, tick: Tick): FactionState {
  const seat = governmentSeat(logic);
  const f: FactionState = {
    id: `f${fw.nextId++}`, kind: 'government',
    name: { key: 'faction.government.name', params: { place: logic.counties[seat]!.name ?? 'place.unknown' } },
    seat, counties: logic.counties.map((_, i) => i), holds: [], roads: [], members: [], leader: null, power: 0, losses: 0, greed: 0, termEnds: tick,
    relations: [], money: 0, grain: 0, founded: tick, ended: null,
  };
  fw.list.push(f);
  return f;
}

/** Mức thuế dân nền (‰ quỹ quận mỗi năm) theo độ tham. */
export const baseTaxPermille = (greed: number) => GOV_BASE_TAX_PERMILLE + idiv(greed * GOV_GREED_TAX_PERMILLE, 100);

/**
 * Đầu quý: quan phủ thu thuế các quận nó giữ — phần thuế đinh, thuế điền đã ghi trong quý (S1); đầu năm thêm thuế dân
 * nền (S5). Quận cạn thì lấy được bao nhiêu hay bấy nhiêu.
 */
export function governmentTaxes(f: FactionState, eco: EconomyState, tick: Tick): void {
  const yearStart = tick % TICKS_PER_YEAR === 0;
  for (const c of f.counties) {
    const ce = eco.counties[c]!;
    let money = mulDiv(ce.taxMoney, GOV_TAX_SHARE_PCT, 100);
    if (yearStart) money += idiv(ce.money * baseTaxPermille(f.greed), 1000);
    money = Math.min(ce.money, money);
    const grain = Math.min(ce.grain, mulDiv(ce.taxGrain, GOV_TAX_SHARE_PCT, 100));
    ce.money -= money; f.money += money;
    ce.grain -= grain; f.grain += grain;
  }
}

/**
 * Mức thuế đinh, thuế điền quan phủ đặt (%; v0.6 S6, Q7): 50 + độ tham — quan thanh liêm nhất thuế đinh 100 văn, tham
 * nhất 300 văn; trung bình bằng lệ cũ 200 văn. Thuế điền lệch một nửa (`landTax`).
 */
export const taxPctOf = (greed: number): number => 50 + greed;

/** Cuối pha Thế lực: quận quan phủ giữ theo mức của quan đương nhiệm; quận cát cứ (hay vùng không có quan phủ) giữ lệ cũ. */
export function setTaxRates(f: FactionState | null, eco: EconomyState): void {
  for (const ce of eco.counties) ce.taxPct = 100;
  if (f) for (const c of f.counties) eco.counties[c]!.taxPct = taxPctOf(f.greed);
}

/** Chi nha môn ở trị sở: một phần kho tiền, lương mỗi quý. */
export function governmentSpend(f: FactionState, eco: EconomyState): void {
  const seat = eco.counties[f.seat]!;
  const money = mulDiv(f.money, GOV_SPEND_PCT, 100);
  const grain = mulDiv(f.grain, GOV_SPEND_PCT, 100);
  f.money -= money; seat.money += money;
  f.grain -= grain; seat.grain += grain;
}

/** Thế của quan phủ để đọ (Q8): mỗi sai dịch một người cộng võ nghệ (cả người chơi làm sai dịch, v0.7 S4), cộng phần kho góp cho một trận. */
export function governmentForce(f: FactionState, byId: ReadonlyMap<string, NpcState>, soldier: CharacterState | null = null): number {
  return f.members.reduce((s, id) => s + PERSON_VALUE + byId.get(id)!.character.skillXp.martial, 0) + (soldier ? PERSON_VALUE + soldier.skillXp.martial : 0) + Math.min(f.money, CAMPAIGN_CHEST);
}

/** Thế cướp ở sào huyệt: núi rừng có lợi cho cướp (Q8). */
export function banditForce(b: FactionState, logic: RegionLogic): number {
  const mountain = logic.adjacency.some(([x, y], k) => (x === b.seat || y === b.seat) && logic.terrainPct[k]! >= MOUNTAIN_EDGE_PCT);
  return mountain ? 2 * b.power : b.power;
}

const idNum = (id: string) => Number(id.slice(1));

/** Thay quan khi hết nhiệm kỳ: độ tham mới, nhiệm kỳ mới (Q7). */
function magistrate(f: FactionState, tick: Tick, rng: Rng): void {
  if (tick < f.termEnds) return;
  f.greed = rng.int(0, 100);
  f.termEnds = tick + rng.int(MAGISTRATE_TERM_YEARS[0], MAGISTRATE_TERM_YEARS[1]) * TICKS_PER_YEAR;
}

/** Điểm tuyển sai dịch: chữ + võ (người biết chữ, có võ trước). */
export const officialScore = (c: CharacterState): number => c.skillXp.literacy + c.skillXp.martial;
/** Định biên: một người cho trị sở cộng một người mỗi 3 quận giữ, tối đa `OFFICIALS_MAX`. */
export const officialTarget = (f: FactionState): number => Math.min(OFFICIALS_MAX, 1 + idiv(f.counties.length, 3));
/** Còn chỗ và kho đủ trả lương thêm một người trong `OFFICIAL_HIRE_QUARTERS` quý. */
export const canHire = (f: FactionState, roster: number): boolean => roster < officialTarget(f) && f.money >= OFFICIAL_WAGE * (roster + 1) * OFFICIAL_HIRE_QUARTERS;
/** Sai dịch NPC kém nhất (bằng điểm: id lớn, người tuyển sau); null khi không có ai. */
export function weakestOfficial(f: FactionState, byId: ReadonlyMap<string, NpcState>): NpcState | null {
  let weak: NpcState | null = null;
  for (const id of f.members) {
    const n = byId.get(id);
    if (n && n.death === null && (weak === null || officialScore(n.character) <= officialScore(weak.character))) weak = n;
  }
  return weak;
}
/** Người chơi đang là sai dịch của quan phủ này (v0.7 S4). */
export const isSoldierOf = (f: FactionState, p: FactionPlayer | null): boolean => !!p && p.character.alive && p.career?.id === 'soldier' && p.career.faction === f.id;
/** Cho một sai dịch NPC thôi việc: về nghề cũ; phần lương nợ mất (dọn lúc trả lương). */
export function releaseOfficial(f: FactionState, n: NpcState, logic: RegionLogic): void {
  n.occupation = baseOccupation(n.character, logic);
  f.members = f.members.filter((id) => id !== n.id);
}

/** Người chơi sai dịch trong quý: còn ở nha môn không (bị cho nghỉ, bị thay), chết trận. */
export interface SoldierReport { left: 'dismissed' | 'replaced' | null; death: Death | null }
/** Người chơi theo cướp (v0.7 S6) trong trận tiễu băng mình: bị bắt (mất nửa túi vào kho quan phủ), hay chết trận. */
export interface OutlawReport { caught: boolean; fine: number; death: Death | null }
/** Quan phủ thắng thì bắt nửa đảng: người chơi trong đảng bị bắt với xác suất này (ppm), túi bị tịch thu một nửa (Q8). */
export const OUTLAW_CAUGHT_PPM = 500_000;
export const OUTLAW_FINE_PCT = 50;
const isOutlawOf = (b: FactionState, p: FactionPlayer | null): boolean => !!p && p.character.alive && p.career?.id === 'outlaw' && p.career.faction === b.id;

/**
 * Sai dịch: bỏ người mất, cho nghỉ người kém nhất khi kho không đủ một quý lương (S4: trước là người tuyển sau cùng — đổi
 * cho khớp luật thay người kém, kẻo người vừa nghỉ lại thay ngay người kém hơn), tuyển thêm ở trị sở khi kho đủ, thay
 * người kém (S4); trả lương quý, quan tham nợ lương. Người chơi bằng điểm thì đi trước. Người làm ruộng, làm thuê, săn mới
 * được tuyển (người trong gia tộc cũng được).
 */
function officials(f: FactionState, npcs: NpcWorldState, byId: ReadonlyMap<string, NpcState>, logic: RegionLogic, tick: Tick, player: FactionPlayer | null, out: SoldierReport): void {
  f.members = f.members.filter((id) => { const n = byId.get(id); return n !== undefined && n.death === null && n.occupation === 'official'; });
  let mine = isSoldierOf(f, player);
  const roster = () => f.members.length + (mine ? 1 : 0);
  while (roster() > 0 && f.money < OFFICIAL_WAGE * roster()) {
    const weak = weakestOfficial(f, byId);
    if (mine && (!weak || officialScore(player!.character) <= officialScore(weak.character))) { mine = false; out.left = 'dismissed'; continue; }
    releaseOfficial(f, weak!, logic);
  }
  const pool = npcs.people.filter((n) => {
    const c = n.character, age = ageYearsAt(c.birthTick, tick);
    return n.death === null && c.home === f.seat && c.household.independent && age >= Math.max(COMING_OF_AGE, OFFICIAL_AGE[0]) && age <= OFFICIAL_AGE[1]
      && (n.occupation === 'farmer' || n.occupation === 'laborer' || n.occupation === 'hunter');
  });
  // Người biết chữ, có võ trước (bằng nhau: id nhỏ)
  pool.sort((a, b) => officialScore(b.character) - officialScore(a.character) || idNum(a.id) - idNum(b.id));
  let next = 0;
  for (; next < pool.length && canHire(f, roster()); next++) {
    pool[next]!.occupation = 'official';
    f.members.push(pool[next]!.id);
  }
  // Thay người kém (S4): một người mỗi quý; người chơi bằng điểm thì tính là người tuyển sau cùng, bị thay trước
  const cand = pool[next];
  const weak = weakestOfficial(f, byId);
  const mineScore = mine ? officialScore(player!.character) : Number.MAX_SAFE_INTEGER;
  const weakScore = Math.min(weak ? officialScore(weak.character) : Number.MAX_SAFE_INTEGER, mineScore);
  if (cand && roster() > 0 && officialScore(cand.character) >= weakScore + OFFICIAL_REPLACE_MARGIN) {
    if (mineScore === weakScore) { mine = false; out.left = 'replaced'; } else releaseOfficial(f, weak!, logic);
    cand.occupation = 'official';
    f.members.push(cand.id);
  }
  f.members.sort((a, b) => idNum(a) - idNum(b));
  // Lương quý (người chơi id n0 trước): quan tham giữ lại một phần, ghi nợ; quan không tham trả cả nợ cũ
  const ids = [...(mine ? [PLAYER_ID] : []), ...f.members];
  const owed = new Map((f.owed ?? []).map((x) => [x.id, x.coin]));
  const withheld = f.greed >= GREEDY_FROM ? f.greed - ARREARS_FROM : 0;
  const kept: { id: string; coin: number }[] = [];
  for (const id of ids) {
    const isMe = id === PLAYER_ID;
    // Người chơi: lương theo bậc và theo thái độ quan phủ (S7, ±10%)
    const wage = isMe ? mulDiv(mulDiv(OFFICIAL_WAGE, OFFICIAL_RANK_PCT[CAREER_RANKS.indexOf(player!.career!.rank)]!, 100), wageAttitudePct(f), 100) : OFFICIAL_WAGE;
    const old = owed.get(id) ?? 0;
    const due = wage - mulDiv(wage, withheld, 100) + (withheld > 0 ? 0 : old);
    const pay = Math.min(f.money, due);
    const debt = (withheld > 0 ? old + mulDiv(wage, withheld, 100) : 0) + due - pay;
    (isMe ? player!.character.household : byId.get(id)!.character.household).money += pay;
    f.money -= pay;
    if (debt > 0) kept.push({ id, coin: debt });
    if (isMe) {
      player!.log({ key: 'log.soldier.wage', params: { coin: pay }, importance: 'minor' });
      if (debt > 0) player!.log({ key: 'log.soldier.owed', params: { coin: debt }, importance: 'minor' });
      else if (withheld === 0 && old > 0) player!.log({ key: 'log.soldier.repaid', params: { coin: old }, importance: 'major' });
    }
  }
  if (kept.length) f.owed = kept; else delete f.owed;
  const lead = f.members.map((id) => byId.get(id)!).reduce<NpcState | null>((best, n) => (best === null || n.character.skillXp.literacy > best.character.skillXp.literacy ? n : best), null);
  f.leader = lead?.id ?? null;
}

/**
 * Thương vong của một người tham chiến (S4): rút trên luồng `factions`; trả cái chết nếu có. Bên thua bị thương nặng (gãy
 * xương), bên thắng theo bảng thương tật; đang bị thương thì không thêm.
 */
export function battleWound(c: CharacterState, lost: boolean, tick: Tick, rng: Rng, log: FactionPlayer['log']): Death | null {
  if (!rng.chance(mulDiv(BATTLE_WOUND_PPM[lost ? 1 : 0], skillRiskPct(c, 'martial'), 100))) return null;
  if (rng.chance(accidentFatalPpm(c))) return { tick, cause: 'accident', detail: 'accident.battle' };
  if (!hasCondition(c, 'injury')) startCondition(c, lost ? INJURIES.find((d) => d.id === 'fracture')! : pickInjury(rng), 'injury', rng, log, ageYearsAt(c.birthTick, tick));
  return null;
}

const noLog: FactionPlayer['log'] = () => {};

/** Thương vong cả một bên sau trận: NPC chết thì mất (thừa kế như mọi người), bỏ khỏi danh sách. */
function casualties(f: FactionState, lost: boolean, byId: ReadonlyMap<string, NpcState>, eco: EconomyState, tick: Tick, rng: Rng, deaths: DeathContext): void {
  const dead: string[] = [];
  for (const id of f.members) {
    const n = byId.get(id)!;
    const death = battleWound(n.character, lost, tick, rng, noLog);
    if (death) { die(n, death, eco, deaths); dead.push(id); }
  }
  if (dead.length) f.members = f.members.filter((id) => !dead.includes(id));
}

/** Việc quan phủ làm trong quý (cho thống kê `world`, tin thế lực ở F3). */
export interface GovernmentReport {
  campaigns: number;
  wins: number;
  reliefGrain: number;
  /** Từng trận tiễu phỉ trong quý (F3: tin thế sự): băng bị tiễu, sào huyệt, thắng hay thua. */
  battles: { band: string; seat: number; won: boolean }[];
  /** Người chơi làm sai dịch của quan phủ này (v0.7 S4); null khi không. */
  soldier: SoldierReport | null;
  /** Người chơi theo cướp mà băng mình bị tiễu trong quý (v0.7 S6); null khi không. */
  outlaw: OutlawReport | null;
}

/** Phát chẩn: quận đói kém quan phủ giữ được mua lương ở quận rẻ nhất quan phủ giữ (không đói kém) chở sang. */
function relief(f: FactionState, eco: EconomyState, report: GovernmentReport): void {
  for (const c of f.counties) {
    const famished = eco.counties[c]!;
    if (supplyOf(famished) !== 'famine') continue;
    let cheap = -1;
    for (const d of f.counties) if (d !== c && supplyOf(eco.counties[d]!) !== 'famine' && (cheap < 0 || buyPrice(eco.counties[d]!) < buyPrice(eco.counties[cheap]!))) cheap = d;
    if (cheap < 0) continue;
    const market = eco.counties[cheap]!;
    const budget = mulDiv(mulDiv(f.money, RELIEF_PCT, 100), 100 - f.greed, 100);
    const grain = Math.min(market.grain, idiv(budget * GRAIN_PER_DOU, Math.max(1, buyPrice(market))));
    const cost = idiv(grain * buyPrice(market), GRAIN_PER_DOU);
    if (grain <= 0) continue;
    f.money -= cost; market.money += cost;
    report.reliefGrain += grain;
    market.grain -= grain; famished.grain += grain;
  }
}

/**
 * Sau pha băng cướp: quan mới, sai dịch, phát chẩn, tiễu phỉ, cát cứ, rồi chi nha môn. Quan phủ giữ mọi quận không ai
 * cát cứ (`holds` của thế lực khác). `player`: người chơi (sai dịch thì lĩnh lương, theo trận — v0.7 S4); `deaths`: người
 * thừa kế khi NPC tử trận.
 */
export function governmentRule(f: FactionState, fw: FactionWorldState, eco: EconomyState, npcs: NpcWorldState, logic: RegionLogic, tick: Tick, rng: Rng, player: FactionPlayer | null = null, deaths: DeathContext | null = null): GovernmentReport {
  const was = isSoldierOf(f, player);
  const out: SoldierReport = { left: null, death: null };
  const report: GovernmentReport = { campaigns: 0, wins: 0, reliefGrain: 0, battles: [], soldier: was ? out : null, outlaw: null };
  const byId = new Map(npcs.people.map((n) => [n.id, n]));
  const ctx = deaths ?? { world: npcs, player: null };
  magistrate(f, tick, rng);
  officials(f, npcs, byId, logic, tick, player, out);
  relief(f, eco, report);
  const me = () => (was && out.left === null && out.death === null ? player!.character : null);

  // Tiễu phỉ (Q8): mỗi băng một lần đọ; quan tham ít đi tiễu. Người chơi sai dịch theo mọi trận (S4)
  for (const b of fw.list) {
    const roster = f.members.length + (me() ? 1 : 0);
    if (b.kind !== 'bandits' || b.ended !== null || roster === 0) continue;
    if (rng.int(0, 999) >= 1000 - 10 * f.greed) continue;
    const cost = Math.min(f.money, CAMPAIGN_COST * roster);
    f.money -= cost; eco.counties[f.seat]!.money += cost;
    const gov = governmentForce(f, byId, me()), bandit = banditForce(b, logic);
    report.campaigns++;
    const won = rng.int(0, gov + bandit - 1) < gov;
    report.battles.push({ band: b.id, seat: b.seat, won });
    // Thương vong hai bên (S4): sai dịch, người chơi, rồi người theo cướp
    casualties(f, !won, byId, eco, tick, rng, ctx);
    const soldier = me();
    if (soldier) {
      player!.log({ key: won ? 'log.soldier.won' : 'log.soldier.lost', params: { place: logic.counties[b.seat]!.name ?? 'place.unknown' }, importance: 'major' });
      out.death = battleWound(soldier, !won, tick, rng, player!.log);
    }
    casualties(b, won, byId, eco, tick, rng, ctx);
    // Người chơi theo cướp (S6): đánh bên băng mình; thua thì có thể bị bắt cùng nửa đảng
    if (isOutlawOf(b, player)) {
      const p = player!.character;
      const outlaw: OutlawReport = { caught: false, fine: 0, death: battleWound(p, won, tick, rng, player!.log) };
      player!.log({ key: won ? 'log.outlaw.lost' : 'log.outlaw.won', params: { place: logic.counties[b.seat]!.name ?? 'place.unknown' }, importance: 'major' });
      if (won && !outlaw.death && rng.chance(OUTLAW_CAUGHT_PPM)) {
        outlaw.caught = true;
        outlaw.fine = mulDiv(p.household.money, OUTLAW_FINE_PCT, 100);
        p.household.money -= outlaw.fine; f.money += outlaw.fine;
      }
      report.outlaw = outlaw;
    }
    if (won) {
      report.wins++;
      // Thắng: bắt nửa đảng (người bị bắt về nghề cũ), tịch thu kho, lấy lại quận
      const caught = b.members.splice(0, idiv(b.members.length + 1, 2));
      for (const id of caught) { const n = byId.get(id)!; n.occupation = baseOccupation(n.character, logic); }
      f.money += b.money; f.grain += b.grain; b.money = b.grain = 0;
      b.holds = []; b.counties = [];
      b.power = b.members.reduce((s, id) => s + PERSON_VALUE + byId.get(id)!.character.skillXp.martial, 0);
    } else {
      // Thua: một sai dịch NPC bỏ đi; cướp mạnh hơn hẳn thì chiếm quận sào huyệt
      const id = f.members.pop();
      if (id !== undefined) { const n = byId.get(id)!; n.occupation = baseOccupation(n.character, logic); }
      if (bandit > BANDIT_SEIZE_MULT * gov && !b.holds.includes(b.seat)) { b.holds = [b.seat]; b.counties = [b.seat]; }
    }
  }

  // Cát cứ của gia tộc (Q7): họ đứng đầu quận vượt hẳn sức quan phủ thì chiếm; tụt dưới nửa ngưỡng thì quan phủ lấy lại
  const threshold = CLAN_REVOLT_MULT * governmentAuthority(f, byId, me());
  for (const c of fw.list) {
    if (c.kind !== 'clan' || c.ended !== null) continue;
    for (const county of c.counties) if (!c.holds.includes(county) && f.counties.includes(county) && c.power > threshold) c.holds.push(county);
    c.holds = c.holds.filter(() => 2 * c.power >= threshold).sort((a, b) => a - b);
  }

  // Quan phủ giữ mọi quận không ai cát cứ
  const held = new Set<number>();
  for (const x of fw.list) if (x !== f && x.ended === null) for (const county of x.holds) held.add(county);
  f.counties = logic.counties.map((_, i) => i).filter((i) => !held.has(i));
  f.power = governmentForce(f, byId, me());
  governmentSpend(f, eco);
  return report;
}
