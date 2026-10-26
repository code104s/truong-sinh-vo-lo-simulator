# Trường Sinh Vô Lộ

Monorepo pnpm (TypeScript). Thiết kế: `docs/GDD_v0_v1.0.md` (mục 10.5 mô tả cấu trúc).

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
