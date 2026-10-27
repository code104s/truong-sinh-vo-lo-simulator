// NPC: người có tên quanh người chơi, sống theo cùng luật (ADR 0015, 0016).
// Bước 0 v0.4: kiểu trạng thái và luồng RNG riêng mỗi NPC; dân số ban đầu, luật tuần/tháng có từ S1–S4.
import { ageYearsAt, regionId as toRegionId, type EventFigure, type NpcId, type NpcView, type RegionId, type Tick } from '@tsvl/shared';
import { hash32 } from '../core/hash';
import { Rng, type RngState } from '../core/rng';
import { healthBandOf, type CharacterState } from '../life/character';
import type { Death } from '../life/health';
import type { PlayerState } from '../life/player';
import { COMING_OF_AGE } from '../life/household';
import type { Background } from '../life/params';

/** Nghề (ADR 0016, Q5): bốn nghề thường, hai nghề đặc biệt nảy từ mô phỏng; trẻ dưới 16 chưa có nghề. */
export const OCCUPATIONS = ['child', 'farmer', 'laborer', 'hunter', 'teacher', 'physician', 'merchant'] as const;
export type Occupation = (typeof OCCUPATIONS)[number];

/** L0: quận người chơi đang đứng, chạy mỗi tuần đúng luật người chơi. L1: quận khác, gộp ba tuần ở đầu tháng (ADR 0015, Q3). */
export const NPC_TIERS = ['L0', 'L1'] as const;
export type NpcTier = (typeof NPC_TIERS)[number];

/** NPC dùng cùng trạng thái kế hoạch, hành động dở với người chơi (ADR 0008), để chạy đúng luật `playerPhase`. */
export interface NpcState extends PlayerState {
  id: NpcId;
  character: CharacterState;
  occupation: Occupation;
  tier: NpcTier;
  /** Luồng RNG riêng: thêm, bớt NPC hay người chơi làm gì cũng không làm lệch số ngẫu nhiên của NPC khác. */
  rng: RngState;
  /** Cái chết; người đã mất ở lại một năm (đám ma, tin tức) rồi bị dọn khỏi snapshot (S4). */
  death: Death | null;
}

export interface NpcWorldState {
  /** Seed gốc của đời (luồng riêng mỗi NPC, trẻ sinh mỗi năm) và vùng (id nơi sinh của trẻ mới). */
  root: number;
  regionId: RegionId;
  /** Số cho id NPC kế tiếp ("n" + số); không dùng lại id đã cấp. */
  nextId: number;
  /** Sắp theo thứ tự cấp id; mọi vòng lặp duyệt theo thứ tự này. */
  people: NpcState[];
}

export const newNpcWorld = (root = 0, regionId: RegionId = toRegionId('r0')): NpcWorldState => ({ root: root >>> 0, regionId, nextId: 1, people: [] });

/** Seed luồng riêng của một NPC, suy từ seed gốc của đời (ADR 0015). */
export const npcSeed = (lifeRoot: number, id: NpcId): number => hash32(lifeRoot >>> 0, 'npc', id);

/** Cấp id mới và luồng RNG mới cho một NPC sắp sinh. */
export function allocateNpc(world: NpcWorldState, lifeRoot: number): { id: NpcId; rng: RngState } {
  const id = `n${world.nextId++}`;
  return { id, rng: Rng.fromSeed(npcSeed(lifeRoot, id)).state() };
}

/** NPC đang sống ở một quận, theo thứ tự id. */
export function peopleAt(world: NpcWorldState, county: number): NpcState[] {
  return world.people.filter((n) => n.death === null && n.character.location === county);
}

/** Tổng tiền trong túi mọi NPC (sổ cái, ADR 0016): quỹ quận + túi người chơi + túi NPC không đổi qua mọi tick. */
export const npcMoney = (world: NpcWorldState): number => world.people.reduce((s, n) => s + n.character.household.money, 0);

/** Lứa tuổi trên chân dung: trẻ dưới 16, trẻ tuổi tới 29, trung niên tới 54, già từ 55. */
export function figureAge(ageYears: number): EventFigure['ageBand'] {
  return ageYears < COMING_OF_AGE ? 'child' : ageYears < 30 ? 'young' : ageYears < 55 ? 'adult' : 'old';
}
const FIGURE_CLASS: Record<Background, EventFigure['class']> = { destitute: 'poor', commoner: 'common', comfortable: 'common', wealthy: 'rich' };

/** Người trong thẻ sự kiện là NPC thật: cùng gương mặt với khối "người trong quận" (khóa chân dung là id). */
export function npcFigure(n: NpcState, tick: Tick): EventFigure {
  const c = n.character;
  return { gender: c.gender, ageBand: figureAge(ageYearsAt(c.birthTick, tick)), class: FIGURE_CLASS[c.background], npcId: n.id };
}

/** Người chơi thấy gì về một NPC (ADR 0016, Q8): không có thuộc tính ẩn. Khóa chân dung là id: cùng người, cùng gương mặt. */
export function npcView(n: NpcState, tick: Tick): NpcView {
  const c = n.character;
  const ageYears = ageYearsAt(c.birthTick, tick);
  return {
    id: n.id, name: c.name, gender: c.gender, ageYears, occupation: `occupation.${n.occupation}`, healthBand: healthBandOf(c),
    portrait: { ageBand: figureAge(ageYears), class: FIGURE_CLASS[c.background], key: n.id },
  };
}

/** STATE.people: NPC còn sống ở quận người chơi đang đứng, theo thứ tự id. */
export function npcViews(world: NpcWorldState, county: number, tick: Tick): NpcView[] {
  return peopleAt(world, county).map((n) => npcView(n, tick));
}
