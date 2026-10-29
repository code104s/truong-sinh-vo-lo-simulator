// Tuyển tập sự kiện v0.3 (ADR 0014, S6): khoảng 30 sự kiện theo sáu nhóm; v0.6 S7 thêm sự kiện thế lực (ADR 0019); v0.7 S8 thêm
// sự kiện theo nghề và sự kiện chung (ADR 0020 Q3), viết theo văn phong đã duyệt
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
import { FACTION_EVENTS } from './defs/factions';
import { CAREER_EVENTS } from './defs/careers';
import { SEASON_EVENTS } from './defs/seasons';

export { WANDERING_PHYSICIAN_FEE } from './defs/health';
export { COMING_OF_AGE_LIVE } from './defs/daily';
export { CAREER_EVENT_IDS, CAREER_EVENTS_OF } from './defs/careers';

export const EVENTS: readonly EventDef[] = sortedCatalog([...DAILY, ...ECONOMY, ...DISASTER, ...ROAD, ...HEALTH, ...FORTUNE, ...FAMILY, ...RELATIONS, ...FACTION_EVENTS, ...CAREER_EVENTS, ...SEASON_EVENTS]);
/** Id mọi sự kiện, cho công cụ batch kiểm "mỗi sự kiện xảy ra ít nhất một lần". */
export const EVENT_IDS: readonly string[] = EVENTS.map((d) => d.id);
