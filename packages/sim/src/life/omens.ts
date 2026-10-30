// Dấu hiệu tiên duyên (v0.8 S7, ADR 0023): linh căn vẫn ẩn, nhưng để lại dấu vết trong tuổi thơ — ngủ mơ thấy ánh sáng,
// ốm mau lành, gia súc sợ, nghe được tiếng gió trên núi. Linh căn càng tốt càng hay lộ; người không có cũng đôi khi gặp
// chuyện lạ (trùng hợp), nên đọc dấu hiệu là kỹ năng của người chơi, không phải lời phán. Chỉ là dòng biên niên, không
// đổi luật; suy từ seed gốc của đời bằng băm (không rút RNG, không lưu), nên đời cũ phát lại vẫn cùng digest.
import { ageYearsAt, type LogEntry, type Tick } from '@tsvl/shared';
import { hash32 } from '../core/hash';
import type { CharacterState } from './character';
import { rootBand } from './cultivation';

type Log = (e: Omit<LogEntry, 'tick'>) => void;

/** Tuổi có thể lộ dấu hiệu (đầu mỗi năm): từ lúc biết nhớ tới trước khi tự xếp việc. */
export const OMEN_AGES = [4, 11] as const;
/** Cơ hội lộ dấu hiệu mỗi năm (ppm) theo dải linh căn; không có linh căn thì chỉ là trùng hợp. */
export const OMEN_PPM = { none: 30_000, mixed: 250_000, fair: 350_000, good: 500_000 } as const;
/** Các dấu hiệu, khóa nội dung `log.omen.<id>`. */
export const OMENS = ['dream_light', 'quick_heal', 'beasts_shy', 'wind_voice'] as const;

/** Đầu năm, trẻ 4–11 tuổi: có thể lộ một dấu hiệu. `seed`: seed gốc của đời (`lifeRoot`). Trả dấu hiệu đã lộ, hay null. */
export function omenYear(c: CharacterState, seed: number, tick: Tick, log: Log): string | null {
  const age = ageYearsAt(c.birthTick, tick);
  if (age < OMEN_AGES[0] || age > OMEN_AGES[1]) return null;
  const h = hash32('omen', seed, age);
  if (h % 1_000_000 >= OMEN_PPM[rootBand(c.spiritRoot)]) return null;
  const omen = OMENS[hash32('omen-kind', seed, age) % OMENS.length]!;
  log({ key: `log.omen.${omen}`, params: { age }, importance: 'major' });
  return omen;
}
