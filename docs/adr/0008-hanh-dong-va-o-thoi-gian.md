# ADR 0008 — Hành động và ô thời gian

- Trạng thái: **ĐÃ DUYỆT** (2026-10-26, chủ dự án đồng ý mọi khuyến nghị Q1–Q8 ở `docs/v0.2-giai-doan-a.md`)
- Ngày: 2026-10-26
- Liên quan: GDD 1.1 (mọi thứ có giá), 2, 3.2 E, 3.2 F, 5 (v0.2), 8.5; ADR 0002, 0005, 0009, 0010, 0011

## Bối cảnh
- v0.1: người chơi chỉ xem đời trôi; pha 5 "Người chơi" trong vòng tick đang trống (`packages/sim/src/life/life.ts`).
- GDD 2 và 8.5 (đã chốt, ADR 0002): mỗi tháng 3 ô, **một ô = một tick = một tuần**; hoạt động dài chiếm nhiều ô.
- GDD 3.2 E: không có hành động miễn phí; mọi hành động làm mất ít nhất một thứ.
- Tiêu chí v0.2 (GDD 5): "Người chơi di chuyển, làm việc, tốn thời gian thật."

## Phương án
**Cách người chơi ra lệnh:**
1. Mỗi tuần chọn một hành động. Nhiều thao tác; tua năm phải bấm 36 lần.
2. **Kế hoạch tháng**: đầu mỗi tháng có 3 ô; kế hoạch được **giữ nguyên cho các tháng sau** cho tới khi người chơi sửa. Tua tuần/tháng/năm chạy theo kế hoạch.
3. Kế hoạch theo năm/mùa. Gọn hơn nhưng xa ý "phân bổ thời gian tháng này" của GDD 2.

**Hành động nhiều ô:**
- a. Một hành động chiếm đúng 1 ô; việc dài = xếp nhiều ô liên tiếp.
- b. **Hành động có độ dài**: chiếm k ô liên tiếp (vd. đi xa 2 ô), có thể tràn sang tháng sau; đang làm dở thì ô sau bị khóa.

## Quyết định (đề xuất)
**Phương án 2 + b.**

### Mô hình
- `ActionDef` (dữ liệu trong `packages/sim`, chuỗi hiển thị trong `content`): `id`, nhóm, **điều kiện** (tuổi tối thiểu, loại nơi ở, mùa, sức khỏe/thể lực tối thiểu, kỹ năng), **độ dài** (số ô), **giá** (thể lực, sức khỏe, rủi ro tai nạn theo ppm), **kết quả** (kỹ năng, hồi phục, di chuyển…).
- `MonthPlan`: 3 ô, mỗi ô `{ action, target? }` (target = quận đích khi di chuyển).
- Mỗi tick, pha 5 lấy ô ứng với `tenDay` của tháng hiện tại: kiểm tra điều kiện → trừ giá **một lần** → áp kết quả → ghi nhật ký (`minor` nếu bình thường).
- Ô không hợp lệ lúc chạy (hết mùa, không đủ thể lực, đang ốm nặng): **tự đổi sang "Nghỉ ngơi"**, ghi nhật ký `minor`, và **ngắt tua** nếu lỗi là do kế hoạch (để người chơi sửa) — ADR 0002 "biến quan trọng luôn ngắt tua".
- Không có kế hoạch (người chơi chưa chọn gì) = 3 ô "Nghỉ ngơi". Nghỉ ngơi cũng có giá: tốn thời gian, kỹ năng mai một nhẹ (ADR 0010).

### Tuổi thơ (cần duyệt, Q2)
- Đời bắt đầu từ lúc sinh (v0.1). Một đứa trẻ 2 tuổi tự chọn "làm thuê" phá cảm giác thật.
- Đề xuất: **dưới 12 tuổi không có ô hành động**; mỗi năm sim tự áp "tuổi thơ" theo xuất thân (bần hàn: phụ việc nhà, tăng nhẹ kỹ năng nông, tốn thể lực; khá giả: có thể được học vỡ lòng, tăng kỹ năng chữ). Người chơi chỉ tua. Từ **12 tuổi** mở kế hoạch tháng, có một mục nhật ký `major` "Tự lo liệu cho mình" (ngắt tua).

### Danh mục v0.2 (giá trị khởi điểm, chốt bằng batch)
| Nhóm | Hành động | Ở đâu | Độ dài | Giá | Kết quả |
|---|---|---|---|---|---|
| Mưu sinh | Làm ruộng | làng | 1 | thể lực cao | kỹ năng nông; **mùa đông không làm được** |
| Mưu sinh | Làm thuê | trấn, thành | 1 | thể lực vừa, rủi ro tai nạn thấp | kỹ năng thủ công nhẹ |
| Mưu sinh | Đốn củi, hái lượm | mọi nơi | 1 | thể lực vừa, rủi ro vừa | kỹ năng săn/rừng nhẹ |
| Mưu sinh | Săn bắn | làng | 1 | thể lực cao, **rủi ro cao** (giảm theo kỹ năng) | kỹ năng săn |
| Học tập | Học chữ | trấn, thành | 1 | thể lực thấp | kỹ năng chữ (tốc độ theo ngộ tính) |
| Học tập | Luyện võ | mọi nơi | 1 | thể lực rất cao, rủi ro chấn thương | kỹ năng võ; tăng nhẹ thể chất tạm thời |
| Nghỉ ngơi | Nghỉ ngơi | mọi nơi | 1 | thời gian | hồi thể lực, hồi sức khỏe nhanh |
| Chữa bệnh | Đi thầy thuốc | trấn, thành | 1 | thời gian (tiền ở v0.3) | giảm tổn hại bệnh đang mắc, rút ngắn bệnh |
| Di chuyển | Đi tới… | mọi nơi | 1–2 (ADR 0009) | thời gian, thể lực, rủi ro đường | đổi nơi ở |

Hoãn: buôn bán nhỏ, thủ công làm hàng (cần chợ, v0.3); xã giao (v0.5); nghe ngóng bí mật, tìm cơ duyên (v0.7–0.8).

### "Không có hành động miễn phí" thành test
Test duyệt toàn bộ danh mục: mọi `ActionDef` có ít nhất một giá > 0 (thể lực, sức khỏe, rủi ro hoặc ≥ 1 ô thời gian — mọi hành động đều ≥ 1 ô nên điều kiện này luôn đúng; test kiểm thêm "giá ngoài thời gian" cho mọi hành động trừ Nghỉ ngơi).

### Giao thức (bổ sung hợp đồng, ADR 0001)
- Lệnh mới `SET_PLAN { plan: MonthPlan }` (áp từ ô kế tiếp còn trống của tháng hiện tại và các tháng sau).
- `STATE` thêm: `plan`, `slotIndex`, `location`, `stamina`, `skills` (mức chữ, không số thật), `actions: ActionOption[]` — danh sách hành động **sim tính sẵn** cho nơi ở hiện tại kèm giá dự kiến và lý do bị khóa. FE không chứa luật, chỉ hiển thị.
- `ADVANCE` giữ nguyên ý nghĩa (tua tới ranh lịch); hành động chạy theo kế hoạch.

## Hệ quả
- Người chơi ra quyết định thật; digest phụ thuộc chuỗi lệnh (ADR 0011).
- v0.2 chưa có tiền và lương thực (ADR 0010): làm ruộng/làm thuê chỉ cho kỹ năng; thu nhập vào ở v0.3. Rủi ro "không có gì để làm" (GDD 7) tồn tại tới v0.3.
- Save đổi định dạng (version 2): save v0.1 bị từ chối, như ADR 0004 đã định.

## Chỉnh khi triển khai (2026-10-27, sau review)
- **Ô không làm được:** khóa tạm thời (`lock.winter`, `lock.stamina`, `lock.health`) chỉ làm ô đó thành nghỉ, không ngắt tua và giữ hành động nhiều ô đang dở. Khóa do kế hoạch sai (`lock.place`, `lock.route`, `lock.action`) nghỉ và **ngắt tua một lần**; không báo lại cho tới khi người chơi đặt kế hoạch mới hoặc tới nơi ở mới. Lý do: kế hoạch tự lặp; ngắt ở mọi ô làm tua năm chỉ đi được vài tuần.
- **Di chuyển là việc một lần:** tới nơi thì ô "đi tới X" trong kế hoạch thành nghỉ.
- **Giao diện** không chặn kế hoạch theo khóa của lúc này; chỉ chặn kế hoạch sai ý nghĩa, khóa hiện thành cảnh báo.
- **Nhật ký** không ghi việc thường ngày; chỉ ghi tới nơi, đang đi đường, lao lực, chấn thương, kế hoạch sai và các mốc.
