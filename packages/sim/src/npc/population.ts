// Dân số NPC ban đầu (ADR 0016, v0.4 Q1): người có tên rút từ dân nền theo hạn mức mỗi quận, sinh đủ tuổi, xuất thân,
// nghề lúc đời người chơi bắt đầu. Toàn số nguyên, tất định theo seed gốc của đời.
import { birthplaceId, TICKS_PER_YEAR, type SettlementKind, type Tick } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { idiv } from '../core/math';
import { Rng } from '../core/rng';
import type { EconomyState } from '../economy/market';
import { createCharacter, lifespanCap, type CharacterState } from '../life/character';
import { agingPhase } from '../life/health';
import { becomeIndependent, COMING_OF_AGE } from '../life/household';
import { SKILL_XP_MAX, type Skill } from '../life/skills';
import { staminaMax } from '../life/stamina';
import { allocateNpc, type NpcState, type NpcWorldState, type Occupation } from './state';

/** Hạn mức người có tên mỗi quận theo loại nơi (Q1): tsvl-01 có 134 người, tsvl-03 có 282. */
export const NPC_QUOTA: Record<SettlementKind, number> = { village: 12, town: 20, city: 30 };

/** Tháp tuổi ban đầu: [tuổi thấp, tuổi cao, trọng số]. Khoảng 35% dưới 16 tuổi. */
export const AGE_BANDS: readonly (readonly [number, number, number])[] = [[0, 15, 35], [16, 29, 25], [30, 44, 20], [45, 59, 13], [60, 70, 7]];

/** Người già hơn thọ nguyên thì trẻ lại, chừa ít nhất ngần này năm trước khi hết thọ. */
const LIFESPAN_MARGIN_YEARS = 2;

/** Kỹ năng chính của mỗi nghề; kinh nghiệm ban đầu theo số năm đã làm (`XP_PER_WORK_YEAR`, tối đa `XP_START_MAX`). */
export const OCCUPATION_SKILL: Record<Exclude<Occupation, 'child'>, Skill> = {
  farmer: 'farming', laborer: 'crafting', hunter: 'hunting', teacher: 'literacy', physician: 'literacy', merchant: 'trade',
};
export const XP_PER_WORK_YEAR = 300;
export const XP_START_MAX = 9_000;
/** Ngưỡng "Thạo" (skills.ts): thầy thuốc, thương nhân, thợ săn ban đầu ít nhất ở mức này. */
const XP_PRACTICED = 1_000;

/** Tỉ lệ (‰) nghề phụ trong người lớn: làng có thợ săn; trấn, thành có thầy đồ, thương nhân. Còn lại là nghề chính của nơi. */
const HUNTER_PERMILLE = 150;
const TEACHER_PERMILLE = 100;
const MERCHANT_PERMILLE = 100;
/** Tính cách hợp nghề thầy thuốc (ADR 0016); mỗi trấn, thành tối đa một thầy thuốc. */
export const PHYSICIAN_PERSONALITIES: readonly string[] = ['righteous', 'kind', 'calm', 'loyal'];
const PHYSICIAN_MIN_AGE = 30;

/**
 * Kho dành dụm của người lớn lúc bắt đầu: một năm ăn, thêm 30 thăng mỗi năm đã tự lo từ 16 tuổi, tối đa ba năm ăn. S2:
 * NPC ra đời giữa chừng mà chỉ có phần chia lúc 16 tuổi thì đói ngay; người già không làm nổi thì sống bằng của dành dụm.
 */
export const START_RESERVE = 360;
export const START_RESERVE_PER_YEAR = 30;
export const START_RESERVE_MAX = 1_080;
export const startReserve = (age: number) => Math.min(START_RESERVE_MAX, START_RESERVE + Math.max(0, age - COMING_OF_AGE) * START_RESERVE_PER_YEAR);

export const npcQuota = (logic: RegionLogic): number[] => logic.settlementKind.map((k) => NPC_QUOTA[k]);

/** Kinh nghiệm nghề theo số năm đã làm từ 16 tuổi; nghề đặc biệt và thợ săn ít nhất "Thạo". */
function seedSkill(c: CharacterState, occupation: Occupation, age: number, tick: Tick): void {
  if (occupation === 'child') return;
  const skill = OCCUPATION_SKILL[occupation];
  const floor = occupation === 'farmer' || occupation === 'laborer' || occupation === 'teacher' ? 0 : XP_PRACTICED;
  const literateFloor = occupation === 'teacher' ? 4_000 : 0;
  c.skillXp[skill] = Math.min(SKILL_XP_MAX, XP_START_MAX, Math.max(floor, literateFloor, (age - COMING_OF_AGE) * XP_PER_WORK_YEAR));
  c.skillLastUsed[skill] = tick;
}

function pickOccupation(kind: SettlementKind, c: CharacterState, age: number, hasPhysician: boolean, r: Rng): Occupation {
  if (age < COMING_OF_AGE) return 'child';
  if (kind === 'village') return r.int(0, 999) < HUNTER_PERMILLE ? 'hunter' : 'farmer';
  if (!hasPhysician && age >= PHYSICIAN_MIN_AGE && PHYSICIAN_PERSONALITIES.includes(c.personality)) return 'physician';
  const roll = r.int(0, 999);
  if (roll < TEACHER_PERMILLE) return 'teacher';
  // Buôn bán cần vốn: nhà bần cùng không ra buôn
  if (roll < TEACHER_PERMILLE + MERCHANT_PERMILLE && c.background !== 'destitute') return 'merchant';
  return 'laborer';
}

/**
 * Sinh dân số ban đầu cho mọi quận, lúc đời người chơi bắt đầu (`tick`). Hạn mức trừ khỏi dân nền (`mouths`) để không
 * đếm hai lần. Người lớn ra riêng với phần chia lấy từ quỹ, kho quận nhà (sổ cái không đổi). `rng`: luồng `npc-world`.
 */
export function seedPopulation(world: NpcWorldState, eco: EconomyState, logic: RegionLogic, rng: Rng, tick: Tick, playerCounty: number | null): void {
  const regionId = world.regionId, lifeRoot = world.root;
  const weights = AGE_BANDS.map((b) => b[2]);
  logic.settlementKind.forEach((kind, county) => {
    const quota = NPC_QUOTA[kind];
    const ce = eco.counties[county]!;
    ce.mouths = Math.max(1, ce.mouths - quota);
    let hasPhysician = false;
    for (let k = 0; k < quota; k++) {
      const { id, rng: state } = allocateNpc(world, lifeRoot);
      const own = Rng.fromState(state);
      const band = AGE_BANDS[rng.weighted(weights)]!;
      let age = rng.int(band[0], band[1]);
      const weekOfYear = rng.int(0, TICKS_PER_YEAR - 1);
      const place = { birthTick: tick - age * TICKS_PER_YEAR - weekOfYear, birthplaceId: birthplaceId(`${regionId}/c${logic.counties[county]!.worldIndex}`), birthplaceKind: kind, county };
      const c = createCharacter(place, own, own);
      // Không sinh người đã quá thọ: trẻ lại cho còn ít nhất hai năm sống
      const maxAge = idiv(lifespanCap(c), TICKS_PER_YEAR) - LIFESPAN_MARGIN_YEARS;
      if (age > maxAge) {
        age = Math.max(0, maxAge);
        c.birthTick = tick - age * TICKS_PER_YEAR - weekOfYear;
        for (const s of Object.keys(c.skillLastUsed) as Skill[]) c.skillLastUsed[s] = c.birthTick;
      }
      agingPhase(c, tick);
      c.health = c.healthMax;
      c.stamina = staminaMax(c, tick);
      const occupation = pickOccupation(kind, c, age, hasPhysician, own);
      if (occupation === 'physician') hasPhysician = true;
      seedSkill(c, occupation, age, tick);
      if (age >= COMING_OF_AGE) {
        becomeIndependent(c, ce);
        // Người lớn đã sống tới giờ thì có kho dành dụm theo số năm tự lo, lấy từ kho quận nhà (không tạo từ hư không)
        const top = Math.min(Math.max(0, startReserve(age) - c.household.grain), ce.grain);
        c.household.grain += top; ce.grain -= top;
      }
      const npc: NpcState = { id, character: c, occupation, tier: county === playerCounty ? 'L0' : 'L1', rng: own.state(), death: null, plan: null, active: null, planWarned: false };
      world.people.push(npc);
    }
  });
}
