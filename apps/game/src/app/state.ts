// Máy trạng thái màn hình (thuần, test được không cần DOM). Không có luật game: mọi số liệu đến từ worker.
import { t } from '@tsvl/content';
import type {
  Birthplace, BirthplaceId, CalendarDate, CharacterView, LifeSummary, LogEntry, RegionMapData, RegionSummary, WorkerMessage, WorldSeed, MonthPlan, ActionOption, ActionProgress, TravelOption, TravelPreview,
  MarketView, NpcView, PendingEvent, FactionId, FactionView,
} from '@tsvl/shared';

export type Screen = 'menu' | 'settings' | 'loading' | 'birthplace' | 'life' | 'summary';

export interface WorldInfo {
  seed: WorldSeed;
  region: RegionSummary;
  map: RegionMapData;
  birthplaces: Birthplace[];
}

export interface AppState {
  screen: Screen;
  /** Worker đã báo READY. */
  ready: boolean;
  hasSave: boolean;
  /** Đang tải save (WORLD đến trước STATE; không chuyển sang màn chọn nơi sinh). */
  loadingSave: boolean;
  progress: { stage: string; pct: number } | null;
  world: WorldInfo | null;
  selected: BirthplaceId | null;
  date: CalendarDate | null;
  character: CharacterView | null;
  log: LogEntry[];
  interrupt: LogEntry | null;
  summary: LifeSummary | null;
  /** Đang tua liên tục (tới khi có biến). */
  running: boolean;
  error: string | null;
  seedInput: string;
  plan: MonthPlan | null; active: ActionProgress | null; actions: ActionOption[]; travel: TravelOption[]; travelPreview: TravelPreview | null;
  /** Chợ quận đang đứng và sự kiện chờ chọn (ADR 0012, 0014); giao diện có ở F2, F3. */
  market: MarketView | null; pending: PendingEvent | null;
  /** Người có tên ở quận đang đứng (v0.4, ADR 0016); rỗng tới S1. */
  people: NpcView[];
  /** Người thân, người quen ở mọi quận (v0.5, ADR 0017, 0018); rỗng tới S1. */
  circle: NpcView[];
  /** Thế lực trong vùng và người giữ từng quận (v0.6, ADR 0019); rỗng tới S1. */
  factions: FactionView[];
  control: (FactionId | null)[];
}

export const initialState: AppState = {
  screen: 'menu', ready: false, hasSave: false, loadingSave: false, progress: null, world: null, selected: null,
  date: null, character: null, log: [], interrupt: null, summary: null, running: false, error: null, seedInput: '',
  plan: null, active: null, actions: [], travel: [], travelPreview: null, market: null, pending: null, people: [], circle: [], factions: [], control: [],
};

export type Action =
  | { type: 'msg'; m: WorkerMessage }
  | { type: 'go'; screen: Screen }
  | { type: 'hasSave'; value: boolean }
  | { type: 'genStart' }
  | { type: 'loadStart' }
  | { type: 'newLifeStart' }
  | { type: 'select'; id: BirthplaceId | null }
  | { type: 'run'; on: boolean }
  /** Bắt đầu một lần tua: biển "có biến" cũ không còn đúng nữa. */
  | { type: 'advanceStart' }
  | { type: 'seedInput'; value: string }
  | { type: 'dismissError' }
  /** Lỗi phía giao diện (không qua worker), vd. save của bản cũ. */
  | { type: 'error'; message: string };

/** Giữ nhật ký trong bộ nhớ UI ở mức vừa phải; save vẫn giữ đủ. */
export const LOG_LIMIT = 2000;

export function reduce(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'go':
      return { ...s, screen: a.screen, error: null };
    case 'hasSave':
      return { ...s, hasSave: a.value };
    case 'genStart':
      return { ...s, screen: 'loading', progress: { stage: 'progress.worldgen', pct: 0 }, world: null, selected: null, loadingSave: false, error: null };
    case 'loadStart':
      return { ...s, screen: 'loading', progress: null, loadingSave: true, log: [], interrupt: null, summary: null, character: null, error: null };
    case 'newLifeStart':
      return { ...s, log: [], interrupt: null, summary: null, character: null, running: false, plan: null, active: null, actions: [], travel: [], travelPreview: null, market: null, pending: null, people: [], circle: [], factions: [], control: [] };
    case 'select':
      return { ...s, selected: a.id };
    case 'advanceStart':
      return { ...s, interrupt: null };
    case 'run':
      return { ...s, running: a.on, interrupt: a.on ? null : s.interrupt };
    case 'seedInput':
      return { ...s, seedInput: a.value };
    case 'dismissError':
      return { ...s, error: null };
    case 'error':
      return { ...s, error: a.message };
    case 'msg':
      return onMessage(s, a.m);
  }
}

function onMessage(s: AppState, m: WorkerMessage): AppState {
  switch (m.type) {
    case 'READY':
      return { ...s, ready: true };
    case 'PROGRESS':
      return { ...s, progress: { stage: m.stage, pct: m.pct } };
    case 'WORLD': {
      const world = { seed: m.worldSeed, region: m.region, map: m.map, birthplaces: m.birthplaces };
      if (s.loadingSave) return { ...s, world };
      return { ...s, world, selected: null, progress: null, screen: s.screen === 'loading' ? 'birthplace' : s.screen };
    }
    case 'LOG': {
      const log = s.log.concat(m.entries);
      return { ...s, log: log.length > LOG_LIMIT ? log.slice(log.length - LOG_LIMIT) : log };
    }
    case 'STATE': {
      const toLife = s.screen === 'loading' || s.screen === 'birthplace';
      return { ...s, date: m.date, character: m.character, plan: m.plan, active: m.active, actions: m.actions, travel: m.travel, travelPreview: null, market: m.market, pending: m.pending, people: m.people, circle: m.circle, factions: m.factions, control: m.control, loadingSave: false, screen: toLife ? 'life' : s.screen };
    }
    case 'INTERRUPT':
      return { ...s, interrupt: m.entry, running: false };
    case 'EVENT':
      return { ...s, pending: m.pending, running: false };
    case 'DIED':
      return { ...s, summary: m.summary, running: false, hasSave: false, screen: 'summary' };
    case 'SAVED':
      return s;
    case 'TRAVEL_PREVIEW':
      return { ...s, travelPreview: m.preview };
    case 'ERROR': {
      const back = s.screen === 'loading';
      // Save của bản sim khác (hình snapshot đã đổi): báo như save bản cũ, không hiện lỗi kỹ thuật
      const error = m.code === 'VERSION' && s.loadingSave ? t('ui.save.outdated_sim') : `${m.code}: ${m.message}`;
      return { ...s, error, running: false, loadingSave: false, screen: back ? 'menu' : s.screen };
    }
  }
}
