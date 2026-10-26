# ADR 0002 — Tick và lịch

- Trạng thái: **ĐÃ DUYỆT** (2026-10-25, chủ dự án đồng ý mọi khuyến nghị Q1–Q13 ở `docs/v0.1-giai-doan-a.md`)
- Ngày: 2026-10-25
- Liên quan: GDD 2, 3.2 B, 3.2 O, 5 (v0.1), 10.4

## Bối cảnh
GDD tự mâu thuẫn ở ba chỗ:
1. **Đơn vị tick.** Mục 2 (sơ đồ vòng lặp "Bắt đầu tháng… Qua tháng"), mục 5 (v0.1 "vòng tick tháng") và bảng 10.1 ("Tick 1 tháng") nói tick tháng. Gạch đầu dòng ở mục 2, mục 3.2 B và kết luận 10.4 chốt **tick tuần (10 ngày)**.
2. **Ngân sách hiệu năng.** 3.2 O ghi "dưới ~200 ms/tháng" — đơn vị theo tick tháng cũ, và "máy mục tiêu" chưa định nghĩa.
3. **Thứ tự tick.** 3.2 B: mỗi tick chạy "thế giới → thế lực → NPC → sự kiện → người chơi → hậu quả". 10.4: thế lực chạy theo **quý**, NPC xa và kinh tế theo **tháng**, lão hóa NPC xa theo **năm**. Hai mô tả không nói hệ thống chậm chen vào thứ tự nào, chạy ở đầu hay cuối kỳ.

## Phương án
- A. Tick tháng (720 tick/60 năm). Rẻ nhất, nhưng mất ngắt giữa tháng và lệch với 3 ô/tháng (10.4 đã phân tích).
- B. **Tick tuần, hệ thống chậm là "pha có nhịp"** chen vào đúng vị trí trong thứ tự 3.2 B.
- C. Tick tuần, hệ thống chậm chạy trong một tick riêng ở cuối kỳ. Tạo tick "ảo" không ứng với thời gian, khó hiểu khi tua.

## Quyết định (đề xuất)
**Phương án B.**

### Đơn vị
- 1 tick = 1 tuần = 10 ngày. 3 tuần (thượng, trung, hạ) = 1 tháng. 12 tháng = 1 năm = 36 tick.
- `tick` là số nguyên, bắt đầu 0 = thượng tuần tháng Giêng năm 1 của thế giới.
- `year = floor(tick/36) + 1`, `month = floor((tick mod 36)/3) + 1`, `tenDay = tick mod 3`.
- Mùa: Xuân tháng 1–3, Hạ 4–6, Thu 7–9, Đông 10–12.
- Tên tháng (Giêng, Hai… Chạp), tuần, mùa là chuỗi trong `packages/content`.

### Thứ tự một tick
Mỗi tick chạy các pha theo đúng thứ tự 3.2 B. Mỗi pha có **nhịp**; pha chỉ chạy khi nhịp khớp. Nhịp tháng/quý/năm chạy ở **tick đầu kỳ** (khớp sơ đồ mục 2 "Bắt đầu tháng → thế giới tick").

| # | Pha | Nhịp | v0.1 làm gì |
|---|---|---|---|
| 1 | Thế giới | tuần; tháng (kinh tế, dịch bệnh, mùa vụ) | Mùa hiện tại, hệ số bệnh theo mùa |
| 2 | Thế lực | quý | — |
| 3 | NPC | tuần (gần); tháng (xa); năm (LOD) | — |
| 4 | Sự kiện | tuần | Khởi phát bệnh, tai nạn |
| 5 | Người chơi | tuần | Không có hành động (v0.2) |
| 6 | Hậu quả | tuần; **năm** (lão hóa) | Diễn tiến bệnh, hồi phục, lão hóa đầu năm, kiểm tra tử vong |

- "Đầu tháng" = `tick mod 3 == 0`; "đầu quý" = `tick mod 9 == 0`; "đầu năm" = `tick mod 36 == 0`.
- Tử vong kiểm tra **mỗi tick** ở cuối pha 6, không đợi cuối năm (bệnh có thể giết giữa năm).
- Lão hóa người chơi chạy theo nhịp năm như NPC (cùng luật, GDD 1.1), nhưng tính theo **tuổi thật** từ `birthTick`, nên người sinh tháng 7 vẫn già đúng tuổi.

### Tuổi
- Logic dùng tuổi theo tick: `ageTicks = tick - birthTick`; `ageYears = floor(ageTicks / 36)`.
- Hiển thị tuổi thật. (Tuổi mụ là lựa chọn hiển thị, xem câu hỏi Q4.)

### Tua
`ADVANCE` dừng ở **ranh giới lịch**, không phải số tick cố định:
- `week`: 1 tick.
- `month`: tới đầu tháng sau (1–3 tick).
- `year`: tới đầu năm sau (1–36 tick).
- `untilEvent`: chạy tới khi có `LogEntry` quan trọng (`importance: 'major'`) hoặc chết; giới hạn an toàn 100 năm (3.600 tick) thì trả `ERROR INTERNAL`.

Bất kỳ chế độ nào cũng dừng sớm khi có biến quan trọng (GDD 2: "sự kiện quan trọng luôn ngắt tua") và gửi `INTERRUPT`.

Worker chạy tick theo lô (mặc định 36 tick/lô) rồi nhường luồng (`setTimeout 0`) để nhận `PAUSE`. Phần nhường luồng nằm ở file worker trong `apps/game`, không nằm trong `sim`.

### Ngân sách hiệu năng
Thay "200 ms/tháng" bằng hai con số theo tick tuần, chốt khi có máy mục tiêu:
- v1.0 (150–400 NPC): **một tháng mô phỏng (3 tick + pha tháng) ≤ 200 ms** — giữ nguyên ý gốc, chỉ đổi cách đo.
- Tua năm phải không làm UI đơ: worker chạy riêng luồng nên UI không đơ; chỉ đo thời gian worker trả kết quả.

v0.1 chỉ **đo và ghi nhận**: thời gian một tick, một năm, một đời (Node và trình duyệt).

## Hệ quả
- Sửa GDD mục 2 (sơ đồ), mục 5 (v0.1), bảng 10.1, 3.2 O cho khớp. Đề xuất sửa sau khi ADR được duyệt.
- Một đời 60 năm ≈ 2.160 tick. Với một nhân vật, chi phí không đáng kể.
- Pha có nhịp giúp thêm hệ thống mới mà không đổi khung tick.
- Lão hóa theo nhịp năm làm sức khỏe giảm theo bậc mỗi Tết. Chấp nhận được; nếu thấy giật thì đổi sang giảm nhỏ mỗi tháng mà không đổi hợp đồng.

## Ghi chú triển khai (2026-10-25)
- Tuần sinh coi như đã qua: đời bắt đầu ở tick `birthTick + 1`. **Ngày hiển thị là tuần đang đứng (sắp chạy)**, nên "tua năm" dừng ở thượng tuần tháng Giêng.
- Một tick của một nhân vật mất ~0,8 µs (Node), cả đời ~1,7 ms; tua năm trong trình duyệt 5–7 ms. Vì vậy `SimHost` chạy `ADVANCE` đồng bộ, không chia lô, và `PAUSE` chỉ trả lại `STATE`.
- "Tua tới khi có biến" trên giao diện là vòng lặp phía UI: gửi `ADVANCE month` mỗi 60 ms để người chơi thấy đời trôi; dừng khi có `INTERRUPT`, `DIED` hoặc bấm Tạm dừng. CLI dùng `ADVANCE year`. Digest không phụ thuộc cách tua vì v0.1 không có lựa chọn.
