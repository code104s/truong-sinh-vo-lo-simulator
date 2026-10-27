# ADR 0010 — Thể lực, kỹ năng và phạm vi tài nguyên ở v0.2

## Tham số triển khai và cân bằng — 2026-10-27
- Trần thể lực: `(600 + thể chất × 35 + floor(võ / 1000) × 8) × hệ số tuổi`, giới hạn 250–1000. Hệ số tuổi theo tỉ lệ tuổi/thọ nguyên: 0‰ → 50%, 200‰ → 100%, 650‰ → 100%, 1000‰ → 50%.
- Hồi mỗi tick: `(45 + thể chất × 4) × trần / 1000`; nghỉ cộng 240. Cạn thể lực khi làm việc mất 24 sức khỏe. Mỏi tăng xác suất bệnh/tai nạn ×1,3; kiệt sức ×1,4 (khởi điểm ×2 không đạt tuổi thọ chiến lược lao lực).
- Giá thể lực: ruộng 180, thuê 120, hái lượm 130, săn 200, chữ 30, võ 240, nghỉ 0, thầy thuốc 20, di chuyển 100 mỗi ô. Mọi hành động còn tốn ít nhất một ô thời gian.
- Nghỉ hồi thêm 18 sức khỏe, giảm 10% tổn hại bệnh của tick; thầy thuốc hồi 100, giảm 50% tổn hại, rút bớt một tick bệnh (vẫn qua pha kết thúc bệnh bình thường).
- Kỹ năng: cơ sở 35 XP/lần, nhân `(50 + ngộ tính × 10)%`, chữ hỗ trợ tối đa 20%, mệt giảm hiệu quả. Không dùng một năm thì mất 5% mỗi năm. Trần 10.000; bậc ở 1.000/4.000/8.000. Kỹ năng cùng loại giảm rủi ro tối đa 60%; võ giảm tai nạn chết ngay, tăng trần sức khỏe tối đa 50 và sức bền tối đa 80; tác dụng mất dần khi mai một.
- Kết quả 5.000 đời và giới hạn còn lại: [báo cáo nghiệm thu](../v0.2-bao-cao-nghiem-thu.md).

- Trạng thái: **ĐÃ DUYỆT** (2026-10-26, chủ dự án đồng ý mọi khuyến nghị Q1–Q8 ở `docs/v0.2-giai-doan-a.md`)
- Ngày: 2026-10-26
- Liên quan: GDD 1.1, 3.2 A (thuộc tính phải có tác động), 3.2 E, 3.2 F, 5; ADR 0005, 0008

## Bối cảnh
- GDD 3.2 E ghi giá hành động gồm **tiền** (di chuyển, học tập, chữa bệnh), nhưng GDD 5 đặt **kinh tế ở v0.3**. Tiền ở v0.2 mà không có kinh tế thì phải "tạo từ hư không" — trái GDD 3.2 F và trụ cột "mọi thứ có giá".
- Thuộc tính v0.1 chưa có hệ thống đọc: **ngộ tính, tính cách, phúc duyên, linh căn** (bảng ở `docs/v0.1-giai-doan-a.md` mục 3). GDD 3.2 A: thuộc tính không tác động gì thì bỏ khỏi v1.0.

## Phương án (tài nguyên)
1. **v0.2 không có tiền và lương thực**; giá hành động = thời gian, thể lực, sức khỏe, rủi ro. Kinh tế vào đúng v0.3. Rủi ro: làm ruộng/làm thuê chưa đem lại gì ngoài kỹ năng.
2. Đưa kinh tế tối thiểu lên v0.2 (lương thực gia đình + tiền, nguồn từ bảng lương cố định). Có lý do để làm việc ngay, nhưng tiền sinh từ hư không và phải làm lại ở v0.3.
3. Như (1) nhưng làm ruộng/làm thuê tích "công" (sổ ghi công) — đổi ra tiền ở v0.3. Thêm khái niệm tạm, dễ thành nợ thiết kế.

## Quyết định (đề xuất)
**Phương án 1** (Q1). Đúng GDD 5; không có tài nguyên từ hư không.

### Thể lực (mới)
- `stamina` 0..1000 trong sim; view hiện thô (sung sức / mỏi / kiệt sức).
- Mỗi hành động trừ thể lực; mỗi tick hồi một lượng theo thể chất, tuổi (già hồi chậm) và hành động (Nghỉ ngơi hồi nhiều).
- Thể lực thấp: tăng xác suất bệnh và tai nạn (nối vào bảng ADR 0005), giảm hiệu quả học. Thể lực về 0 khi làm việc nặng → mất sức khỏe ("lao lực") — có thể góp phần chết bệnh/già (nguyên nhân chết chi tiết `illness.exhaustion`).
- Trần thể lực theo **thể chất** và tuổi (dùng lại bảng tỉ lệ tuổi/thọ của ADR 0005).

### Kỹ năng (mới)
- `skills`: nông, săn, thủ công, chữ, võ — điểm kinh nghiệm số nguyên 0..10 000; view hiện bậc chữ (sơ, thạo, giỏi, tinh thông).
- Tăng khi làm hành động tương ứng; tốc độ nhân theo **ngộ tính**. Không dùng thì mai một chậm (nhịp năm).
- Tác dụng v0.2: giảm rủi ro tai nạn của hành động cùng loại (săn, luyện võ, đốn củi), võ giảm tử vong do tai nạn, chữ tăng tốc độ học các thứ khác (nhẹ). Tác dụng kinh tế ở v0.3.

### Thuộc tính được "đánh thức" ở v0.2
| Thuộc tính | Tác động mới |
|---|---|
| Ngộ tính | Tốc độ tăng kỹ năng (mọi kỹ năng; chữ nhiều nhất) |
| Thể chất | Trần thể lực, tốc độ hồi thể lực (thêm vào tác động sức khỏe sẵn có) |
| Tính cách | **Đề xuất hoãn** tới v0.3 (sự kiện có lựa chọn) — ở v0.2 không có chỗ tác động tự nhiên |
| Phúc duyên, linh căn | Vẫn ẩn, chưa đọc (v0.7–0.8), như kế hoạch v0.1 |

## Hệ quả
- Giá trị v0.2 nằm ở **đánh đổi thời gian ↔ sức khỏe ↔ kỹ năng ↔ vị trí**: làm việc nặng nhiều thì giỏi nhanh nhưng dễ bệnh, chết sớm; nghỉ nhiều thì sống lâu mà không có gì.
- Thêm luồng RNG `actions` và `travel` (thêm luồng không lệch luồng cũ, ADR 0003).
- Batch v0.2 phải đo phân bố tuổi thọ **theo chiến lược chơi** (ADR 0011): chiến lược lao lực phải chết sớm hơn chiến lược điều độ, nhưng không tới mức vô lý.
