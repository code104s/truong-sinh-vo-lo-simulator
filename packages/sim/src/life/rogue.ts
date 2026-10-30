// Tán tu (v0.8 S4, ADR 0022 Q6): tự dẫn khí nhờ công pháp thô — tàn quyển trong hang (cần biết chữ) hay tu sĩ lưu lạc chỉ
// điểm (có giá). Không thầy dẫn nên dẫn khí có thể hỏng nhiều lần, hỏng nặng thì thương kinh mạch; đổi lại không cấp phát,
// không nghĩa vụ. Người không có linh căn ngồi bao lâu cũng không dẫn được khí, và biết ra mình không có. Thuần, tất định.
import type { LogEntry, RootBand, Tick } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { mulDiv } from '../core/math';
import type { Rng } from '../core/rng';
import type { CharacterState } from './character';
import { qiPlacePct, rootBand, testRoot, type CultivationState } from './cultivation';
import { ILLNESSES } from './params';
import { fatiguePct } from './stamina';

type Log = (e: Omit<LogEntry, 'tick'>) => void;

/** Cờ sự kiện: đã có công pháp thô (đọc tàn quyển, hay được tu sĩ lưu lạc chỉ điểm). Nhớ cả đời. */
export const CRUDE_MANUAL = 'crude_manual';
/** Đọc được tàn quyển từ mức chữ "Thạo" (Q6). */
export const MANUAL_LITERACY_XP = 1_000;
/** Bệnh do dẫn khí hỏng (nhóm bệnh, không rút ngẫu nhiên như bệnh thường): thương kinh mạch. */
export const MERIDIAN_ILLNESS = 'illness.meridian';
const MERIDIAN = ILLNESSES.find((d) => `illness.${d.id}` === MERIDIAN_ILLNESS)!;

/**
 * Dẫn khí thành công mỗi ô (ppm) theo dải linh căn, trước khi nhân linh khí nơi ở, ngộ tính, mệt. Linh căn khá, ngộ tính
 * vừa, ở làng: 20% mỗi ô — trung bình năm ô (gần hai tháng), kém may thì cả năm. Đệ tử ký danh được thầy dẫn nên không rút.
 */
export const INDUCE_PPM: Readonly<Record<Exclude<RootBand, 'none'>, number>> = { mixed: 80_000, fair: 200_000, good: 350_000 };
export const INDUCE_MAX_PPM = 800_000;
/** Mỗi lần hỏng có chừng này phần là khí đi sai đường: thương kinh mạch (bệnh dài, để lại di chứng giảm sức khỏe tối đa). */
export const INDUCE_MERIDIAN_PPM = 150_000;

/** Khóa của việc tự dẫn khí: có công pháp thô, chưa có đường tu, chưa biết mình không có linh căn, không đang thương kinh mạch. */
export function induceLock(c: CharacterState, cult: CultivationState, flags: readonly string[]): string | null {
  if (!flags.includes(CRUDE_MANUAL)) return 'lock.no_manual';
  if (cult.path) return 'lock.has_path';
  if (cult.root === 'none') return 'lock.no_root';
  return c.conditions.some((x) => x.id === MERIDIAN_ILLNESS) ? 'lock.meridian' : null;
}

/** Cơ hội dẫn khí thành công trong một ô (ppm); không có linh căn thì 0. */
export function inducePpm(c: CharacterState, logic: RegionLogic, tick: Tick): number {
  const band = rootBand(c.spiritRoot);
  if (band === 'none') return 0;
  let ppm = mulDiv(INDUCE_PPM[band], qiPlacePct(logic, c.location), 100);
  ppm = mulDiv(ppm, 50 + c.aptitude * 10, 100);
  ppm = mulDiv(ppm, 100, fatiguePct(c, tick));
  return Math.min(INDUCE_MAX_PPM, ppm);
}

export type InduceResult = 'no_root' | 'induced' | 'failed' | 'meridian';

/**
 * Một ô tự dẫn khí: lần đầu cũng là lần biết linh căn (ghi dải). Không có linh căn: mang ám ảnh, công pháp thành vô dụng.
 * Thành thì vào đường tán tu (không cấp phát, không nghĩa vụ). Hỏng thì mất ô; một phần lần hỏng là thương kinh mạch.
 */
export function induce(c: CharacterState, cult: CultivationState, flags: string[], logic: RegionLogic, tick: Tick, rng: Rng, log: Log): InduceResult {
  const band = testRoot(cult, c.spiritRoot);
  if (band === 'none') {
    if (!flags.includes('haunted')) flags.push('haunted');
    log({ key: 'log.rogue.no_root', params: {}, importance: 'major' });
    return 'no_root';
  }
  if (rng.chance(inducePpm(c, logic, tick))) {
    cult.path = 'rogue';
    log({ key: 'log.rogue.induced', params: { root: `root.${band}` }, importance: 'major' });
    return 'induced';
  }
  if (rng.chance(INDUCE_MERIDIAN_PPM) && !c.conditions.some((x) => x.kind === 'illness')) {
    c.conditions.push({ id: MERIDIAN_ILLNESS, kind: 'illness', severity: 'serious', weeksLeft: rng.int(MERIDIAN.weeks[0], MERIDIAN.weeks[1]) });
    log({ key: 'log.rogue.meridian', params: {}, importance: 'major' });
    return 'meridian';
  }
  log({ key: 'log.rogue.failed', params: {}, importance: 'minor' });
  return 'failed';
}
