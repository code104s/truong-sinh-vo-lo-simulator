// Tuyển tập sự kiện v0.3 (ADR 0014, S6): khoảng 30 sự kiện theo sáu nhóm, viết theo văn phong đã duyệt
// (docs/van-phong.md, giọng E). Định nghĩa ở events/defs/; văn bản ở packages/content (khóa <id>.*).
import { sortedCatalog, type EventDef } from './engine';
import { DAILY } from './defs/daily';
import { DISASTER } from './defs/disaster';
import { FAMILY } from './defs/family';
import { RELATIONS } from './defs/relations';
import { ECONOMY } from './defs/economy';
import { FORTUNE } from './defs/fortune';
import { HEALTH } from './defs/health';
import { ROAD } from './defs/road';

export { WANDERING_PHYSICIAN_FEE } from './defs/health';
export { COMING_OF_AGE_LIVE } from './defs/daily';

export const EVENTS: readonly EventDef[] = sortedCatalog([...DAILY, ...ECONOMY, ...DISASTER, ...ROAD, ...HEALTH, ...FORTUNE, ...FAMILY, ...RELATIONS]);
/** Id mọi sự kiện, cho công cụ batch kiểm "mỗi sự kiện xảy ra ít nhất một lần". */
export const EVENT_IDS: readonly string[] = EVENTS.map((d) => d.id);
