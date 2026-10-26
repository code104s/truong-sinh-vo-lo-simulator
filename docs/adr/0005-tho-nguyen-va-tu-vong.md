# ADR 0005 — Thọ nguyên, sức khỏe và tử vong

- Trạng thái: **ĐÃ DUYỆT** (2026-10-25, chủ dự án đồng ý mọi khuyến nghị Q1–Q13 ở `docs/v0.1-giai-doan-a.md`)
- Ngày: 2026-10-25
- Liên quan: GDD 1.1, 3.2 A, 3.2 C, 3.2 L2, 7 (rủi ro "chết quá sớm"); ADR 0002, 0003

## Bối cảnh
GDD 3.2 C: thọ nguyên phàm nhân ~40–80 năm, dao động theo thể chất, xuất thân, nghề, bệnh, tai họa; sức khỏe giảm theo tuổi; bệnh để lại hậu quả dài hạn; mô hình phải có chỗ cộng thọ nguyên cho Luyện Khí; nhiều nguyên nhân chết. Nghiệm thu v0.1: 1.000 đời không đời nào kẹt hoặc sống mãi, tuổi thọ trong khoảng 40–80, báo cáo phân bố nguyên nhân.

Chưa rõ: "40–80" là **trần thọ nguyên** hay **tuổi chết thực tế**? Và có tính tử vong trẻ em không? (Q3)

v0.1 chưa có kinh tế, NPC, nghề → chỉ có các nguyên nhân: **già, bệnh, tai nạn.** Đói (v0.3), bạo lực (v0.4+), thiên tai (v0.3+) có chỗ trong kiểu `DeathCause` nhưng chưa sinh ra.

## Phương án
1. **Chỉ có xác suất chết theo tuổi** (bảng sống Gompertz). Đơn giản, nhưng không có "sức khỏe" để hiển thị và không có chỗ cho bệnh để lại hậu quả.
2. **Chỉ có thanh sức khỏe**, chết khi về 0. Khó điều khiển phân bố tuổi chết; dễ sinh đời "sống mãi" nếu hồi phục mạnh.
3. **Kết hợp: trần thọ nguyên ẩn + sức khỏe + nguy cơ theo tuần.** Trần đảm bảo không ai sống mãi; sức khỏe tạo câu chuyện (bệnh, suy yếu); nguy cơ tuần tạo phân bố tự nhiên.

## Quyết định (đề xuất)
**Phương án 3.** Mọi con số dưới đây là **giá trị khởi điểm**, chốt bằng `pnpm sim batch`.

### Trạng thái (số nguyên, trong sim)
| Trường | Kiểu | Ẩn/hiện | Ý nghĩa |
|---|---|---|---|
| `lifespanBase` | tick | ẩn | Thọ nguyên gốc, rút khi sinh |
| `lifespanBonus` | tick | ẩn | Cộng thêm (Luyện Khí tầng 1–3, GDD 3.2 L2). v0.1 = 0 |
| `health` | 0..1000 | hiện thô | Sức khỏe hiện tại |
| `healthMax` | 0..1000 | ẩn | Trần sức khỏe, giảm theo tuổi và di chứng |
| `conditions` | danh sách | hiện | Bệnh/thương tật đang mắc: id, mức nặng, tick còn lại |
| `scars` | số nguyên | ẩn | Tổng di chứng vĩnh viễn (đã trừ vào `healthMax`) |

`lifespanCap = lifespanBase + lifespanBonus` là **trần cứng**: tới trần thì chết vì già (lão tử) dù sức khỏe còn.

### Thọ nguyên gốc
- `lifespanBase` (năm) = 50 + Irwin–Hall(4 lần `int(0..10)`) + hiệu chỉnh thể chất (−6..+6) + xuất thân (−3..+3), kẹp 45..95; đổi ra tick.
- Phân bố gốc: trung bình ~70, độ lệch ~6–7 năm.

### Sức khỏe theo tuổi (pha "Hậu quả", nhịp năm)
`healthMax` theo tuổi (bảng nội suy tuyến tính số nguyên, theo **tỉ lệ tuổi/trần** để người thọ già chậm hơn):
| tuổi / trần | healthMax |
|---|---|
| 0 | 600 |
| 0,2 | 1000 |
| 0,55 | 1000 |
| 0,8 | 750 |
| 0,95 | 450 |
| 1,0 | 250 |
Trừ thêm `scars`. `health` không vượt `healthMax`.

### Bệnh (pha "Sự kiện", nhịp tuần)
- Mỗi tuần, xác suất khởi phát (ppm) = cơ sở × hệ số mùa (Đông, Xuân cao) × hệ số tuổi (trẻ nhỏ và người già cao) × hệ số sức khỏe (yếu dễ bệnh) × xuất thân (nghèo cao hơn) × thể chất.
- Bảng bệnh v0.1 (id nằm trong `packages/content`, tham số nằm trong `sim`):

| id | Mức | Thời gian | Tổn hại/tuần | Di chứng | Ghi chú |
|---|---|---|---|---|---|
| `illness.cold` (cảm hàn) | nhẹ | 1–3 tuần | nhỏ | không | phổ biến, mùa đông |
| `illness.fever` (sốt rét/ôn dịch nhẹ) | vừa | 2–6 tuần | vừa | có thể | mùa hạ, vùng sông nước |
| `illness.dysentery` (lỵ, thổ tả) | nặng | 1–4 tuần | lớn | có | mùa hạ, đông người (thành) |
| `illness.consumption` (lao) | mạn tính | tới khi khỏi hoặc chết | nhỏ, kéo dài | lớn | hiếm, giết chậm |
| `illness.stroke` (trúng phong) | nặng | 1 tuần | rất lớn | lớn | chỉ khi tuổi/trần > 0,7 |

- Mỗi tuần mắc bệnh: `health -= tổn hại`; hết hạn thì khỏi (có thể để lại di chứng → `scars`).
- Không bệnh: hồi `health` về `healthMax` theo tốc độ phụ thuộc thể chất và xuất thân.

### Tai nạn (pha "Sự kiện", nhịp tuần)
- Xác suất tuần nhỏ (ngã, đuối nước, rắn rết, thú dữ). Một phần gây chết ngay, phần còn lại gây thương tật (`condition` loại `injury.*`) và di chứng.
- Tách luồng RNG `accident` riêng (ADR 0003).

### Tử vong (cuối pha "Hậu quả", mỗi tick)
Theo thứ tự:
1. `ageTicks ≥ lifespanCap` → chết, `old_age`.
2. `health ≤ 0` → chết, nguyên nhân = condition gây tổn hại lớn nhất tuần đó (`illness`/`accident`); không có thì `old_age`.
3. Tai nạn chết ngay (đã quyết ở pha 4) → `accident`.

Ghi `LogEntry` `importance: 'major'` cho: khởi phát bệnh nặng, tai nạn, khỏi bệnh nặng, mốc tuổi (15, 30, 50, 60, 70…), chết. Các mục `major` ngắt tua (ADR 0002).

### Trẻ em (Q3)
Đề xuất cho v0.1: đời bắt đầu từ lúc sinh, có tử vong trẻ em nhưng **thấp** (mục tiêu < 5% chết trước 15 tuổi). Thấp hơn thực tế lịch sử, để tránh "chết khi chưa chơi gì" (GDD 7). Cùng luật áp cho NPC sau này.

### Mục tiêu cân bằng (nghiệm thu bằng batch 1.000 đời)
- 0 đời kẹt (vượt 3.600 tick không chết) và 0 đời vượt `lifespanCap`.
- Trung vị tuổi chết 55–68; **≥ 90% đời chết trong 40–80 tuổi**; báo cáo phần trăm < 40 và > 80.
- Phân bố nguyên nhân (chỉ ghi nhận, chưa chốt): mong đợi già ~40–60%, bệnh ~35–50%, tai nạn ~5–10%.

### Ai đọc thuộc tính nào (v0.1)
| Thuộc tính | Hệ thống đọc ở v0.1 |
|---|---|
| Thể chất | thọ nguyên gốc, xác suất bệnh, tốc độ hồi phục |
| Xuất thân | thọ nguyên gốc, xác suất bệnh, tốc độ hồi phục, tử vong trẻ em |
| Nơi sinh (loại) | hệ số dịch bệnh (thành > trấn > làng) |
| Thiên phú có tác động sức khỏe | như trên (vd. "cường tráng", "bẩm sinh yếu") |

## Hệ quả
- Không đời nào sống mãi (trần cứng) và không đời nào kẹt (giới hạn 3.600 tick báo lỗi).
- Có sẵn `lifespanBonus` cho Luyện Khí; GDD 3.2 L2 không cần đổi mô hình.
- Nhiều con số khởi điểm → bước cân bằng là một task riêng của nhánh Sim, chạy batch lặp.
- Thiếu đói, bạo lực, thiên tai cho tới khi có kinh tế/NPC; phân bố nguyên nhân v0.1 chưa phản ánh thiết kế cuối.

## Kết quả cân bằng v0.1 (S12, 2026-10-25)
Tham số cuối nằm ở `packages/sim/src/life/params.ts`. Đổi so với giá trị khởi điểm ở trên, sau lần đo đầu (trung vị 49 tuổi, 17% chết trước 15, lao giết 35%):
- Sức khỏe khi mới sinh: trần 600 → **700**.
- Khởi phát bệnh trẻ em: 0–4 tuổi 9.000 → **6.000** ppm/tuần; 5–14 tuổi 5.000 → **4.000**.
- Sốt rét tổn hại 40–110 → **30–90**; kiết lỵ 1–4 tuần, 120–260 → **1–3 tuần, 80–200**; lao trọng số 3 → **2**, 12–60 tuần, tổn hại **5–20**.
- Thêm **hồi phục khi đang bệnh** theo mức nặng nhất: nhẹ 50%, nặng 25%, nguy kịch 0% (`RECOVERY_WHILE_ILL`).

`pnpm sim batch --seeds 1000` (10 thế giới × 100 đời):
| Chỉ số | Mục tiêu | Kết quả |
|---|---|---|
| Đời kẹt / vượt trần | 0 / 0 | **0 / 0** |
| Trung vị tuổi chết | 55–68 | **61** |
| Chết trong 40–80 tuổi | ≥ 90% | **91,4%** |
| Chết trước 15 tuổi | < 5% | **1,9%** |
| Nguyên nhân | ghi nhận | bệnh 75,6% (trúng phong 28,5%, kiết lỵ 23,6%, sốt rét 20,7%), già 13,9%, tai nạn 10,5% |

**Còn lệch so với dự kiến:** chết vì già (13,9%) thấp hơn nhiều mức dự kiến 40–60%, vì trúng phong và bệnh ở tuổi cao chiếm phần lớn cái chết cuối đời. Cần chủ dự án quyết: trúng phong ở tuổi già có tính là "già" trong thống kê không, hay hạ độ nguy hiểm của bệnh ở cuối đời. Chưa chỉnh vì GDD chưa chốt tỉ lệ nguyên nhân.
