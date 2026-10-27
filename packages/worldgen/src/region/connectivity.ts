/** Kề 8 hướng, mỗi cạnh một lần, thứ tự ổn định theo chỉ số quận. */
export function countyAdjacency(cells: Int16Array, width: number, height: number, allowed?: ReadonlySet<number>): [number, number][] {
  const pairs = new Set<number>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = cells[y * width + x]!;
      if (a < 0 || (allowed && !allowed.has(a))) continue;
      // Nửa phải/dưới của 8 hướng; không quấn hàng tại hai mép bản đồ.
      for (const [dx, dy] of [[1, 0], [-1, 1], [0, 1], [1, 1]]) {
        const nx = x + dx!, ny = y + dy!;
        if (nx < 0 || nx >= width || ny >= height) continue;
        const b = cells[ny * width + nx]!;
        if (b >= 0 && a !== b && (!allowed || allowed.has(b))) pairs.add(Math.min(a, b) * 65536 + Math.max(a, b));
      }
    }
  }
  return [...pairs].sort((a, b) => a - b).map((k) => [Math.floor(k / 65536), k % 65536]);
}

export function reachableCounties(start: number, edges: readonly [number, number][]): Set<number> {
  const neighbors = new Map<number, number[]>();
  for (const [a, b] of edges) {
    neighbors.set(a, [...(neighbors.get(a) ?? []), b]);
    neighbors.set(b, [...(neighbors.get(b) ?? []), a]);
  }
  const seen = new Set([start]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    for (const next of neighbors.get(queue[i]!) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}
