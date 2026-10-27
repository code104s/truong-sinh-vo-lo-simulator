// Batch song song (v0.4): mỗi đời độc lập, kết quả không phụ thuộc thứ tự chạy hay bộ đệm của luồng; gộp theo thứ tự
// đời nên báo cáo song song giống hệt chạy tuần tự.
import { buildRegion } from '@tsvl/worldgen';
import { describe, expect, it } from 'vitest';
import { aggregate, runLife, sequentialRunner, type BatchRegion, type LifeResult } from '../src/batch';

describe('batch song song', () => {
  it('đời chạy lẻ, chạy ngược thứ tự, bộ đệm riêng vẫn ra cùng kết quả; báo cáo gộp giống hệt', async () => {
    const b = buildRegion('tsvl-01');
    const regions: BatchRegion[] = [{ seed: 'tsvl-01', regionId: b.summary.id, birthplaces: b.birthplaces, logic: b.logic }];
    const n = 6;
    const seq = await sequentialRunner(regions)('balanced', n);
    // Như các luồng: mỗi đời chạy với bộ đệm mới, thứ tự ngược, rồi xếp lại theo chỉ số đời
    const par: LifeResult[] = new Array(n);
    for (let i = n - 1; i >= 0; i--) par[i] = runLife(regions, 'balanced', i, new Map());
    expect(par).toEqual(seq);
    // Qua structured clone (như postMessage giữa luồng) vẫn gộp ra cùng báo cáo
    expect(aggregate('balanced', structuredClone(par), 0)).toEqual(aggregate('balanced', seq, 0));
  }, 120_000);
});
