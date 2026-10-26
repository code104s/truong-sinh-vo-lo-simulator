// Toán số nguyên cho sim (ADR 0003).

function assertSafe(x: number, what: string): void {
  if (!Number.isSafeInteger(x)) throw new RangeError(`${what} không phải số nguyên an toàn: ${x}`);
}

/** Chia lấy phần nguyên, làm tròn về 0. */
export function idiv(a: number, b: number): number {
  assertSafe(a, 'idiv a');
  assertSafe(b, 'idiv b');
  if (b === 0) throw new RangeError('idiv: chia cho 0');
  return Math.trunc(a / b);
}

/** a * b / c làm tròn về 0, kiểm tra tích còn an toàn. */
export function mulDiv(a: number, b: number, c: number): number {
  const p = a * b;
  assertSafe(p, 'mulDiv tích');
  return idiv(p, c);
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Nội suy tuyến tính số nguyên trên bảng điểm (x tăng dần). Ngoài bảng thì giữ giá trị đầu/cuối. */
export function lerpTable(table: readonly (readonly [number, number])[], x: number): number {
  const first = table[0]!;
  if (x <= first[0]) return first[1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i]!;
    if (x <= x1) {
      const [x0, y0] = table[i - 1]!;
      return y0 + mulDiv(y1 - y0, x - x0, x1 - x0);
    }
  }
  return table[table.length - 1]![1];
}

/** Các cặp khóa–giá trị theo khóa tăng dần (lặp object mà thứ tự ảnh hưởng kết quả). */
export function sortedEntries<V>(o: Readonly<Record<string, V>>): [string, V][] {
  return Object.keys(o).sort().map((k) => [k, o[k]!]);
}
