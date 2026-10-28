// Thế lực (v0.6, ADR 0019): trạng thái, kho, người giữ quận, pha quý. S1: quan phủ (`government.ts`); S2: gia tộc
// (`clans.ts`); S3: thương hội (`guilds.ts`); S4: băng cướp (`bandits.ts`). Thuần, tất định, số nguyên.
import { isQuarterStart, TICKS_PER_YEAR, type FactionId, type FactionKind, type FactionName, type FactionView, type StrengthBand, type Tick } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { idiv } from '../core/math';
import type { Rng } from '../core/rng';
import type { EconomyState } from '../economy/market';
import type { NpcWorldState } from '../npc/state';
import { governmentRule, governmentTaxes, setTaxRates, type GovernmentReport } from './government';
import { clansQuarter } from './clans';
import { guildsQuarter } from './guilds';
import { banditsQuarter } from './bandits';

export interface FactionState {
  id: FactionId;
  kind: FactionKind;
  name: FactionName;
  /** Trị sở: quận đặt nhà, hội quán, sào huyệt. */
  seat: number;
  /** Quận thế lực giữ, tăng dần. Gia tộc: quận nó đứng đầu (họ lớn nhất), chưa phải quận nó cai quản (S5). Thương hội: trị sở. */
  counties: number[];
  /** Đường giữ (chỉ số cạnh `adjacency`), tăng dần: thương hội (S3), băng cướp (S4). */
  roads: number[];
  /**
   * Quận cát cứ, tăng dần (S5): gia tộc, băng cướp chiếm khỏi tay quan phủ. Quan phủ giữ mọi quận không ai cát cứ
   * (`counties` của quan phủ); bản đồ "ai kiểm soát" đọc trường này.
   */
  holds: number[];
  /** Người thuộc thế lực (id NPC), tăng dần theo id. */
  members: string[];
  /** Người cầm đầu (id NPC): trưởng họ (S2); quan, hội trưởng, đầu đảng ở S3–S5. */
  leader: string | null;
  /** Thế (văn tương đương), tính lại mỗi quý: gia tộc là uy thế (S2); đọ thế ở S5 (Q8). */
  power: number;
  /** Số quý lỗ liên tiếp (thương hội, S3). */
  losses: number;
  /** Quan phủ (S5): độ tham của quan đương nhiệm (0–100) và tick hết nhiệm kỳ. */
  greed: number;
  termEnds: Tick;
  /** Thái độ với thế lực khác, thưa (chỉ cặp đã có chuyện), theo id; −100 thù … 100 thân. S1 chưa có. */
  relations: { other: FactionId; attitude: number }[];
  /** Kho riêng (quan phủ, thương hội, băng cướp; gia tộc không có kho chung, Q4): vào sổ cái. */
  money: number;
  grain: number;
  /** Tick lập; tick tàn (null khi còn). Thế lực tàn ở lại một năm cho tin tức, tổng kết rồi bị dọn. */
  founded: Tick;
  ended: Tick | null;
}

export interface FactionWorldState {
  /** Số cho id thế lực kế tiếp ("f" + số); không dùng lại. */
  nextId: number;
  /** Theo thứ tự cấp id; mọi vòng lặp duyệt theo thứ tự này. */
  list: FactionState[];
}

export const newFactionWorld = (): FactionWorldState => ({ nextId: 1, list: [] });

/** Tổng tiền trong kho mọi thế lực (sổ cái: quỹ quận + túi người chơi + túi NPC + kho thế lực). */
export const factionMoney = (fw: FactionWorldState): number => fw.list.reduce((s, f) => s + f.money, 0);

/**
 * Thế lực cai quản mỗi quận (theo chỉ số quận); null là chưa ai giữ. Quan phủ giữ `counties`; gia tộc, băng cướp cát cứ
 * (`holds`) đè lên (S5). Gia tộc chỉ đứng đầu quận, thương hội giữ đường: chưa cát cứ thì không cai quản (Q4, Q5).
 */
export function controlOf(fw: FactionWorldState, counties: number): (FactionId | null)[] {
  const out: (FactionId | null)[] = Array<FactionId | null>(counties).fill(null);
  for (const f of fw.list) if (f.ended === null && f.kind === 'government') for (const c of f.counties) if (c < counties) out[c] = f.id;
  for (const f of fw.list) if (f.ended === null) for (const c of f.holds) if (c < counties) out[c] = f.id;
  return out;
}

/** Thế lực mỗi NPC thuộc về (id NPC → id thế lực), cho `NpcView.faction`. */
export function membershipOf(fw: FactionWorldState): Map<string, FactionId> {
  const out = new Map<string, FactionId>();
  for (const f of fw.list) if (f.ended === null) for (const id of f.members) out.set(id, f.id);
  return out;
}

/**
 * Dải thế cho người chơi thấy. Quan phủ: theo phần quận đang giữ (S1). Gia tộc: uy thế so với trung bình các gia tộc
 * trong vùng (gấp đôi trở lên `dominant`, từ trung bình `strong`, từ nửa `modest`). S5 đổi sang thế đọ được (Q8).
 */
export function strengthBand(f: FactionState, fw: FactionWorldState, counties: number): StrengthBand {
  if (f.kind === 'government') {
    const pct = idiv(f.counties.length * 100, Math.max(1, counties));
    return pct >= 75 ? 'dominant' : pct >= 40 ? 'strong' : pct >= 15 ? 'modest' : 'feeble';
  }
  const peers = fw.list.filter((x) => x.kind === f.kind && x.ended === null);
  const mean = Math.max(1, idiv(peers.reduce((s, x) => s + x.power, 0), Math.max(1, peers.length)));
  return f.power >= 2 * mean ? 'dominant' : f.power >= mean ? 'strong' : 2 * f.power >= mean ? 'modest' : 'feeble';
}

/** Thế lực còn sống như người chơi thấy; đường giữ quy ra cặp quận (F1: bản đồ "ai kiểm soát"). */
export function factionViews(fw: FactionWorldState, logic: RegionLogic): FactionView[] {
  return fw.list.filter((f) => f.ended === null).map((f) => ({
    id: f.id, kind: f.kind, name: { key: f.name.key, params: { ...f.name.params } }, seat: f.seat, counties: [...f.counties],
    ...(f.roads.length ? { roads: f.roads.map((k): [number, number] => [logic.adjacency[k]![0], logic.adjacency[k]![1]]) } : {}),
    strength: strengthBand(f, fw, logic.counties.length), members: f.members.length, ...(f.leader !== null ? { leader: f.leader } : {}),
  }));
}

/**
 * Pha Thế lực (GDD 3.2 B, 10.4): đầu mỗi quý, sau pha Thế giới, trước pha NPC. Đọc quận, NPC, kho; chỉ đổi kho thế lực,
 * người giữ đất, nghề NPC, mức thuế (Q2). Luồng RNG riêng `factions`. Thứ tự: quan phủ thu thuế; gia tộc; thương hội; băng cướp; quan phủ cai trị (quan, sai dịch, phát chẩn, tiễu phỉ,
 * cát cứ, chi nha môn — S5).
 */
export function factionPhase(fw: FactionWorldState, eco: EconomyState, npcs: NpcWorldState, logic: RegionLogic, tick: Tick, rng: Rng): GovernmentReport | null {
  if (!isQuarterStart(tick)) return null;
  // Thế lực tàn quá một năm thì dọn khỏi snapshot
  fw.list = fw.list.filter((f) => f.ended === null || tick - f.ended < TICKS_PER_YEAR);
  const gov = fw.list.find((f) => f.ended === null && f.kind === 'government') ?? null;
  if (gov) governmentTaxes(gov, eco, tick);
  clansQuarter(fw, npcs, logic, tick);
  guildsQuarter(fw, eco, npcs, logic, tick);
  banditsQuarter(fw, eco, npcs, logic, tick, rng);
  const report = gov ? governmentRule(gov, fw, eco, npcs, logic, tick, rng) : null;
  // Mức thuế cho quý tới theo người giữ quận (S6)
  setTaxRates(gov, eco);
  // Lời buôn ghi trong quý đã chia xong (đường không ai giữ thì lời ấy không ai lấy, như v0.5)
  for (const m of eco.tradeMargin) m[0] = m[1] = 0;
  // Thuế ghi trong quý đã chia xong (quận không ai giữ thì quỹ quận giữ cả)
  // Lương trả thêm ứng trong quý thương hội đã hoàn (S6)
  for (const ce of eco.counties) ce.taxMoney = ce.taxGrain = ce.wageBonus = 0;
  return report;
}
