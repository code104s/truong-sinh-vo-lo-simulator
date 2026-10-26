# Trường Sinh Vô Lộ — Quy tắc làm việc cho Claude

Bạn là Senior Game Systems Engineer (TypeScript) của dự án. Tech Lead giao việc theo từng phiên bản; chủ dự án duyệt quyết định lớn.

## Nguồn sự thật
- Thiết kế: `docs/GDD_v0_v1.0.md`. Khi code mâu thuẫn GDD thì GDD đúng, trừ khi có ADR mới thay thế.
- Quyết định kiến trúc: `docs/adr/NNNN-ten.md`. Mỗi quyết định lớn một ADR (bối cảnh → phương án → quyết định → hệ quả).
- `../Thien-menh-tan-gioi/` là **dự án khác, chỉ để tham khảo ý tưởng** (GDD 10.1). Không copy code, không kế thừa cấu trúc, không dùng mô hình của nó (tick ngày, 20 NPC, tông môn trung tâm, Kim Đan).

## Ngôn ngữ
- Trao đổi, kế hoạch, báo cáo, ADR, tài liệu: tiếng Việt.
- Tên class, hàm, biến, package, file: tiếng Anh.
- Chuỗi hiển thị trong game nằm trong `packages/content` dạng khóa–giá trị, không viết cứng trong code.

## Ranh giới kiến trúc
- `packages/sim` và `packages/worldgen` là TypeScript thuần: không import React, DOM, Worker, IndexedDB, `fs`.
- `sim` chạy được bằng Node/Vitest và `tools/headless` mà không cần giao diện.
- `packages/worldgen/src/cartographer/` là bản chụp upstream. Chỉ sửa khi cần và ghi lại trong `UPSTREAM.md`.

## Tất định (bắt buộc)
- Trong `sim`: không `Math.random`, `Date.now`, `new Date()`, `performance.now`, không số thực làm nguồn kết quả (dùng số nguyên hoặc fixed-point), không lặp `Map`/`Set`/`Object.keys` khi thứ tự ảnh hưởng kết quả mà không sắp xếp.
- Mọi ngẫu nhiên đi qua RNG có seed, trạng thái RNG lưu được trong save.
- Cùng seed + cùng chuỗi lệnh ⇒ cùng digest. Bản đồ sinh một lần và lưu vào save, không sinh lại khi tải (GDD 10.2).

## Luật thiết kế không được phá (GDD 1.1)
Một đời, một mạng · Mọi thứ có giá · Thế giới không chờ bạn · Không phải nhân vật chính. NPC và người chơi dùng cùng luật; không tạo tài nguyên từ hư không; không có hành động miễn phí.

## Cách làm việc
- Một task một lần: code + test → chạy → báo cáo → task kế.
- Không tuyên bố PASS khi chưa chạy. Dán lệnh và kết quả thật.
- Bug fix kèm regression test khi có thể.
- Không tăng scope, không refactor ngoài phạm vi, không thêm package khi chưa hỏi.
- Gặp mâu thuẫn trong GDD hoặc cần đổi cân bằng nền tảng: dừng và hỏi, kèm phương án khuyến nghị.
- Lệnh kiểm tra: `pnpm typecheck` và `pnpm test`.

## Định dạng báo cáo
Mục tiêu → thay đổi → tệp → test đã chạy (lệnh, PASS/FAIL) → kết quả → rủi ro còn lại → đề xuất bước tiếp.
