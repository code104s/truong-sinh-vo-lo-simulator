import { DAYS_PER_TICK, type TravelPreview } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { idiv } from '../core/math';

export const WALK_KM_PER_DAY = 30;
const ceilDiv = (a: number, b: number) => idiv(a + b - 1, b);

/** Dijkstra theo km nguyên; hòa thì chọn quận có chỉ số nhỏ trước. */
export function previewTravel(logic: RegionLogic, from: number, to: number): TravelPreview | null {
  const n = logic.counties.length;
  if (!Number.isSafeInteger(to) || to < 0 || to >= n || from < 0 || from >= n || from === to) return null;
  const distance = Array<number>(n).fill(Number.MAX_SAFE_INTEGER);
  const previous = Array<number>(n).fill(-1);
  const visited = Array<boolean>(n).fill(false);
  distance[from] = 0;
  for (let k = 0; k < n; k++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!visited[i] && (u < 0 || distance[i]! < distance[u]!)) u = i;
    if (u < 0 || distance[u] === Number.MAX_SAFE_INTEGER) break;
    if (u === to) break;
    visited[u] = true;
    for (const [a, b] of logic.adjacency) {
      const v = a === u ? b : b === u ? a : -1;
      if (v < 0 || visited[v]) continue;
      const candidate = distance[u]! + logic.seatKm[u]![v]!;
      if (candidate < distance[v]!) { distance[v] = candidate; previous[v] = u; }
    }
  }
  if (previous[to] === -1) return null;
  const route = [to];
  while (route[route.length - 1] !== from) route.push(previous[route[route.length - 1]!]!);
  route.reverse();
  let days = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!, b = route[i]!;
    const edge = logic.adjacency.findIndex(([x, y]) => x === Math.min(a, b) && y === Math.max(a, b));
    days += Math.max(1, ceilDiv(logic.seatKm[a]![b]! * logic.terrainPct[edge]!, WALK_KM_PER_DAY * 100));
  }
  const factor = routeTerrainPct(logic, route);
  return { county: to, route, days, slots: Math.max(1, ceilDiv(days, DAYS_PER_TICK)), risk: factor >= 200 ? 'risk.high' : factor > 100 ? 'risk.medium' : 'risk.low' };
}

export function routeTerrainPct(logic: RegionLogic, route: readonly number[]): number {
  let factor = 100;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!, b = route[i]!;
    const edge = logic.adjacency.findIndex(([x, y]) => x === Math.min(a, b) && y === Math.max(a, b));
    if (edge >= 0) factor = Math.max(factor, logic.terrainPct[edge]!);
  }
  return factor;
}

/** Trấn hay thành gần nhất (theo km giữa trị sở) tính từ một quận, khác quận ấy; null nếu vùng không có. */
export function nearestTownFrom(logic: RegionLogic, county: number): number | null {
  const km = logic.seatKm[county]!;
  let best = -1;
  for (let i = 0; i < logic.settlementKind.length; i++) {
    if (logic.settlementKind[i] === 'village' || i === county) continue;
    if (best < 0 || km[i]! < km[best]!) best = i;
  }
  return best < 0 ? null : best;
}
