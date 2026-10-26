# Cartographer (bản chụp)

- Nguồn: https://github.com/Jannchie/cartographer
- Commit: e8c8db8919abe6a074e4d72e2f431e46bf93f2d1 (2026-10-12, "feat(world): stage-based sidebar and polity-driven three-level divisions (#7)")
- Giấy phép: MIT (xem LICENSE)
- Lấy vào: `src/gen/` (trừ `cache.ts`, dùng IndexedDB và module ảo của Vite), `src/settlement/` (trừ `render.ts` và `themes.ts`, là phần vẽ), `src/i18n.ts`, `src/render/atlas/svg/contour.ts`.
- `i18n.ts` đặt ở đây để `settlement/people.ts` và renderer trong `apps/game` dùng chung một thể hiện; bản trong `apps/game/src/cartographer/i18n.ts` chỉ re-export.
- `generateSettlement` ghi `stats.ms` (thời gian đo), nên khi so sánh kết quả phải bỏ trường này.
- Chỉnh so với bản gốc: sửa đường dẫn import; `gen/areas.ts` import `../render/atlas/svg/contour` nay trỏ tới bản đặt trong thư mục này; `gen/earth/real.ts` dòng 49 đọc `import.meta.env` qua ép kiểu (chỉ để qua typecheck, hành vi không đổi).
- Phần vẽ (renderer atlas) nằm ở `apps/game/src/cartographer/`.
- Chỉnh renderer (2026-10-25, v0.1, đánh dấu `[TSVL]` trong code) để vẽ vùng chơi cắt nhỏ (~60×60 ô) phóng lớn:
  - `render/atlas/styles.ts`: `AtlasOpts` thêm `furniture?: boolean` (false = không khung, tiêu đề, la bàn, thước tỉ lệ, chú giải) và `riverWidth?: number` (hệ số độ dày sông).
  - `render/atlas/index.ts` (`drawMapOverlays`): nhân `riverWidth` vào độ dày sông; `furniture === false` thì bỏ đồ trang trí.
  - `render/atlas/svg/vector.ts` (`buildAtlasBase`): `furniture === false` thì lề giấy bằng 0 và không vẽ khung.
  - Mặc định giữ nguyên hành vi upstream.
- Code mới của dự án (không phải bản chụp): `packages/worldgen/src/region/` (cắt vùng, nơi sinh, Hán-Việt).
- Không sửa logic sinh. Muốn cập nhật: sao chép lại từ commit mới và ghi commit vào đây.
