// Chữ Hán trang trí cho ấn triện và vòng mùa. Chỉ để hiển thị, không phải luật game.
import type { LogEntry, Season, SettlementKind } from '@tsvl/shared';

export const SEASON_CHAR: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
export const KIND_CHAR: Record<SettlementKind, string> = { city: '城', town: '鎮', village: '村' };

/** Ấn triện cho một mục nhật ký theo khóa nội dung: chữ và màu. */
export function logSeal(e: LogEntry): { char: string; tone: 'red' | 'ink' } | null {
  if (e.key === 'log.birth') return { char: '生', tone: 'red' };
  if (e.key === 'log.death') return { char: '終', tone: 'ink' };
  if (e.key === 'log.age.milestone') return { char: '壽', tone: 'red' };
  if (e.key === 'log.illness.onset') return { char: '病', tone: 'ink' };
  if (e.key === 'log.injury.onset') return { char: '傷', tone: 'ink' };
  if (e.key === 'log.health.worse') return { char: '危', tone: 'ink' };
  if (e.key.endsWith('.recovered')) return { char: '癒', tone: 'red' };
  return null;
}
