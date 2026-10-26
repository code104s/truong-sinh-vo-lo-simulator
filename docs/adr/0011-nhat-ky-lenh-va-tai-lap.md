# ADR 0011 — Nhật ký lệnh, tái lập và chiến lược chơi tự động

- Trạng thái: **ĐÃ DUYỆT** (2026-10-26, chủ dự án đồng ý mọi khuyến nghị Q1–Q8 ở `docs/v0.2-giai-doan-a.md`)
- Ngày: 2026-10-26
- Liên quan: GDD 3.2 B, 3.2 O, 6.5, 10.1 (lệnh có `commandId`); ADR 0003, 0004, 0008

## Bối cảnh
- v0.1: đời người chỉ phụ thuộc seed; trình duyệt và CLI cùng digest vì không có lựa chọn.
- v0.2: kết quả phụ thuộc **chuỗi lệnh của người chơi**. Muốn "cùng seed + cùng lựa chọn = cùng kết quả" (GDD 3.2 B, 6.5) và đối chiếu trình duyệt ↔ CLI thì phải ghi được và phát lại được chuỗi lệnh.
- Batch cân bằng (1.000 đời) không có người bấm: cần **chiến lược chơi tự động**.

## Quyết định (đề xuất)
### Nhật ký lệnh
- Sim ghi mọi lệnh **làm đổi trạng thái** (`NEW_LIFE`, `SET_PLAN`, `ADVANCE`) thành `CommandRecord { seq, tick, cmd }` (số thứ tự tăng dần; tương đương `commandId` của GDD 10.1, chống áp dụng trùng khi tải lại).
- `PAUSE`, `SAVE`, `LOAD`, `GEN_WORLD` không ghi (không đổi đời).
- Save (version 2) chứa nhật ký lệnh. Digest gồm cả snapshot, nên lưu/tải/chạy tiếp vẫn kiểm được như v0.1.
- CLI: `pnpm sim replay --save file.json` phát lại từ `NEW_LIFE` theo nhật ký lệnh và so digest với save — dùng để đối chiếu trình duyệt ↔ CLI (xuất save từ trình duyệt, chạy trong CLI).
- Tua liên tục trên giao diện vẫn là chuỗi `ADVANCE` → được ghi; phát lại cho cùng kết quả bất kể tốc độ bấm.

### Chiến lược chơi tự động (cho batch và test)
- `Policy`: hàm thuần `(view, date, options) → MonthPlan | null`, đặt trong `tools/headless` (không phải luật game, chỉ là "người chơi máy").
- Bộ v0.2: **lười** (toàn nghỉ ngơi), **nông dân điều độ** (2 ô làm ruộng + 1 nghỉ, đông nghỉ), **lao lực** (3 ô việc nặng), **học giả** (lên trấn, học chữ), **lang bạt** (di chuyển ngẫu nhiên có seed).
- `pnpm sim batch --seeds 1000 --policy <tên|all>` báo cáo phân bố tuổi thọ, nguyên nhân chết, kỹ năng cuối đời theo từng chiến lược.

## Hệ quả
- Save lớn thêm chút (mỗi `SET_PLAN`/`ADVANCE` một bản ghi; ~vài nghìn bản ghi/đời, vài chục KB).
- Kiểm tra tái lập v0.2 = cùng seed + cùng nhật ký lệnh ⇒ cùng digest (10 seed × chiến lược ngẫu nhiên có seed).
