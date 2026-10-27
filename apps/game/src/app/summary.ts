// Màn tổng kết (F5): rút các ngã rẽ từ những mốc lớn. Khóa kết quả sự kiện là `<id sự kiện>.result.<kết quả>`
// (ADR 0014), nên tách được id sự kiện để ghi tựa. Không có luật game.
import { ageYearsAt, type LogEntry, type Tick } from '@tsvl/shared';

const RESULT = '.result.';

/** Id sự kiện của một dòng kết quả lựa chọn; null nếu không phải. */
export function eventOf(e: LogEntry): string | null {
  const at = e.key.indexOf(RESULT);
  return e.key.startsWith('event.') && at > 0 ? e.key.slice(0, at) : null;
}

export interface TurningPoint { entry: LogEntry; eventId: string; age: number }

/** Ngã rẽ: mọi lựa chọn sự kiện đã chọn trong đời, theo thứ tự thời gian. */
export function turningPoints(milestones: readonly LogEntry[], birthTick: Tick): TurningPoint[] {
  const out: TurningPoint[] = [];
  for (const entry of milestones) {
    const eventId = eventOf(entry);
    if (eventId) out.push({ entry, eventId, age: ageYearsAt(birthTick, entry.tick) });
  }
  return out;
}
