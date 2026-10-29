// Tán nhân lưu lạc, ẩn dật, theo cướp (v0.7 S6, ADR 0020 Q7, Q8): ba đường sống ngoài lề. Lưu lạc, ẩn dật tự vào bằng
// một việc (bỏ quê, dựng lều); theo cướp vào qua sự kiện người lạ rủ rê, sống bằng chia của của băng cướp thật (v0.6),
// bị quan phủ tiễu, ra băng phải chuộc tội hay trốn. Thuần, tất định; rời băng không rút RNG.
import type { LogEntry, Tick } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import type { CharacterState } from './character';
import { enterCareer, leaveCareer, type CareerWorld } from './career';
import { MOUNTAIN_TERRAIN_PCT } from '../factions/bandits';
import type { FactionState, FactionWorldState } from '../factions/state';
import { kinRole, lookup } from '../npc/family';
import type { NpcWorldState } from '../npc/state';
import { BOND_MAX, ensureBond, type Bond } from '../social/bonds';
import { addReputation } from '../social/reputation';
import { ATONE_BAND, ATONE_GOV, DESERT_BAND, OUTLAW_JOIN_BAND, OUTLAW_JOIN_GOV, shiftAttitude } from '../factions/attitude';

type Log = (e: Omit<LogEntry, 'tick'>) => void;

/** Lưu lạc từng trải: rủi ro đi đường theo bậc (%) — học việc, làm được, có tiếng. */
export const DRIFTER_ROAD_RISK_PCT = [100, 85, 70] as const;
// Ẩn dật hái lượm quanh lều được nhiều hơn: `RECLUSE_FORAGE_PCT` ở `economy/income.ts` (luật thu nhập).
/** Vào băng: tiếng xấu ở quận đang đứng (qua `reputation` của sự kiện), người thân xa lánh (thân thiết, tin cậy −15). */
export const OUTLAW_KIN_COLD = 15;
/** Bị bắt khi quan phủ thắng trận tiễu phỉ (luật bắt ở `factions/government.ts`): tiếng tăm quận nhà −10. */
export const OUTLAW_CAUGHT_REP = -10;
/** Ra băng: chuộc tội với quan phủ (văn, vào kho quan phủ), tiếng tăm quận nhà +10; không đủ tiền thì trốn, người trong băng thù (+40). */
export const ATONE_FEE = 1_000;
export const ATONE_REP = 10;
export const DESERT_HOSTILITY = 40;

/** Người chơi lưu lạc, ẩn dật không nộp thuế đinh nơi nào (Q7). */
export const taxExempt = (w: Pick<CareerWorld, 'career'>): boolean => w.career?.id === 'drifter' || w.career?.id === 'recluse';

/** Quận có đường núi (chung ngưỡng với sào huyệt băng cướp): dựng lều ẩn cư được. */
export function mountainCounty(logic: RegionLogic, county: number): boolean {
  return logic.adjacency.some(([a, b], k) => (a === county || b === county) && logic.terrainPct[k]! >= MOUNTAIN_TERRAIN_PCT);
}

export interface OwnWorld extends CareerWorld {
  bonds: Bond[];
  npcs: NpcWorldState;
  logic: RegionLogic;
  tick: Tick;
}

/** Khóa của việc tự vào nghề: bỏ quê (người đã ra riêng, không ruộng) và dựng lều (quận có núi rừng). */
export function ownLock(action: string, c: CharacterState, w: OwnWorld): string | null {
  if (!c.household.independent) return 'lock.dependent';
  if (action === 'action.drift') {
    if (c.household.landMu > 0) return 'lock.has_land';
    return w.career?.id === 'drifter' ? 'lock.member' : null;
  }
  if (!mountainCounty(w.logic, c.location)) return 'lock.no_mountain';
  return w.career?.id === 'recluse' && c.home === c.location ? 'lock.member' : null;
}

/**
 * Một ô bỏ quê hay dựng lều (khóa đã xét lúc đầu tuần). Bỏ quê: vào nghề lưu lạc. Dựng lều: quận này thành quê (lều),
 * vào nghề ẩn dật; đang ẩn dật thì chỉ dời lều. Đang làm nghề khác thì rời (mất bậc như mọi lần đổi nghề).
 */
export function ownEnter(action: string, c: CharacterState, w: OwnWorld, log: Log): void {
  if (ownLock(action, c, w)) return;
  const id = action === 'action.drift' ? 'drifter' : 'recluse';
  const place = w.logic.counties[c.location]!.name ?? 'place.unknown';
  if (id === 'recluse') c.home = c.location;
  if (w.career?.id === id) { log({ key: 'log.career.hut_move', params: { place }, importance: 'major' }); return; }
  const old = leaveCareer(w, w.bonds, w.npcs);
  enterCareer(w, id, w.tick);
  log({ key: id === 'drifter' ? 'log.career.drift' : 'log.career.hut', params: { place, ...(old ? { old: `career.${old.id}` } : {}) }, importance: 'major' });
}

/** Băng người chơi đang theo, còn sống; null nếu không theo cướp. */
export function bandOf(fw: FactionWorldState, w: Pick<CareerWorld, 'career'>): FactionState | null {
  if (w.career?.id !== 'outlaw' || !w.career.faction) return null;
  return fw.list.find((f) => f.id === w.career!.faction && f.kind === 'bandits' && f.ended === null) ?? null;
}

/**
 * Theo băng cướp (sự kiện người lạ rủ rê, Q8): rời nghề cũ, vào nghề theo cướp, nơi nhận là băng. Người thân còn sống
 * mà người chơi có quan hệ thì xa lánh. Không tính vào người trong băng để lập, tan đảng (như hội viên thương hội, S3).
 */
export function joinBand(c: CharacterState, band: FactionState, w: CareerWorld & { bonds: Bond[]; npcs: NpcWorldState; tick: Tick; factions: FactionWorldState }): void {
  leaveCareer(w, w.bonds, w.npcs);
  enterCareer(w, 'outlaw', w.tick, { faction: band.id });
  // Thái độ (S7): băng thân, quan phủ ghét
  shiftAttitude(band, OUTLAW_JOIN_BAND);
  shiftAttitude(w.factions.list.find((f) => f.kind === 'government' && f.ended === null), OUTLAW_JOIN_GOV);
  const byId = lookup(w.npcs);
  for (const b of w.bonds) {
    const n = byId.get(b.id);
    if (!n || n.death || !kinRole(c, n)) continue;
    b.closeness = Math.max(0, b.closeness - OUTLAW_KIN_COLD);
    b.trust = Math.max(0, b.trust - OUTLAW_KIN_COLD);
  }
}

/**
 * Ra băng (lệnh rời nghề khi đang theo cướp): đủ tiền thì chuộc tội với quan phủ, tiếng tăm quận nhà khá lên; không đủ
 * thì trốn — người trong băng thù. Trả khóa nhật ký cho người chơi.
 */
const governmentOf = (fw: FactionWorldState): FactionState | null => fw.list.find((f) => f.kind === 'government' && f.ended === null) ?? null;

/** Ra băng lúc này thì chuộc tội được không: còn quan phủ và đủ tiền (cho lệnh rời nghề và lời báo trước F2). */
export const canAtone = (c: CharacterState, fw: FactionWorldState): boolean => !!governmentOf(fw) && c.household.money >= ATONE_FEE;

export function leaveBand(c: CharacterState, fw: FactionWorldState, w: CareerWorld & { bonds: Bond[]; reputation: number[] }): string {
  const band = bandOf(fw, w);
  const gov = governmentOf(fw);
  if (gov && canAtone(c, fw)) {
    c.household.money -= ATONE_FEE; gov.money += ATONE_FEE;
    addReputation(w.reputation, c.home, ATONE_REP);
    shiftAttitude(gov, ATONE_GOV); shiftAttitude(band, ATONE_BAND);
    return 'log.outlaw.atone';
  }
  shiftAttitude(band, DESERT_BAND);
  for (const id of band?.members ?? []) {
    const b = ensureBond(w.bonds, id);
    b.hostility = Math.min(BOND_MAX, b.hostility + DESERT_HOSTILITY);
  }
  return 'log.outlaw.desert';
}
