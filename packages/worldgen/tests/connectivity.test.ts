import { describe, expect, it } from 'vitest';
import { countyAdjacency, reachableCounties } from '../src/region/connectivity';

describe('liên thông vùng (ADR 0009)', () => {
  it('nối hai quận chạm góc và bỏ quận cô lập', () => {
    const edges = countyAdjacency(Int16Array.from([0, -1, -1, -1, 1, -1, -1, -1, 2]), 3, 3, new Set([0, 1]));
    expect(edges).toEqual([[0, 1]]);
    expect([...reachableCounties(0, edges)].sort()).toEqual([0, 1]);
  });
  it('không nối vòng từ cuối hàng sang đầu hàng hoặc băng qua nước/quận bị loại', () => {
    const cells = Int16Array.from([-1, -1, 0, 1, -1, -1]);
    expect(countyAdjacency(cells, 3, 2)).toEqual([]);
    expect(countyAdjacency(Int16Array.from([0, 9, 1]), 3, 1, new Set([0, 1]))).toEqual([]);
    expect([...reachableCounties(0, [])]).toEqual([0]);
  });
});
