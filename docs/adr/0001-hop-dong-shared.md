# ADR 0001 — Hợp đồng `packages/shared` cho v0.1

- Trạng thái: **ĐÃ DUYỆT** (2026-10-25, chủ dự án đồng ý mọi khuyến nghị Q1–Q13 ở `docs/v0.1-giai-doan-a.md`)
- Ngày: 2026-10-25
- Liên quan: GDD 3.2 A–D, 3.2 O, 8.2, 10.4; ADR 0002–0007

## Bối cảnh
v0.1 làm song song hai nhánh: FE (`apps/game`, `packages/content`) và Sim (`packages/sim`, `packages/worldgen`, `tools/headless`). Hai nhánh chỉ gặp nhau qua `packages/shared`. Hiện `packages/shared/src/index.ts` rỗng.

"Backend" là lõi mô phỏng chạy trong Web Worker. Worker chứa cả `worldgen` (sinh bản đồ) và `sim` (đời người). UI chỉ gửi lệnh và vẽ những gì worker trả về.

## Phương án
1. **Chỉ định kiểu TypeScript, không validate.** Nhanh, nhưng dữ liệu hỏng (save cũ, worker lỗi) lọt vào UI mà không báo.
2. **Kiểu + validate viết tay trong `shared`** (type guard trả `Result`). Không thêm package.
3. **Schema bằng `zod`** (đã dùng ở `portrait-studio`). Gọn hơn khi số kiểu tăng, nhưng thêm dependency và kích thước bundle trong worker.

## Quyết định (đề xuất)
Phương án 2 cho v0.1. Xem lại phương án 3 khi số kiểu lệnh vượt ~20 (v0.3, có sự kiện lựa chọn).

Nguyên tắc:
- `shared` chỉ chứa kiểu, hằng số hợp đồng, hàm thuần không có luật game (lịch, validate, mã hóa save). Không có con số cân bằng.
- Mọi thứ người chơi đọc là **khóa nội dung + tham số**, không phải câu văn. FE dịch qua `packages/content`.
- Số trong trạng thái mô phỏng là số nguyên. Số thực chỉ có trong dữ liệu vẽ bản đồ (`RegionMapData`), không bao giờ là đầu vào của luật.
- Có `PROTOCOL_VERSION`. Đổi hợp đồng sau Bước 0 phải ghi lý do ở cuối file này và cập nhật cả hai nhánh.

## Hợp đồng

### Định danh và cấu hình đời mới
```ts
export const PROTOCOL_VERSION = 1;

/** Seed thế giới người chơi thấy (vd. "tsvl-01"). worldgen nhận nguyên chuỗi. */
export type WorldSeed = string;
/** Vùng chơi. v0.1 mỗi thế giới chỉ có một vùng; vẫn giữ trường để mở rộng. Dạng "r<realmIndex>". */
export type RegionId = string & { readonly __brand: 'RegionId' };
/** Nơi sinh. Ổn định với cùng seed: "<regionId>/c<countyIndex>" hoặc "<regionId>/c<countyIndex>v<n>". */
export type BirthplaceId = string & { readonly __brand: 'BirthplaceId' };

export interface NewLifeConfig {
  worldSeed: WorldSeed;
  regionId: RegionId;
  birthplaceId: BirthplaceId;
  /**
   * [CẦN DUYỆT, xem mục "Quyết định cần duyệt" Q5] Seed riêng của đời, u32.
   * Bỏ trống thì sim suy ra từ worldSeed + birthplaceId (GDD 3.2 A: seed nhân vật gắn với seed thế giới).
   */
  lifeSeed?: number;
}
```

### Nơi sinh và bản đồ vùng
```ts
export type SettlementKind = 'village' | 'town' | 'city'; // làng / trấn / thành

export interface Birthplace {
  id: BirthplaceId;
  /** Tên Hán-Việt, vd. "Vị Kinh". */
  name: string;
  /** Tên chữ Hán gốc từ Cartographer, vd. "渭京". Chỉ để tra cứu và kiểm thử. */
  nameHan: string;
  kind: SettlementKind;
  /** Toạ độ ô trong RegionMapData (số nguyên, gốc ở góc trên trái của vùng). */
  cell: { x: number; y: number };
  /** Quận chứa nơi sinh (chỉ số trong RegionMapData.counties). */
  county: number;
}

export interface RegionSummary {
  id: RegionId;
  name: string;      // Hán-Việt
  nameHan: string;
  realmName: string; // tên nước, Hán-Việt
  kmPerCell: number; // chỉ để hiển thị thước tỉ lệ
  landKm2: number;   // số nguyên
}

/**
 * Dữ liệu chỉ để VẼ. Số thực được phép. Sim không đọc lại từ đây.
 * Tập trường chốt khi làm task FE "adapter bản đồ" (renderer đọc: elevation, coastDist, biome,
 * flow, temperature, realm, political, labels, rivers, roads, kmPerCell, params).
 */
export interface RegionMapData {
  W: number;
  H: number;
  /** Vị trí góc trên trái của vùng trong thế giới gốc (ô). */
  origin: { x: number; y: number };
  kmPerCell: number;
  elevation: Float32Array;
  water: Float32Array;
  coastDist: Float32Array;
  flow: Float32Array;
  temperature: Float32Array;
  biome: Uint8Array;
  /** 1 = ô thuộc vùng chơi, 0 = ngoài vùng (vẽ mờ). */
  mask: Uint8Array;
  /** Chỉ số quận theo ô, -1 ngoài vùng hoặc biển. */
  county: Int16Array;
  counties: { name: string; nameHan: string; seat: { x: number; y: number } }[];
  rivers: { points: Float32Array; flow: Float32Array }[];
  roads: { kind: 'major' | 'minor' | 'sea'; pts: number[] }[];
  /** Nhãn địa lý (núi, hồ, sông…) đã đổi sang Hán-Việt, toạ độ theo vùng. */
  labels: { kind: string; name: string; x: number; y: number; angle: number; weight: number; span: number; path?: number[] }[];
}
```

### Lịch (chi tiết ADR 0002)
```ts
export const DAYS_PER_TICK = 10;
export const TICKS_PER_MONTH = 3;
export const MONTHS_PER_YEAR = 12;
export const TICKS_PER_YEAR = 36;

export type Tick = number; // số nguyên ≥ 0, tick 0 = thượng tuần tháng Giêng năm 1
export type TenDay = 0 | 1 | 2; // thượng / trung / hạ tuần
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface CalendarDate {
  tick: Tick;
  year: number;   // ≥ 1
  month: number;  // 1..12
  tenDay: TenDay;
  season: Season;
}
export function calendarOf(tick: Tick): CalendarDate;
```

### Nhân vật người chơi được thấy
```ts
export type Gender = 'male' | 'female';
/** Id nội dung; nhãn hiển thị nằm trong packages/content. */
export type ContentId = string;

export interface CharacterView {
  name: string;               // Hán-Việt, vd. "Trần Văn An"
  gender: Gender;
  birthTick: Tick;
  ageYears: number;           // tuổi thật, số nguyên (ADR 0002)
  birthplaceId: BirthplaceId;
  background: ContentId;      // xuất thân, vd. "bg.peasant"
  personality: ContentId;
  /** Thiên phú người chơi biết được (có thể rỗng). Thiên phú ẩn không nằm ở đây. */
  traits: ContentId[];
  /** Mô tả thô thay vì con số thật: "constitution.frail" | ... */
  constitution: ContentId;
  /** Sức khỏe hiện tại làm tròn 0..100 bước 5, và mức chữ. */
  healthPct: number;
  healthBand: 'robust' | 'healthy' | 'weak' | 'ill' | 'dying';
  /** Bệnh và thương tật đang biết. */
  conditions: { id: ContentId; severity: 'mild' | 'serious' | 'grave' }[];
  alive: boolean;
}
// KHÔNG có trong view: linh căn, thọ nguyên gốc, phúc duyên, mọi trạng thái RNG.
// Có test ở Bước 0 kiểm tra các khóa này không xuất hiện.
```

### Nhật ký và tổng kết
```ts
export interface LogEntry {
  tick: Tick;
  /** Khóa nội dung, vd. "log.illness.onset". */
  key: string;
  params: Record<string, string | number>;
  importance: 'minor' | 'major';
}

export type DeathCause = 'old_age' | 'illness' | 'accident' | 'starvation' | 'violence' | 'disaster';

export interface LifeSummary {
  name: string;
  birthTick: Tick;
  deathTick: Tick;
  ageYears: number;
  cause: DeathCause;
  /** Chi tiết nguyên nhân, vd. "illness.consumption". */
  causeDetail: ContentId;
  birthplaceId: BirthplaceId;
  milestones: LogEntry[]; // các LogEntry importance = 'major'
  digest: string;
}
```

### Giao thức Worker
```ts
export type AdvanceMode = 'week' | 'month' | 'year' | 'untilEvent';

/** UI → worker. reqId do UI tăng dần; worker trả lại trong mọi tin phản hồi. */
export type Command =
  | { type: 'GEN_WORLD'; reqId: number; worldSeed: WorldSeed }
  | { type: 'NEW_LIFE'; reqId: number; config: NewLifeConfig }
  | { type: 'ADVANCE'; reqId: number; mode: AdvanceMode }
  | { type: 'PAUSE'; reqId: number }
  | { type: 'SAVE'; reqId: number }
  | { type: 'LOAD'; reqId: number; save: SaveFile };

/** worker → UI. */
export type WorkerMessage =
  | { type: 'READY'; protocolVersion: number; simVersion: string }
  | { type: 'PROGRESS'; reqId: number; stage: string; pct: number }      // khi sinh thế giới (~5 s)
  | { type: 'WORLD'; reqId: number; region: RegionSummary; map: RegionMapData; birthplaces: Birthplace[] }
  | { type: 'STATE'; reqId: number; date: CalendarDate; character: CharacterView; running: boolean }
  | { type: 'LOG'; reqId: number; entries: LogEntry[] }
  | { type: 'INTERRUPT'; reqId: number; entry: LogEntry }               // dừng tua vì có biến
  | { type: 'DIED'; reqId: number; summary: LifeSummary }
  | { type: 'SAVED'; reqId: number; save: SaveFile }
  | { type: 'ERROR'; reqId: number | null; code: ErrorCode; message: string };

export type ErrorCode = 'BAD_COMMAND' | 'NO_WORLD' | 'NO_LIFE' | 'DEAD' | 'BAD_SAVE' | 'VERSION' | 'INTERNAL';

export function parseCommand(u: unknown): Result<Command>;
export function parseWorkerMessage(u: unknown): Result<WorkerMessage>;
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
```

Luồng chuẩn:
```
UI                               worker
 ─(khởi động)──────────────────▶ READY
 GEN_WORLD{seed} ──────────────▶ PROGRESS* → WORLD{region,map,birthplaces}
 NEW_LIFE{config} ─────────────▶ STATE, LOG
 ADVANCE{year} ────────────────▶ LOG*, STATE            (hoặc INTERRUPT rồi STATE)
 ADVANCE{untilEvent} ──────────▶ LOG*, STATE*(mỗi năm), INTERRUPT, STATE
 PAUSE ────────────────────────▶ STATE{running:false}
 ...                             LOG, DIED{summary}
 SAVE ─────────────────────────▶ SAVED{save}
 LOAD{save} ───────────────────▶ WORLD, STATE, LOG(toàn bộ)
```
Ghi chú: ví dụ trong đề bài không có bước sinh thế giới riêng, nhưng người chơi phải **thấy bản đồ và danh sách nơi sinh trước** khi `NEW_LIFE`, nên cần `GEN_WORLD` → `WORLD`.

### Save (chi tiết ADR 0004)
```ts
export interface SaveFile {
  format: 'tsvl-save';
  version: 1;
  protocolVersion: number;
  simVersion: string;
  worldSeed: WorldSeed;
  region: { summary: RegionSummary; map: SaveMap; birthplaces: Birthplace[]; logic: unknown /* lớp logic của worldgen, sim sở hữu */ };
  sim: unknown;   // snapshot của sim, sim sở hữu định dạng
  log: LogEntry[];
  digest: string; // digest của sim tại thời điểm lưu
}
/** RegionMapData với mảng số mã hóa base64 để lưu JSON. */
export type SaveMap = Omit<RegionMapData, 'elevation' | 'water' | 'coastDist' | 'flow' | 'temperature' | 'biome' | 'mask' | 'county' | 'rivers'> & { arrays: Record<string, string>; rivers: { points: string; flow: string }[] };
export function encodeSave(s: SaveFile): string;
export function decodeSave(text: string): Result<SaveFile>;
```

## Hệ quả
- FE dựng được toàn bộ màn hình bằng worker giả chỉ dựa vào file này.
- Sim tự do định dạng `sim` và `region.logic` bên trong save; FE coi là hộp đen.
- `RegionMapData` có số thực nên **không** đưa vào digest sim. Digest vùng (ADR 0007) tính trên dữ liệu nguyên (id, tên, toạ độ ô, kiểu nơi sinh).
- Bước 0 gồm: code các kiểu trên, `calendarOf`, `parseCommand`/`parseWorkerMessage`, `encodeSave`/`decodeSave`, và test (round-trip, từ chối dữ liệu sai, view không lộ trường ẩn).

## Nhật ký thay đổi hợp đồng

### 2026-10-27 — Ghép v0.2
- `STATE` thêm `active: ActionProgress | null` (`action`, `remaining`, `total`, `target?`) để FE hiện hành động đang chiếm ô qua ranh tháng. Cập nhật validator và fixture ở cả hai phía; protocol vẫn là 2 của v0.2 chưa phát hành.
- Các trường tạm B0 đã nối vào mô phỏng thật. `SET_PLAN`/`PREVIEW_TRAVEL` được xử lý; save chứa nhật ký lệnh thật và tiến độ hành động.
- Lớp logic vùng lưu `settlementKind`, hệ số nguyên `terrainPct` theo cạnh và tên quận cho nhật ký. Snapshot bổ sung thể lực, kỹ năng, lần dùng kỹ năng, kế hoạch và hành động dở. Save thử nghiệm B0 thiếu các trường này bị từ chối; không có migration v0.x.

**Nguồn sự thật từ Bước 0 là code `packages/shared/src/`**; các khối TypeScript ở trên là bản nháp lúc duyệt.

### 2026-10-25 — Bước 0 (B0-1), chỉnh khi code, trước khi hai nhánh bắt đầu
- `SaveFile.region.map` là `RegionMapData` (mảng số giữ nguyên kiểu, đi được qua `postMessage` và IndexedDB). Bỏ kiểu `SaveMap`; base64 chỉ xảy ra trong `encodeSave`/`decodeSave` (JSON văn bản cho CLI và xuất file). Lý do: UI không phải tự giải mã.
- `WORLD` thêm `worldSeed` (UI cần để tạo `NewLifeConfig`).
- `CharacterView` thêm `aptitude` (ngộ tính hiện thô, theo bảng thuộc tính đã duyệt).
- `LifeSummary` thêm `config: NewLifeConfig` (đủ để chơi lại/đối chiếu đời trong CLI).
- `RegionMapData.counties` là `{ name, nameHan, seat }`; thêm kiểu con `MapLabel`, `MapRoad`, `MapRiver`, `MapCounty`, `CellPos`.
- `LogEntry.params` chỉ nhận chuỗi hoặc **số nguyên** (sim không sinh số thực).
- Validator từ chối mọi khóa không có trong hợp đồng; `HIDDEN_CHARACTER_KEYS` liệt kê khóa ẩn để test.
- Thêm hàm lịch thuần: `isMonthStart`, `isQuarterStart`, `isYearStart`, `ageYearsAt`, `seasonOfMonth`.
- Nhánh bị ảnh hưởng: chưa nhánh nào bắt đầu.

### 2026-10-26 — v0.2 Bước 0 (ADR 0008–0011)
Lý do: v0.2 thêm hành động, kế hoạch tháng, di chuyển và nhật ký lệnh. `PROTOCOL_VERSION` 1 → **2**, `SAVE_VERSION` 1 → **2** (save v0.1 bị từ chối như ADR 0004 đã định).
- Tệp mới `actions.ts`: `ActionId`, `CountyIndex`, `PlanSlot`, `MonthPlan` (đúng 3 ô), `ActionGroup`, `ActionOption`, `TravelOption`, `TravelPreview`, `StaminaBand`, `SkillView`, `RecordedCommand`, `CommandRecord` và validator. `ADVANCE_MODES` chuyển từ `protocol.ts` sang đây (protocol vẫn xuất lại) để tránh vòng import save ↔ protocol.
- Tệp mới `contentId.ts`: `ContentId`, `CONTENT_ID_RE`, `vContentId` (tách khỏi `character.ts` để tránh vòng import).
- `CharacterView` thêm `location`, `home`, `staminaBand`, `skills`, `canAct`. `HIDDEN_CHARACTER_KEYS` thêm `stamina`, `skillXp`, `commandLog`.
- Lệnh mới `SET_PLAN { plan }`, `PREVIEW_TRAVEL { county }`. Tin `STATE` thêm `plan`, `slotIndex`, `actions`, `travel`. Tin mới `TRAVEL_PREVIEW { preview }`.
- `SaveFile` thêm `commandLog: CommandRecord[]`.
- Nhánh bị ảnh hưởng: **Sim** — `CharacterState` thêm `home`/`location` (= quận nơi sinh), `SIM_VERSION` 0.2.0, view trả giá trị tạm (`staminaBand: 'fresh'`, `skills: []`, `canAct: false`), `STATE` trả kế hoạch/hành động rỗng, `SET_PLAN`/`PREVIEW_TRAVEL` trả `BAD_COMMAND` cho tới S7, save ghi `commandLog: []`. Digest pin đổi (tuổi và nguyên nhân chết 3 seed mẫu giữ nguyên). **FE** — máy trạng thái bỏ qua `TRAVEL_PREVIEW` cho tới F3.

### 2026-10-27 — v0.3 Bước 0 (ADR 0012–0014)
Lý do: v0.3 thêm kinh tế phàm nhân, hộ và đói, sự kiện có lựa chọn. `PROTOCOL_VERSION` 2 → **3**, `SAVE_VERSION` 2 → **3** (save v0.2 bị từ chối, không chuyển đổi — v0.3 Q9).
- Tệp mới `economy.ts`: `Coin` (văn), `Grain` (thăng, `GRAIN_PER_DOU` = 10), `HUNGER_BANDS`, `SUPPLY_BANDS`, `TENURES`, `FOOD_WEEKS_BANDS`, `PRICE_TRENDS`, `HouseholdView`, `MarketView` và validator.
- Tệp mới `events.ts`: `EventId`, `EVENT_COST_TAGS`, `EventChoiceView`, `EventFigure`, `PendingEvent` và validator. Validator bắt buộc: ít nhất một lựa chọn, mỗi lựa chọn ≥ 1 giá, id lựa chọn không trùng, **ít nhất một lựa chọn không khóa** (ADR 0014: luôn có lối ra).
- `contentId.ts` thêm `ChoiceId`, `CHOICE_ID_RE`, `vChoiceId` (đặt ở đây để `actions` và `events` cùng dùng, không vòng import).
- `CharacterView` thêm `household: HouseholdView`. Mức đói hiện dưới tên `hungerBand`; bộ đếm thật `hunger` và `stayUntil` vào `HIDDEN_CHARACTER_KEYS`.
- `ActionOption.cost` thêm `money: ContentId` (**bắt buộc**, không phải tùy chọn như bản nháp Giai đoạn A: `cost.none` khi không tốn tiền, để FE không phải đoán).
- Lệnh mới `TRADE { grain }` (số nguyên khác 0; > 0 mua, < 0 bán, đơn vị thăng) và `CHOOSE { instance, choice }`; cả hai vào `RecordedCommand`. Tin `STATE` thêm `market: MarketView | null`, `pending: PendingEvent | null`. Tin mới `EVENT { pending }` (tua dừng vì sự kiện; bản nháp ghi là trạng thái `'event'` của kết quả ADVANCE). Mã lỗi mới `EVENT_PENDING`.
- `fertilityPct` nằm trong `RegionLogic` của **worldgen** (không phải `world.ts` của shared như bản nháp ghi): lớp logic là của sim/worldgen, save chỉ chở dạng `unknown`. Sim kiểm khoảng `FERTILITY_MIN..FERTILITY_MAX` khi tải.
- Nhánh bị ảnh hưởng: **Sim** — `SIM_VERSION` 0.3.0, thêm luồng RNG `economy`, `events`, `weather` (digest pin đổi; tuổi và nguyên nhân chết 3 seed mẫu giữ nguyên), view trả hộ tạm (`independent: false`, túi và kho 0, `tenure: 'none'`) tới S1, hành động `money: 'cost.none'` tới S4, `STATE` trả `market: null`/`pending: null` tới S2/S5, `TRADE`/`CHOOSE` trả `BAD_COMMAND` tới S4/S5. **FE** — máy trạng thái giữ `market`, `pending`; tin `EVENT` dừng tua liên tục; giao diện chợ và thẻ sự kiện ở F2, F3. Save v2 trong IndexedDB: nút "Tiếp tục" báo rõ save của bản cũ thay vì lỗi hợp đồng.

### 2026-10-27 — v0.3 S5
- `PendingEvent.choices`: **2–4 lựa chọn** (`MIN_CHOICES`, `MAX_CHOICES`), thay cho "ít nhất 1". Một lựa chọn thì không còn là lựa chọn: viết thành sự kiện không lựa chọn (kể và áp hậu quả ngay, không dừng tua). Hơn bốn thì thẻ sự kiện phải cuộn và lựa chọn nhạt. Giới hạn tính trên mọi lựa chọn hiện ra, kể cả lựa chọn bị khóa vì tính cách hay thiếu tiền.
- Nhánh bị ảnh hưởng: **Sim** — mọi sự kiện có lựa chọn phải có 2–4 lựa chọn (test duyệt tuyển tập). **FE** — không đổi.

### 2026-10-27 — v0.3 F4
Lý do: kế hoạch tháng hiện dự báo "đủ ăn tới…". Số tuần ăn do sim tính, cùng công thức với dải `foodWeeksBand`, để giao diện không chép luật khẩu phần.
- `HouseholdView` thêm `grainWeeks` (kho riêng đủ ăn bao nhiêu tuần) và `foodWeeks` (kho cộng tiền quy ra lương theo giá mua ở chợ đang đứng). Cả hai là số tự nhiên, suy ra được từ `grain`, `money` và giá chợ người chơi đã thấy, nên không lộ thêm gì.
- `calendar.ts` thêm `HARVEST_MONTH` (9; trước ở `sim/economy/market.ts`, sim xuất lại) và `weeksToHarvest(tick)`.
- Không đổi `PROTOCOL_VERSION`, `SAVE_VERSION`: view không nằm trong save; worker và giao diện ra cùng một bản.
- Nhánh bị ảnh hưởng: **Sim** — `householdView` điền hai số mới; digest không đổi. **FE** — `ActionPlanner` hiện dự báo.

### 2026-10-27 — v0.3 F5
Lý do: màn tổng kết kể được của cải lúc chết và cái đói của một đời.
- `LifeSummary` thêm:
  - `estate { money, grain, landMu, tenure }`: túi, kho, ruộng lúc nhắm mắt;
  - `hungerYears`: số năm tuổi có ít nhất một tuần không đủ khẩu phần, kể cả lúc còn nhỏ bị bỏ đói.
- Ngã rẽ không cần trường mới: giao diện rút từ `milestones` những dòng kết quả sự kiện (`<id sự kiện>.result.<kết quả>`, ADR 0014).
- Không đổi `PROTOCOL_VERSION`, `SAVE_VERSION`. Tổng kết không nằm trong save. "Sổ các đời" chưa đọc lại tổng kết đã lưu nên không vướng bản cũ.
- `SIM_VERSION` 0.3.0 → **0.3.1**. Hình snapshot đã đổi từ S6 (nợ vay, tai họa, lập thân) mà chưa tăng số, nên save cũ bị từ chối bằng lỗi schema khó hiểu. Nay bị từ chối bằng lỗi `VERSION`; giao diện báo như save bản cũ (`ui.save.outdated_sim`) và cho bắt đầu đời mới. Quy ước từ đây: đổi hình snapshot thì tăng `SIM_VERSION`.
- Nhánh bị ảnh hưởng:
  - **Sim:** hộ thêm `hungerYears`, `lastHungerYear` (ẩn, có trong schema snapshot), đếm ở `feedPhase`. Digest pin đổi; tuổi và nguyên nhân chết giữ nguyên.
  - **FE:** màn tổng kết mới.

### 2026-10-27 — v0.4 Bước 0 (ADR 0015, 0016)
Lý do: v0.4 thêm người có tên quanh người chơi. `PROTOCOL_VERSION` 3 → **4**, `SAVE_VERSION` 3 → **4**. Save v0.3 bị từ chối, không chuyển đổi (v0.4 Q10).
- `contentId.ts` thêm `NpcId`, `NPC_ID_RE` (`n` + số từ 1), `vNpcId`. Đặt ở đây để `events` và `npc` cùng dùng mà không vòng import.
- Tệp mới `npc.ts`:
  - `NpcView { id, name, gender, ageYears, occupation, healthBand, portrait { ageBand, class, key } }` và `vNpcView`;
  - không có thuộc tính ẩn; test kiểm `HIDDEN_CHARACTER_KEYS` bị từ chối.
- `EventFigure` thêm `npcId?` (tùy chọn): người thật trong sự kiện; thiếu thì là người vô danh như v0.3.
- Tin `STATE` thêm `people: NpcView[]`: NPC ở quận người chơi đang đứng, sắp theo id. STATE kiểu v0.3 (thiếu `people`) bị từ chối.
- Nhánh bị ảnh hưởng:
  - **Sim:**
    - `SIM_VERSION` 0.4.0;
    - snapshot thêm `npcs { nextId, people }` (rỗng tới S1), luồng RNG `npc-world`, luồng riêng mỗi NPC suy từ `hash32(lifeRoot, 'npc', id)`;
    - pha NPC (`npcPhase`) cắm vào tick sau pha Thế giới, chưa làm gì;
    - `STATE.people` rỗng;
    - digest pin đổi; tuổi và nguyên nhân chết của ba đời mẫu giữ nguyên; batch v0.3 ra đúng số cũ.
  - **FE:** máy trạng thái giữ `people`; giao diện "Người trong quận" ở F1.

### 2026-10-27 — v0.5 Bước 0 (ADR 0017, 0018)
Lý do: v0.5 thêm quan hệ, gia đình, tiếng tăm. `PROTOCOL_VERSION` 4 → **5**, `SAVE_VERSION` 4 → **5**. Save v0.4 bị từ chối, không chuyển đổi (v0.5 Q11).
- `actions.ts`:
  - `PlanSlot` thêm `person?: NpcId` — người được nhắm tới, chỉ cho hành động xã giao;
  - `ACTION_GROUPS` thêm `social` (Xã giao), đặt sau `study`.
- `npc.ts`:
  - `KinRole` (`father`, `mother`, `spouse`, `son`, `daughter`, `sibling`);
  - `BondView { closeness, trust, hostility, owed }`, mỗi trục là một dải chữ, không lộ số;
  - `NpcView` thêm `kin?`, `bond?`.
- `character.ts`:
  - `ReputationBand` (`infamous`, `disliked`, `unknown`, `respected`, `renowned`);
  - `CharacterView` thêm `reputation` (bắt buộc) và `spouse?: NpcId`;
  - `LifeSummary` thêm `legacy { spouse, children, friends, enemies, reputation }`.
- Tin `STATE` thêm `circle: NpcView[]`: người thân và người có quan hệ ở mọi quận. STATE kiểu v0.4 (thiếu `circle`) bị từ chối.
- Nhánh bị ảnh hưởng:
  - **Sim:**
    - `SIM_VERSION` 0.5.0;
    - `STATE.circle` rỗng, `reputation` luôn `unknown`, `legacy` rỗng tới S1–S6;
    - digest pin đổi; tuổi và nguyên nhân chết của ba đời mẫu giữ nguyên.
  - **Nội dung:** chuỗi `group.social`, `kin.*`, `bond.*`, `reputation.*`.
  - **FE:** máy trạng thái giữ `circle`; giao diện ở F1–F4.

### 2026-10-28 — v0.5 F2 (ô xã giao chọn người)
Lý do: bảng chọn người cần lý do khóa của từng việc xã giao nhắm vào từng người; giao diện không được tự tính luật. Hợp đồng v5 chưa phát hành nên không tăng `PROTOCOL_VERSION`.
- `npc.ts`: `NpcView` thêm `social?: SocialOption[]`, `SocialOption { action: ActionId; locked: ContentId | null }` — mỗi hành động xã giao người chơi xếp được và khóa lúc này (null là làm được). Chỉ có ở `STATE.people` (người trong quận); `STATE.circle` không mang.
- `actions.ts`: xuất `vActionId` (để `npc.ts` kiểm id hành động).
- Nhánh bị ảnh hưởng:
  - **Sim:** `Life.people()` tính khóa bằng `Life.socialLock` (khóa chung của hành động rồi khóa theo người), đúng như khi ô chạy;
  - **FE:** bảng chọn việc có nhóm Xã giao → chọn người; thẻ tuần hiện tên người và lý do khóa (người đã rời quận: "không ở đây").

### 2026-10-28 — v0.6 Bước 0 (ADR 0019)
Lý do: v0.6 thêm thế lực (quan phủ, gia tộc, thương hội, băng cướp). `PROTOCOL_VERSION` 5 → **6**, `SAVE_VERSION` 5 → **6**. Save v0.5 bị từ chối, không chuyển đổi (v0.6 Q11).
- `factions.ts` (mới):
  - `FACTION_KINDS` (`government`, `clan`, `guild`, `bandits`); `FactionId` dạng `"f3"`, cấp tăng dần, không dùng lại;
  - `STRENGTH_BANDS` (`feeble`, `modest`, `strong`, `dominant`), `ATTITUDE_BANDS` (để ngỏ, v0.6 chưa gửi);
  - `FactionName { key: ContentId; params }` — tên ghép từ khóa nội dung và tham số (họ, nơi), giao diện dịch. **Khác bản nháp** (Giai đoạn A mục 4 ghi `name: string`): sim không được tạo chuỗi hiển thị;
  - `FactionView { id, kind, name, seat, counties, strength, members, leader?, attitude? }` — dải chữ, không lộ số;
  - `FACTION_FATES` (`rose`, `fell`, `gone`, `endured`).
- `npc.ts`: `NpcView` thêm `faction?: FactionId`.
- `actions.ts`: `TravelOption` thêm `danger?` (id băng cướp giữ đường; kiểm dạng id ở chỗ, không import `factions.ts` để khỏi vòng); xuất `vActionId`.
- `character.ts`: `LifeSummary.legacy` thêm `factions: { name: FactionName; kind; fate }[]`.
- `calendar.ts`: thêm `monthOf(tick)`, `seasonOf(tick)` (tháng, mùa từ tick, không dựng cả `CalendarDate`).
- Tin `STATE` thêm `factions: FactionView[]` và `control: (FactionId | null)[]` (theo chỉ số quận). STATE kiểu v0.5 (thiếu hai trường) bị từ chối.
- Nhánh bị ảnh hưởng:
  - **Sim:**
    - `SIM_VERSION` 0.6.0; luồng RNG `factions`; pha Thế lực (rỗng) đầu quý, giữa pha Thế giới và pha NPC;
    - snapshot thêm `factions { nextId, list }`; sổ cái cộng kho thế lực;
    - `STATE.factions`, `control` rỗng tới S1; digest pin đổi, tuổi và nguyên nhân chết của ba đời mẫu giữ nguyên.
  - **Nội dung:** `faction.<loại>.name`, `faction.kind.*`, `faction.strength.*`, `faction.fate.*`.
  - **FE:** máy trạng thái giữ `factions`, `control`; giao diện ở F1–F5.

### 2026-10-28 — v0.6 F1 (ADR 0019)
Lý do: bản đồ "ai kiểm soát" vẽ đường bị cướp, thương hội giữ; `FactionView` mới có quận giữ, chưa có đường. v6 chưa phát hành nên không tăng `PROTOCOL_VERSION`, `SAVE_VERSION` (save không chứa `FactionView`).
- `factions.ts`: `FactionView` thêm `roads?: [CountyIndex, CountyIndex][]` — đường thế lực giữ (thương hội, băng cướp), mỗi đường một cặp quận kề [nhỏ, lớn]; không giữ đường thì bỏ trống. Validate: cặp số tự nhiên, số đầu nhỏ hơn.
- Nhánh bị ảnh hưởng: **Sim** `factionViews(fw, logic)` quy chỉ số cạnh ra cặp quận; **FE** lớp "ai kiểm soát" (F1).

### 2026-10-28 — đóng v0.6: `SIM_VERSION` 0.6.1
Lý do: trong v0.6 hình snapshot đổi nhiều lần sau Bước 0 (kho, người giữ quận, độ tham của thế lực S1–S5; mức thuế, lương của quận S6; chủ nợ S7; thế lực đã thấy F4) mà `SIM_VERSION` vẫn 0.6.0. Save tạo trong lúc phát triển bị từ chối bằng lỗi schema khó hiểu. Theo quy ước ở mục 0.3.1 (đổi hình snapshot thì tăng `SIM_VERSION`), tăng lên **0.6.1** khi đóng phiên bản: save dev cũ bị từ chối bằng lỗi `VERSION`, giao diện báo save bản cũ. `PROTOCOL_VERSION`, `SAVE_VERSION` giữ 6.


### 2026-10-29 — v0.7 Bước 0 (ADR 0020)
Lý do: v0.7 thêm thân phận nghề của người chơi. `PROTOCOL_VERSION` 6 → **7**, `SAVE_VERSION` 6 → **7**. Save v0.6 bị từ chối, không chuyển đổi (v0.7 Q12).
- `careers.ts` (mới):
  - `CAREERS` (`farmer`, `artisan`, `hunter`, `merchant`, `physician`, `soldier`, `drifter`, `recluse`, `outlaw`), khóa nội dung `career.<id>`;
  - `CAREER_RANKS` (`apprentice`, `journeyman`, `master`), khóa nội dung `career.rank.<bậc>`;
  - `CareerView { id, rank, since: Tick, faction?: FactionId }` — dải chữ, không lộ số kinh nghiệm;
  - `CareerRecord { id, rank, years }` — một nghề đã làm trong đời, bậc cao nhất.
- `character.ts`: `CharacterView` thêm `career: CareerView | null` (bắt buộc; view kiểu v0.6 thiếu trường bị từ chối); `LifeSummary.legacy` thêm `careers: CareerRecord[]`.
- Kỹ năng: thêm `medicine` (y thuật) ở sim; `SkillView` không đổi hình.
- Nhánh bị ảnh hưởng:
  - **Sim:**
    - `SIM_VERSION` 0.7.0; snapshot thêm `career` (luôn `null` tới S1); `skillXp`, `skillLastUsed` thêm `medicine`;
    - `view().career` `null`, `legacy.careers` rỗng; digest pin đổi, tuổi và nguyên nhân chết của ba đời mẫu giữ nguyên.
  - **Nội dung:** `career.*`, `career.rank.*`, `skill.medicine`.
  - **FE:** chưa hiển thị (F1–F5).

### 2026-10-29 — v0.7 S1 (ADR 0020)
Lý do: người chơi rời nghề là một quyết định tức thời, không tốn ô, như mua bán lương. v7 chưa phát hành nên không tăng `PROTOCOL_VERSION`, `SAVE_VERSION`.
- `protocol.ts`: lệnh `LEAVE_CAREER { reqId }`.
- `actions.ts`: `RecordedCommand` thêm `{ type: 'LEAVE_CAREER' }` để phát lại save.
- Hành động mới `action.apprentice` (xin học việc, học việc): nhóm `social`, nhắm vào một người (`PlanSlot.person`); `NpcView.social` có thêm khóa của nó. Không đổi kiểu.
- Nhánh bị ảnh hưởng: **Sim** xử lý lệnh, ghi nhật ký lệnh; **Nội dung** `action.apprentice`, `gain.career`, `lock.not_master`, `log.career.*`; **FE** nút rời nghề ở F1–F5.

### 2026-10-29 — v0.7 S3b (ADR 0021)
Lý do: kho đồ của người chơi (chủ dự án duyệt Q13–Q20). v7 chưa phát hành nên không tăng `PROTOCOL_VERSION`, `SAVE_VERSION`.
- `economy.ts`:
  - `GOODS` (`hide`, `wares`, `herb`), `GoodId`, khóa nội dung `good.<id>`;
  - `GOOD_UNITS_PER_PART` = 10: hàng đếm bằng phân, giá văn/phần — như thăng và đấu của lương thực;
  - `HouseholdView` thêm `goods: GoodStack[]` (chỉ món đang có) và `goodsCap` (sức gánh, phân) — `goodsCap` thêm ngoài ADR 0021 để giao diện F3b vẽ sức gánh mà không giữ số cân bằng;
  - `MarketView` thêm `goods: MarketGoodView[]` (đủ ba món: giá mua, bán mỗi phần, dải cung, xu hướng, giới hạn mua bán bằng phân).
- `actions.ts`: `PlanSlot.cargo?: Cargo` (`'grain'` hay một `GoodId`; chỉ cho `action.haul`); `RecordedCommand` thêm `{ type: 'TRADE_GOODS'; good; qty }`.
- `protocol.ts`: lệnh `TRADE_GOODS { reqId, good, qty }` (phân; > 0 mua, < 0 bán, khác 0).
- Nhánh bị ảnh hưởng:
  - **Sim:** snapshot thêm túi đồ của hộ, chợ hàng mỗi quận; xử lý lệnh, ghi nhật ký lệnh; digest pin đổi (ghi chú ở `life.test.ts`).
  - **Nội dung:** `good.*`, `gain.goods`, `lock.goods_full`, `log.haul.goods_*`.
  - **FE:** fixture test thêm trường mới; khối Hành trang, chợ hàng, chọn hàng cho chuyến buôn ở F3b.

### 2026-10-29 — v0.7 S7 (ADR 0020 Q9)
- Không đổi kiểu. `FactionView.attitude` (có từ v6, để ngỏ) **bắt đầu gửi** cho mọi thế lực còn sống, theo dải `ATTITUDE_BANDS`.
- Nhánh bị ảnh hưởng: **Sim** gửi dải thái độ; **Nội dung** `lock.hostile`; **FE** hiện thái độ ở khối "Thế lực ở {nơi}" (F3).

### 2026-10-29 — v0.7 F1 (ADR 0020)
Lý do: giao diện thân phận nghề cần biết thầy là ai và việc nào tính năm làm nghề mà không giữ bảng nghề của sim. v7 chưa phát hành nên không tăng `PROTOCOL_VERSION`, `SAVE_VERSION`.
- `careers.ts`: `CareerView.mentor?: { id, name, alive }` — thầy dạy nghề; sim còn giữ người đã mất một năm, quá hạn thì bỏ trường.
- `actions.ts`: `ActionOption.career?: CareerId` (việc riêng của nghề ấy), `ActionOption.careerWork?: true` (ô này tính vào năm làm nghề đang làm).
- `schema.ts`: `lit` nhận cả giá trị boolean.
- Nhánh bị ảnh hưởng: **Sim** gửi ba trường (không đổi snapshot, digest); **Nội dung** `ui.hud.career`, `ui.career.*`, `ui.plan.career_*`, `ui.plan.other_careers`; **FE** dòng nghề trên thanh trạng thái, khối Nghề ở hồ sơ, bảng chọn việc.

### 2026-10-29 — v0.7 F2 (ADR 0020)
Lý do: bảng chọn nghề cần biết ai nhận học việc ở đây, giá, lý do khóa; hộp rời nghề cần biết rời thì mất gì. Mọi luật ở sim; giao diện chỉ đọc. v7 chưa phát hành nên không tăng `PROTOCOL_VERSION`, `SAVE_VERSION`.
- `careers.ts`:
  - `CareerView` thêm `years` (số năm đã làm nghề) và `leave: CareerLeaveView` — `angers?` (thế lực phật lòng khi bỏ nha môn, bỏ hội), `outlaw?: { way: 'atone' | 'desert'; fee }` (ra băng chuộc tội hay trốn);
  - `CAREER_WAYS` (`mentor`, `faction`, `own`, `event`), `CAREER_ENTRY_ACTIONS`;
  - `CareerEntryView { career, way, action, mentors, locked }`, `CareerMentorOffer { id, gift, locked }` — thầy ở quận đang đứng, lễ nhập môn, khóa của ô học việc như khi ô chạy.
- `protocol.ts`: `STATE.careers: CareerEntryView[]` — đủ chín nghề theo `CAREERS`; rỗng khi chưa tự xếp việc. STATE thiếu trường bị từ chối.
- Nhánh bị ảnh hưởng:
  - **Sim:** `Life.careerBoard()`; `careerView` nhận lời báo rời nghề; `canAtone` và `leaveAngers` dùng chung cho lời báo và lệnh `LEAVE_CAREER` (không đổi luật, snapshot, digest).
  - **Nội dung:** `ui.careers.*`, `ui.leave.*`, `lock.no_mentor_here`.
  - **FE:** bảng chọn nghề (xếp việc vào nghề vào tuần sắp chạy), hộp hỏi lại trước khi rời nghề.

### 2026-10-29 — v0.7 F3 (ADR 0020)
Lý do: thẻ sự kiện cần đóng triện nghề, biên niên cần lọc "Nghề" mà giao diện không giữ danh sách sự kiện của từng nghề. v7 chưa phát hành nên không tăng `PROTOCOL_VERSION`, `SAVE_VERSION`.
- `events.ts`: `PendingEvent.career?: CareerId` — sự kiện riêng của một nghề.
- `character.ts`: `LogEntry.career?: CareerId` — dòng kết quả của sự kiện riêng của nghề; save cũ không có trường vẫn hợp lệ.
- Nhánh bị ảnh hưởng:
  - **Sim:** `pendingView` và dòng kết quả lấy từ `EventDef.career` (nhật ký không nằm trong digest; luật, snapshot không đổi).
  - **Nội dung:** `ui.event.career`, `ui.chron.career*`, `ui.factions.attitude_tag`, `ui.factions.attitude_hint.*`.
  - **FE:** triện nghề trên thẻ sự kiện, biên niên, thanh trạng thái, khối Nghề; lọc "Nghề"; thái độ thế lực ở khối "Thế lực ở {nơi}".

### 2026-10-29 — v0.7 F3b (ADR 0021)
Lý do: giao diện chọn chuyến buôn cần biết đi đâu, chở gì thì lời bao nhiêu, mà không giữ công thức giá, phí chở, vốn theo bậc. v7 chưa phát hành nên không tăng `PROTOCOL_VERSION`, `SAVE_VERSION`.
- `actions.ts`: `HaulOption { county, cargo, slots, margin, profit, risk, danger?, locked }` — số ô cả đi lẫn về; lời mỗi đấu, mỗi phần và lời cả chuyến nếu đường êm theo giá niêm yết lúc này (có thể âm); khóa như lúc khởi hành.
- `protocol.ts`: `STATE.hauls: HaulOption[]` — mỗi quận đi được × mỗi hàng; rỗng khi không phải thương nhân hay chưa tự xếp việc.
- Nhánh bị ảnh hưởng:
  - **Sim:** `haulEstimate` tách khỏi `haulTrip` (cùng phép tính, kết quả không đổi), `Life.hauls()`; không rút RNG, không đổi snapshot, digest.
  - **Nội dung:** `ui.goods.*`, `ui.haul.*`; `ui.market.open` đổi thành "Vào chợ mua bán".
  - **FE:** khối Hành trang, chợ hàng trong khối chợ và hộp mua bán (lệnh `TRADE_GOODS`), chọn quận đích và hàng cho chuyến buôn.
- Ghi chú: `MarketGoodView.maxSell` có thể thấp hơn mức sim nhận một phân khi quỹ chợ là giới hạn (sim làm tròn tiền bán xuống). Giữ nguyên vì người chơi máy trong batch dùng số này; giao diện dùng như giới hạn an toàn.

### 2026-10-29 — v0.7 F4 (ADR 0020)
Lý do: tổng kết "Một đời làm nghề" cần biết nghề nào còn làm tới lúc nhắm mắt. v7 chưa phát hành nên không tăng `PROTOCOL_VERSION`, `SAVE_VERSION`.
- `careers.ts`: `CareerRecord.current?: true` — chỉ nghề đang làm lúc chết (dòng cuối `LifeSummary.legacy.careers`); các lần đã rời không có.
- Nhánh bị ảnh hưởng: **Sim** `legacyCareers` ghi cờ (snapshot không đổi: các nghề đã rời vẫn không có cờ); **Nội dung** `ui.summary.career*`; **FE** dòng nghề cả đời dưới tên trên bia, khối "Một đời làm nghề" (gộp các lần vào cùng nghề: bậc cao nhất, cộng năm, số lần vào), triện nghề ở ngã rẽ là sự kiện nghề.

### 2026-10-29 — đóng v0.7: `SIM_VERSION` 0.7.1
Lý do: sau Bước 0 (0.7.0) hình snapshot đổi thêm nhiều lần (nghề đã rời S1, ruộng dân nền đã bán S2, kho đồ và chợ hàng S3b, thái độ thế lực S7). Như lúc đóng v0.6, tăng lên **0.7.1**: save dev cũ bị từ chối bằng lỗi `VERSION`, giao diện báo save bản cũ. Hợp đồng v7 phát hành cùng phiên bản này; `PROTOCOL_VERSION`, `SAVE_VERSION` giữ 7. Save nghiệm thu sinh lại bằng 0.7.1.
