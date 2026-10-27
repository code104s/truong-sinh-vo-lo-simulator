// Vòng đời dân số NPC (ADR 0016, v0.4 S4): sinh để giữ hạn mức, dọn người đã mất, lập thân lúc 16 tuổi, nghề đổi theo
// kỹ năng (thầy đồ, thầy thuốc, thương nhân nảy từ mô phỏng). Thuần, tất định.
import { ageYearsAt, birthplaceId, TICKS_PER_YEAR, type SettlementKind, type Tick } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { hash32 } from '../core/hash';
import { Rng } from '../core/rng';
import { TRADE_MIN_CAPITAL } from '../economy/income';
import type { EconomyState } from '../economy/market';
import { createCharacter, type CharacterState } from '../life/character';
import { agingPhase } from '../life/health';
import { becomeIndependent, COMING_OF_AGE } from '../life/household';
import { staminaMax } from '../life/stamina';
import { nearestTownFrom } from '../life/travel';
import { NPC_QUOTA, PHYSICIAN_PERSONALITIES } from './population';
import { allocateNpc, type NpcState, type NpcWorldState, type Occupation } from './state';

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

/** Đầu năm: dọn người đã mất quá một năm, sinh trẻ cho từng quận, xét lại nghề người lớn. Gọi trước pha tuần của NPC. */
export function npcYearStart(world: NpcWorldState, logic: RegionLogic, t: Tick, playerCounty: number | null): number {
  const regionId = world.regionId;
  world.people = world.people.filter((n) => alive(n) || n.death!.tick >= t - DEAD_KEEP_TICKS);
  let born = 0;
  logic.settlementKind.forEach((kind, county) => { born += birthsIn(world, logic, regionId, county, kind, t, playerCounty); });
  for (const n of world.people) if (alive(n)) refreshOccupation(n, world, logic, t);
  return born;
}

/** Số trẻ sinh năm nay ở một quận: nền + bù thiếu, rút theo RNG riêng của (đời, năm, quận) — không phụ thuộc thứ tự. */
function birthsIn(world: NpcWorldState, logic: RegionLogic, regionId: string, county: number, kind: SettlementKind, t: Tick, playerCounty: number | null): number {
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
    const c = createCharacter({ birthTick, birthplaceId: birthplaceId(`${regionId}/c${logic.counties[county]!.worldIndex}`), birthplaceKind: kind, county }, own, own);
    agingPhase(c, t);
    c.health = c.healthMax;
    c.stamina = staminaMax(c, t);
    world.people.push({ id, character: c, occupation: 'child', tier: county === playerCounty ? 'L0' : 'L1', rng: own.state(), death: null, plan: null, active: null, planWarned: false });
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
