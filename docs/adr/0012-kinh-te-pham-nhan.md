# ADR 0012 — Kinh tế phàm nhân: lương thực, tiền, chợ quận

- Trạng thái: **ĐÃ DUYỆT** (2026-10-27, chủ dự án đồng ý mọi khuyến nghị Q1–Q11 ở `docs/v0.3-giai-doan-a.md`; liên quan Q1, Q6, Q10, Q11)
- Ngày: 2026-10-27
- Liên quan: GDD 1.1 (mọi thứ có giá, không tạo tài nguyên từ hư không), 2 (kinh tế theo tháng), 3.2 E, 3.2 F, 3.2 I; ADR 0002, 0003, 0008, 0010

## Bối cảnh
- v0.2: hành động chỉ tốn thời gian, thể lực, sức khỏe, rủi ro (ADR 0010). Không có lương thực, tiền. Hệ quả đo được: chiến lược "lười" (toàn nghỉ) sống 61,6 năm, ngang "điều độ" 61,4 năm; đi thầy thuốc gần như miễn phí.
- GDD 5 v0.3: "Đói, nghèo, bệnh gây hậu quả thật".
- GDD 3.2 F: giá do mô phỏng, không do người chơi; kinh tế cục bộ theo vùng, theo mùa, có thiên tai; người chơi **không phải trung tâm kinh tế**.
- Chưa có NPC (v0.4) và thế lực (v0.6). Kinh tế v0.3 phải chạy được mà không có hai hệ đó, và để v0.4 cắm NPC vào **cùng một chợ, cùng luật** (GDD 1.1: NPC và người chơi dùng cùng luật).
- Đo trên 3 seed (tsvl-01..03), mỗi ô 34 km²:
  - Tỉ lệ đất canh tác theo quần xã gần như phẳng (85–100% mọi quận). Không dùng được làm độ phì nhiêu.
  - Độ cao trung bình quận khác nhau rõ ở seed đồi núi (tsvl-01: 0,11–0,74 km). Ở seed đồng bằng gần như phẳng (tsvl-03: 0,01–0,15 km).
  - Nhiệt độ trung bình chênh ~3° trong một vùng.
  - `RegionMapData` chưa có lượng mưa.

## Phương án
| | A. Chợ tổng hợp theo quận (khuyến nghị) | B. Bảng giá cố định theo mùa + ngẫu nhiên |
|---|---|---|
| Cách làm | Mỗi quận có dân nền (số miệng ăn), kho lương, quỹ tiền. Sản lượng theo đất + thời tiết năm. Giá suy ra từ số tháng dự trữ. | Giá = bảng mùa × hệ số ngẫu nhiên năm. Thu nhập theo bảng. |
| Đúng GDD 3.2 F | Có: giá do mô phỏng, mất mùa thật làm đói thật, quận giàu nghèo khác nhau | Một phần: giá không phản ánh trạng thái nào |
| Nối v0.4 NPC | NPC thay dần dân nền (LOD), dùng cùng hàm mua/bán | Phải làm lại |
| Chi phí | Thêm ~1 module sim, chạy theo tháng (rẻ) | Nhỏ nhất |
| Rủi ro | Cần batch 100 năm không người chơi để chống lạm phát/sụp kho | Ít, nhưng nợ thiết kế lớn ở v0.4 |

## Quyết định (phương án A)

### Đơn vị (số nguyên)
- **Lương thực:** đơn vị trong sim là *thăng* (số nguyên). 10 thăng = 1 *đấu* = khẩu phần một người lớn trong một tuần (10 ngày). Giao diện hiện theo đấu.
  - Người dưới 12 tuổi ăn 5 thăng/tuần.
  - Một người lớn cần 36 đấu/năm.
- **Tiền:** *văn* (đồng), số nguyên; 1.000 văn = 1 quan (chỉ để hiển thị).
- **Đất:** *mẫu*, số nguyên.

### Chợ quận (dân nền tổng hợp)
- Mỗi quận có `EconomyCounty { mouths, grain, money, fertilityPct, weatherPct }`:
  - `mouths`: dân nền suy từ diện tích và loại khu dân cư. Cố định ở v0.3; v0.4 thay một phần bằng NPC thật.
  - `grain`: kho lương của quận (thăng).
  - `money`: quỹ tiền của quận (văn). Gồm chợ, chủ đất, quan phủ trừu tượng.
- **Nhịp:**
  - Tiêu thụ của dân nền: mỗi tháng (pha Thế giới).
  - Thu hoạch của dân nền: một lần ở tháng thu hoạch.
  - Hao hụt kho: 1%/tháng.
  - Ăn uống của người chơi: mỗi tuần (ADR 0013).
  - Lý do tách nhịp: GDD 2 ghi "kinh tế theo tháng", còn cơn đói phải cảm được theo tuần.
- **Sản lượng dân nền một năm:** `mouths × khẩu phần năm × NỀN_DƯ% × fertilityPct × weatherPct`.
  - `NỀN_DƯ` ≈ 105%: năm thường dư một chút.
  - Năm mất mùa: thiếu thật, giá vọt.
- **Giá:** mỗi tháng tính lại theo số tháng dự trữ `grain / tiêu thụ tháng`, nội suy số nguyên trên bảng.

  | Số tháng dự trữ | Giá so với giá gốc |
  |---|---|
  | ≥ 12 | 70% |
  | 6 | 100% |
  | 3 | 150% |
  | 1 | 300% |
  | 0 | 500% (đói kém) |

  - Giá gốc khởi điểm: 4 văn/thăng (40 văn/đấu).
  - Mua đắt hơn giá niêm yết 15%, bán rẻ hơn 15%. Chênh lệch này là cái giá của việc mua bán.
- **Buôn giữa các quận kề:**
  - Mỗi tháng, lương chảy từ quận rẻ sang quận đắt khi chênh giá lớn hơn phí chở. Phí chở tính theo km × `terrainPct` (ADR 0009).
  - Lượng chảy giới hạn 10% chênh lệch. Tiền chảy theo chiều ngược lại.
  - Đây là cách mất mùa ở một quận lan ra quận bên cạnh.
- **Bảo toàn:**
  - Tổng tiền của vùng (các quỹ quận + túi người chơi) **không đổi** qua mọi tick. Test sổ cái bắt lỗi này.
  - Lương thực chỉ sinh ra từ đất + lao động (thu hoạch, hái lượm, săn) và chỉ mất đi khi ăn, hao hụt hoặc bị thiên tai.
  - Không có nguồn nào khác tạo ra lương thực hay tiền.

### Độ phì nhiêu (worldgen) và thời tiết
- `RegionLogic.fertilityPct[county]` có giá trị 70..130, worldgen tính một lần từ:
  - độ cao trung bình (núi trừ),
  - có sông lớn đi qua (cộng),
  - nhiệt độ (mùa sinh trưởng).
- Trường này chỉ thêm vào lớp logic, không đổi `regionIdentity`, nên pin digest vùng không đổi. Save v3 mang theo trường này, không tính lại khi tải.
- Seed đồng bằng sẽ có độ phì gần nhau. Khác biệt giữa các quận khi đó đến chủ yếu từ thời tiết và thiên tai: chấp nhận.
- **Thời tiết năm:**
  - Đầu năm rút một lần trên luồng RNG mới `weather`: mức chung của vùng (mất mùa 50 · kém 80 · thường 100 · khá 110 · được mùa 120, có trọng số) cộng nhiễu ±10 theo quận.
  - Thiên tai (lụt, hạn, châu chấu) là sự kiện (ADR 0014) làm giảm `weatherPct` của quận bị ảnh hưởng.
  - Ghi vào nhật ký dạng tin tức.

### Thu nhập và chi phí của người chơi
Số liệu là điểm khởi đầu, chốt bằng batch ở S7.

| Hành động | Thu | Chi phí tiền / lương mới |
|---|---|---|
| Làm ruộng | Cộng *tuần công* mùa vụ; thu hoạch ở tháng thu hoạch: `tuần công × 5 đấu × (100 + kỹ năng)% × phì × thời tiết`, trần theo số mẫu | Thuế điền 10% sản lượng; tá điền nộp tô 50% cho quỹ quận |
| Làm thuê (trấn/thành) | Lương tuần ~60 văn × (100 + kỹ năng)%, trả từ quỹ quận; quỹ cạn thì hết việc (`lock.no_work`) | — |
| Hái lượm | 3–6 thăng/tuần theo mùa (đông thấp) | — |
| Săn | Thịt (lương) + da bán được, theo kỹ năng | — |
| **Buôn bán nhỏ** (mới, trấn/thành) | Lãi theo kỹ năng *buôn bán* (mới) và độ lớn chợ; có thể lỗ | Cần vốn ≥ 200 văn |
| Học chữ | Kỹ năng | Học phí ~20 văn/tuần |
| Đi thầy thuốc | Hồi bệnh (v0.2) | Phí 30–300 văn theo độ nặng; không đủ tiền thì `lock.money` |
| Di chuyển | Vị trí | Ăn đường + trọ ~10 văn/ô |
| Thuế đinh | — | ~200 văn/năm cho người ≥ 16 tuổi, nộp vào quỹ quận nhà; không đủ thì sinh sự kiện thu thuế (ADR 0014) |

- Kỹ năng mới `trade` (buôn bán) thêm vào bộ kỹ năng của ADR 0010.
- **Mua/bán lương thực: lệnh `TRADE`, không tốn ô.**
  - Người chơi mua/bán tại chợ quận đang đứng, theo giá mô phỏng, chịu chênh lệch ±15%.
  - Lượng mua bị giới hạn bởi kho quận; lượng bán bởi quỹ quận.
  - Lý do không tốn ô: đi chợ để ăn là việc vặt; cái giá nằm ở chênh lệch, ở giá đói kém và ở việc chợ cạn.
- **Đất:** cố định theo xuất thân ở v0.3 (ADR 0013). Mua bán đất hoãn tới v0.7 (nghề nghiệp).

## Hệ quả
- Thêm module `sim/src/economy/` (chợ, giá, buôn quận, sổ cái), luồng RNG `weather` và `economy`. Mọi digest đời cũ đổi; pin được cập nhật có chủ đích như ở v0.2.
- `RegionLogic` thêm `fertilityPct`; worldgen có test khoảng giá trị và tính tất định.
- Test bắt buộc:
  - sổ cái tiền bảo toàn ở mọi tick;
  - chạy 100 năm không người chơi trên 10 seed: không kho âm, giá trong [70%, 500%], tần suất đói kém (≤ 1 tháng dự trữ) khoảng 1 lần mỗi 8–15 năm mỗi quận.
- Ngân sách tick: phần kinh tế chạy theo tháng × ~10–20 quận, không đáng kể so với 200 ms/tháng.
- Hoãn:
  - Thế lực kiểm soát đường buôn và thuế theo thế lực (v0.6);
  - Uy tín/danh tiếng (v0.5);
  - Mua bán đất, nghề nghiệp chính thức (v0.7);
  - Chợ tài nguyên tu luyện (v0.9).

## Ghi chú triển khai S2 (2026-10-27)
- **Mã:** `packages/sim/src/economy/market.ts` (chợ) và `simulate.ts` (chạy không người chơi). Lệnh kiểm: `pnpm sim economy --seeds 10 [--years 100]`.
- **Số liệu khởi điểm:**
  - Dân nền: 150 / 200 / 300 miệng mỗi ô (làng / trấn / thành) × độ phì.
  - Dân nền nhân độ phì: đất tốt nuôi nhiều người hơn. Nhờ vậy quận đất xấu không bị đói kinh niên; độ phì quyết định độ lớn chợ (và sản lượng ruộng người chơi ở S3).
  - Mỗi miệng ăn 30 thăng/tháng; quỹ 100 văn/miệng.
  - Sản lượng năm thường 107% nhu cầu × thời tiết; thu hoạch đầu tháng Chín.
  - Hao kho 0,5%/tháng (bản nháp ghi 1%: quá cao so với phần dư 5–7%, kho không bao giờ tích được).
  - Thời tiết vùng 50 / 80 / 100 / 110 / 120% với trọng số 6 / 14 / 50 / 20 / 10, mỗi quận lệch thêm ±10.
  - Buôn quận kề tối đa 2% kho/tháng; phí chở (văn/đấu) = km × địa hình% × 5 / 10.000.
- **Kho ban đầu** = 4 tháng dự trữ + số tháng còn tới vụ. Lỗi đã sửa: kho cố định 6 tháng làm người sinh sau mùa gặt gặp đói kém giả ngay năm đầu.
- **Giá niêm yết** tính lại mỗi đầu tháng; mua bán trong tháng theo giá này.
- **Tin tức** chỉ về quận đang đứng: mất mùa (ngắt tua nếu đã ra riêng), được mùa, đói kém (ngắt tua), hết đói kém.
- **Kết quả nghiệm thu** (`pnpm sim economy --seeds 10`):
  - mỗi quận đói kém 1 lần / 11 năm (mục tiêu 8–15);
  - 1,8% tháng đói kém, 3% tháng khan hiếm;
  - giá trong 70–500%;
  - tiền bảo toàn ở 10/10 vùng, kho không âm.
- **Chưa có:**
  - lệnh `TRADE` bán/mua chủ động (S4);
  - tô, thuế (S3, S4);
  - dân nền chết đói (v0.4 NPC).
