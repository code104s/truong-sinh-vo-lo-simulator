# ADR 0007 — Vùng chơi và nơi sinh

- Trạng thái: **ĐÃ DUYỆT** (2026-10-25, chủ dự án đồng ý mọi khuyến nghị Q1–Q13 ở `docs/v0.1-giai-doan-a.md`)
- Ngày: 2026-10-25
- Liên quan: GDD 3.2 D, 8.4, 10.2, 10.6, 10.7; ADR 0001, 0004

## Bối cảnh
Đề bài ghi "cắt vùng từ bản đồ lục địa **23 km/ô**". GDD 10.7 đề xuất **1024×768 (5,9 km/ô)**. Đo lại trên máy này (Node 24, `naming: 'eastern'`, vùng = các quận có trị sở trong bán kính 150 km quanh kinh đô một nước văn hóa `eastern`):

| Độ phân giải | km/ô | Thời gian sinh | Mảng số cả thế giới | Quận trong vùng | Ô đất trong vùng | Quận có thành sẵn |
|---|---|---|---|---|---|---|
| 256×192 | 23,4 | 0,55–0,70 s | 1,4 MB | 9–10 | **89–114** | 1 |
| 1024×768 | 5,86 | 4,9–5,5 s | 22,8 MB | 9–20 | 1.082–2.333 | 1 |

Seed `tsvl-01..03`. Mọi seed có ít nhất một nước `eastern` (1–4 nước). Kinh đô mẫu: 渭京 (Weijing).

Ở 23 km/ô cả vùng chỉ ~100 ô đất; một ngôi làng bằng nửa vùng ô của một thị trấn thật, đường và sông gần như không có chi tiết. **Không đủ cho câu hỏi "đi từ A đến B mất bao lâu"** (GDD 3.2 D) ở v0.2.

Làng và trấn **không có sẵn** trong dữ liệu Cartographer; chỉ có kinh đô và vài thành lớn (GDD 10.7).

## Phương án
**Độ phân giải:**
1. 256×192 (23 km/ô) như đề bài. Nhanh (0,6 s), nhưng vùng quá thô.
2. **1024×768 (5,9 km/ô)** như GDD 10.7. Sinh ~5 s một lần mỗi đời, trong worker, có `PROGRESS`.
3. 512×384 (11,7 km/ô), ~1,8 s, ~250–400 ô đất. Trung gian, vẫn thô.

**Nơi sinh:**
- a. Chỉ trị sở quận (9–20 điểm).
- b. **Trị sở quận + làng phụ** đặt theo luật, giới hạn số lượng theo GDD 3.2 D (5–10 làng, 1–3 trấn, 1 thành).

## Quyết định (đề xuất)
**Độ phân giải 2 (1024×768)** (Q2) và **nơi sinh b**.

### Thuật toán cắt vùng (`packages/worldgen/src/region/`)
Đây là code mới của dự án, không sửa bản chụp `cartographer/`.
1. `generateWorld({ ...DEFAULT_PARAMS, seed, width: 1024, height: 768, naming: 'eastern' })`.
2. Chọn nước: các nước có văn hóa `town === 'eastern'`, sắp xếp theo chỉ số nước; lấy nước **đầu tiên** (tất định). `regionId = "r" + realmIndex`.
3. Tâm = kinh đô nước đó. Vùng = hợp các quận cùng nước có trị sở trong bán kính 150 km. Cắt theo ranh quận, không theo hình tròn.
4. Hộp bao + lề 4 ô → `RegionMapData` (mảng số cắt, `mask`, `county`). Sông, đường cắt theo hộp; nhãn địa lý trong hộp giữ lại.
5. Không có nước `eastern` (chưa gặp trên seed nào đã thử): thử lần lượt `placeVariant` 1, 2, 3; vẫn không có thì báo lỗi `NO_WORLD` (test bắt).

### Đặt nơi sinh
- **Thành (1):** kinh đô.
- **Trấn (1–3):** trị sở các quận lớn nhất theo diện tích, xếp theo khoảng cách đường tới kinh đô; số trấn = 1 + (số quận ≥ 10 ? 1 : 0) + (số quận ≥ 16 ? 1 : 0).
- **Làng (5–10):** trị sở các quận còn lại; nếu chưa đủ 5 thì thêm làng phụ trong quận lớn nhất tại ô đất thấp, không phải nước, gần sông hoặc đường (chấm điểm số nguyên, lấy ô điểm cao nhất, cách nơi sinh khác ≥ 3 ô); nếu thừa 10 thì giữ 10 làng gần kinh đô nhất, các trị sở còn lại vẫn là quận nhưng không phải nơi sinh ở v0.1.
- Dùng RNG riêng của bước này: `new RNG(hashString(seed + "|region|places"))` — RNG của worldgen, vì đây là sinh bản đồ, được lưu vào save.
- Id ổn định: `"<regionId>/c<countyIndex>"`, làng phụ `"<regionId>/c<countyIndex>v<n>"`.

### Tên Hán-Việt
- Tên `eastern` của Cartographer được ghép từ **~100 hình vị chữ Hán** (`EAST_POOL`, `EAST_HEAD`, `EAST_CITY`, `EAST_CAPITAL` trong `naming.ts`) và một số hậu tố (山, 湖, 海, 州…).
- Thêm bảng `hanzi → âm Hán-Việt` (~150–200 mục) ở `packages/worldgen/src/region/hanviet.ts`; đổi từng chữ, viết hoa chữ cái đầu mỗi âm tiết: 渭京 → "Vị Kinh".
- Chữ không có trong bảng → test trượt (bắt khi upstream đổi bộ chữ). Không dùng pinyin làm dự phòng trên màn hình.
- Tên làng phụ: dùng `Namer` của Cartographer kiểu `eastern` với RNG ở trên, rồi đổi Hán-Việt.
- Bảng chữ là dữ liệu sinh bản đồ, nằm trong `worldgen`. Chuỗi giao diện ("Làng", "Trấn", "Thành") nằm trong `content`.

### Lớp logic cho sim (v0.1 tối thiểu)
- Danh sách nơi sinh với `kind` và quận. Sim đọc `kind` (hệ số dịch bệnh theo ADR 0005).
- Đồ thị kề quận và khoảng cách (km, số nguyên) để sẵn cho v0.2; v0.1 chưa dùng.
- Toàn bộ là số nguyên, lưu trong `region.logic` của save.

### Digest vùng (nghiệm thu "cùng seed cho cùng vùng và cùng danh sách nơi sinh trên 100 seed")
- Băm chuỗi chuẩn hóa: `regionId`, hộp cắt, danh sách quận (chỉ số, tên), danh sách nơi sinh (id, tên, `kind`, ô).
- **Chi phí:** 100 seed × 2 lần × ~5 s ≈ **17 phút**. Không đưa vào `pnpm test`. Đề xuất:
  - `pnpm test`: 3 seed × 2 lần ở 1024×768 + digest pin (~30 s).
  - `pnpm sim regions --seeds 100`: lệnh riêng cho nghiệm thu, chạy song song bằng `worker_threads` trong `tools/headless` (tools được dùng API Node).

### Batch 1.000 đời
Nếu mỗi đời một thế giới mới thì 1.000 × 5 s ≈ 83 phút. Đề xuất (Q5): `batch --seeds 1000` dùng **10 thế giới** (cache trong bộ nhớ), mỗi thế giới 100 đời khác `lifeSeed`, xoay vòng nơi sinh. Cần trường `lifeSeed` trong `NewLifeConfig`.

## Hệ quả
- Đời mới chờ ~5 s sinh bản đồ (trong worker, có thanh tiến độ). Tải save không phải chờ.
- Vùng ~35.000–80.000 km², 9–20 quận, 1 thành, 1–3 trấn, 5–10 làng — khớp GDD 3.2 D.
- Phần lớn thế giới bị bỏ sau khi cắt. Muốn nhanh hơn phải sửa upstream để sinh vùng nhỏ — chưa làm.
- Chất lượng tên làng phụ chưa kiểm tra (rủi ro đã ghi ở GDD 10.7).
