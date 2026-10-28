// Tác động của thế lực lên người đi đường, người giữ kho (v0.6 S6, ADR 0019 Q5, Q6, Q10): đường băng cướp giữ nguy hiểm
// hơn, đường thương hội giữ an hơn; gần sào huyệt thì dễ mất trộm. Chỉ đọc trạng thái thế lực; thuần, số nguyên.
import type { FactionId } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { mulDiv } from '../core/math';
import type { FactionWorldState } from './state';

/** Hệ số rủi ro (%) trên đường băng cướp giữ (Q6); đè lên đường thương hội. */
export const BANDIT_ROAD_PCT = 200;
/** Hệ số rủi ro (%) trên đường thương hội giữ, không có cướp (Q5): có người áp tải, quán trọ dọc đường. */
export const GUILD_ROAD_PCT = 75;
/** Trọng số mất trộm (%) ở quận sào huyệt hay quận kề sào huyệt của một băng cướp còn sống. */
export const BANDIT_NEAR_THEFT_PCT = 300;

/** Hệ số rủi ro (%) của mỗi đường (theo `adjacency`): 100 nếu không ai giữ. */
export function roadRisk(fw: FactionWorldState, edges: number): number[] {
  const out = Array<number>(edges).fill(100);
  for (const f of fw.list) if (f.ended === null && f.kind === 'guild') for (const k of f.roads) if (k < edges) out[k] = GUILD_ROAD_PCT;
  for (const f of fw.list) if (f.ended === null && f.kind === 'bandits') for (const k of f.roads) if (k < edges) out[k] = BANDIT_ROAD_PCT;
  return out;
}

/** Chỉ số cạnh của từng chặng trên lộ trình (bỏ chặng không có cạnh). */
export function routeEdges(logic: RegionLogic, route: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < route.length; i++) {
    const a = Math.min(route[i - 1]!, route[i]!), b = Math.max(route[i - 1]!, route[i]!);
    const k = logic.adjacency.findIndex(([x, y]) => x === a && y === b);
    if (k >= 0) out.push(k);
  }
  return out;
}

/**
 * Rủi ro cả lộ trình (%): chặng nguy hiểm nhất theo địa hình × người giữ đường. Không có `roads` thì chỉ theo địa hình
 * như v0.5.
 */
export function routeRiskPct(logic: RegionLogic, route: readonly number[], roads: readonly number[] | null): number {
  const edges = routeEdges(logic, route);
  if (edges.length === 0) return 100;
  return edges.reduce((m, k) => Math.max(m, mulDiv(logic.terrainPct[k]!, roads?.[k] ?? 100, 100)), 0);
}

/** Hệ số người giữ đường của lộ trình (%): có chặng cướp giữ thì 200; mọi chặng thương hội giữ thì 75; còn lại 100. */
export function routeRoadPct(logic: RegionLogic, route: readonly number[], roads: readonly number[]): number {
  const edges = routeEdges(logic, route);
  return edges.length === 0 ? 100 : edges.reduce((m, k) => Math.max(m, roads[k] ?? 100), 0);
}

/** Băng cướp đầu tiên (theo id) giữ một chặng trên lộ trình; null nếu đường sạch (`TravelOption.danger`). */
export function routeDanger(fw: FactionWorldState, logic: RegionLogic, route: readonly number[]): FactionId | null {
  const edges = routeEdges(logic, route);
  return fw.list.find((f) => f.ended === null && f.kind === 'bandits' && f.roads.some((k) => edges.includes(k)))?.id ?? null;
}

/** Quận là sào huyệt hay kề sào huyệt của một băng cướp còn sống (nơi băng ấy với tới). */
export function banditsNear(fw: FactionWorldState, logic: RegionLogic, county: number): boolean {
  return fw.list.some((f) => f.ended === null && f.kind === 'bandits' && (f.seat === county || f.roads.some((k) => logic.adjacency[k]!.includes(county))));
}
