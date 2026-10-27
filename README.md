# Trường Sinh Vô Lộ

Monorepo pnpm (TypeScript). Thiết kế: `docs/GDD_v0_v1.0.md` (mục 10.5 mô tả cấu trúc).

## Hiện trạng v0.2 — Có việc để làm

Đã triển khai kế hoạch tháng 3 ô từ 12 tuổi, 9 hành động, thể lực, 5 kỹ năng và di chuyển trên vùng liên thông. Giao diện hiện giá/lý do khóa do sim tính, xem trước đường đi và xuất save. [Báo cáo nghiệm thu](docs/v0.2-bao-cao-nghiem-thu.md) có kết quả test, 5.000 đời cân bằng và ảnh 1280/1920 px.

```bash
pnpm dev
pnpm sim batch --seeds 1000 --policy all --threads 8
pnpm sim replay --save file.json
```

Các chiến lược: `lazy`, `balanced` (mặc định), `overwork`, `scholar`, `wanderer`; `--policy all` chạy đủ năm chiến lược. Thêm `--out report.json` để lưu báo cáo batch.

| Thư mục | Vai trò |
|---|---|
| `packages/sim` | Lõi mô phỏng thuần |
| `packages/worldgen` | Sinh bản đồ sơn thủy (từ repo map-gen) |
| `packages/shared` | Kiểu dữ liệu, schema, giao thức worker, save |
| `packages/content` | Sự kiện, nghề, tên, chuỗi văn bản |
| `apps/game` | Giao diện game |
| `apps/character-tool` | Tool tạo nhân vật |
| `apps/portrait-studio` | Pipeline chân dung NPC |
| `tools/headless` | CLI mô phỏng hàng loạt |

Quy tắc: `sim` và `worldgen` không import React, DOM hay Worker.

```bash
pnpm install
pnpm typecheck
pnpm test
```

## Nguồn gốc
- `packages/worldgen` (sinh dữ liệu) và `apps/game/src/cartographer` (vẽ) là bản chụp của Cartographer, xem `packages/worldgen/src/cartographer/UPSTREAM.md`. map-gen đã bị loại.
- Chưa đưa vào: các script QA trình duyệt (`qa-shots`, `bench-fps`, Playwright), `portrait-studio`, tool tạo nhân vật.
