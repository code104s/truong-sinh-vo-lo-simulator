// Chữ Hán trang trí cho ấn triện và vòng mùa. Chỉ để hiển thị, không phải luật game.
import type { LogEntry, Season, SettlementKind } from '@tsvl/shared';

export const SEASON_CHAR: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
export const KIND_CHAR: Record<SettlementKind, string> = { city: '城', town: '鎮', village: '村' };

export type SealTone = 'red' | 'ink' | 'jade' | 'ochre';

/** Ấn của từng hành động trong kế hoạch tháng và bảng chọn. */
export const ACTION_CHAR: Record<string, { char: string; tone: SealTone }> = {
  'action.farm': { char: '耕', tone: 'ink' }, 'action.hire': { char: '傭', tone: 'ink' }, 'action.forage': { char: '採', tone: 'ink' },
  'action.hunt': { char: '獵', tone: 'ink' }, 'action.trade': { char: '商', tone: 'ink' }, 'action.study': { char: '學', tone: 'ink' },
  'action.train': { char: '武', tone: 'ink' }, 'action.rest': { char: '休', tone: 'jade' }, 'action.heal': { char: '醫', tone: 'jade' },
  'action.travel': { char: '行', tone: 'red' },
};

/** Ấn triện cho một mục nhật ký theo khóa nội dung: chữ và màu. */
export function logSeal(e: LogEntry): { char: string; tone: SealTone } | null {
  if (e.key === 'log.birth') return { char: '生', tone: 'red' };
  if (e.key === 'log.death' || e.key === 'log.death.hungry') return { char: '終', tone: 'ink' };
  if (e.key === 'log.age.milestone') return { char: '壽', tone: 'red' };
  if (e.key === 'log.illness.onset') return { char: '病', tone: 'ink' };
  if (e.key === 'log.injury.onset') return { char: '傷', tone: 'ink' };
  if (e.key === 'log.health.worse') return { char: '危', tone: 'ink' };
  if (e.key.endsWith('.recovered')) return { char: '癒', tone: 'red' };
  if (e.key.startsWith('log.hunger.')) return { char: '飢', tone: 'red' };
  if (e.key.startsWith('log.harvest.') || e.key === 'log.world.harvest_good') return { char: '穀', tone: 'jade' };
  if (e.key === 'log.world.famine' || e.key === 'log.world.harvest_bad') return { char: '荒', tone: 'ochre' };
  if (e.key.startsWith('log.tax.')) return { char: '稅', tone: 'ink' };
  if (e.key === 'log.travel.arrived') return { char: '行', tone: 'ink' };
  return null;
}
