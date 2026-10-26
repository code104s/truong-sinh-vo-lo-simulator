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
