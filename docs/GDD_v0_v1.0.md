# TRƯỜNG SINH VÔ LỘ — Game Design Document (v0 → v1.0)

> Trạng thái: bản nháp 1. Các mục đánh dấu **[CẦN XÁC NHẬN]** là giả định của người soạn, cần chủ dự án quyết định.

---

## 1. Tầm nhìn

Trường Sinh Vô Lộ là game mô phỏng trọn một đời người trong thế giới tu tiên tự vận hành. Người chơi không phải thiên mệnh chi tử. Họ chỉ là một sinh linh trong rất nhiều sinh linh đang tìm cách sống sót, tu luyện và tìm trường sinh.

**Câu hỏi của game:** *"Với chừng ấy năm sống, bạn chọn đánh đổi điều gì?"*

### 1.1 Bốn trụ cột thiết kế

| # | Trụ cột | Nghĩa là | Kiểm tra khi thiết kế tính năng |
|---|---|---|---|
| 1 | **Một đời, một mạng** | Chết là hết. Không chuyển sinh, không kế thừa. | Tính năng này có làm cái chết mất ý nghĩa không? Nếu có thì bỏ. |
| 2 | **Mọi thứ có giá** | Mọi hành động tốn thời gian, tiền, cơ hội, quan hệ hoặc thọ nguyên. | Lựa chọn này có thật sự phải đánh đổi không? |
| 3 | **Thế giới không chờ bạn** | NPC và thế lực vận hành khi người chơi không can thiệp. | Nếu người chơi bỏ qua, thế giới có khác đi không? |
| 4 | **Không phải nhân vật chính** | Thế giới không ưu ái người chơi. Không có cốt truyện tuyến tính. | Có ai "đang chờ" người chơi tới cứu không? Nếu có thì sai. |

### 1.2 Phạm vi giai đoạn v0 → v1.0

Cả giai đoạn này nằm trong **thế giới phàm nhân, tiệm cận thế giới tu tiên**. Người chơi sống như phàm nhân, chỉ nghe và thấy dấu vết của tu tiên giả. Tu tiên là một **ngưỡng cửa** mà người chơi có thể chạm tới hoặc không bao giờ chạm tới.

**[ĐÃ CHỐT]** Ranh giới v1.0: người chơi có thể **bước qua ngưỡng cửa** (khai linh căn → học dẫn khí) và chơi tiếp ở **Luyện Khí tầng 1–3**. **Luyện Khí tầng 4 trở lên** và mọi cảnh giới cao hơn nằm ngoài v1.0 (mục 4). Tầng 3 là trần cứng của v1.0: đạt tầng 3 là điểm cao nhất của hành trình tu luyện trong phiên bản này.

---

## 2. Vòng lặp cốt lõi

```
Bắt đầu tuần → thế giới tick (NPC, thế lực, sự kiện; hệ thống chậm chạy ở tuần đầu kỳ)
      ↓
Xem tình hình (nhân vật, tin tức, cơ hội)
      ↓
Phân bổ thời gian (đầu tháng chia 3 "ô hành động", mỗi ô một tuần)
      ↓
Giải quyết: hành động + sự kiện ngẫu nhiên/hệ thống
      ↓
Hậu quả (tài nguyên, quan hệ, sức khỏe, thọ nguyên)
      ↓
Qua tuần → (3 tuần: sang tháng; 12 tháng: sang năm, lão hóa, tổng kết)
```
*(Sửa theo ADR 0002, 2026-10-25: tick tuần, pha có nhịp.)*

- **Đơn vị thời gian [ĐÃ CHỐT, ADR 0002]:** tick cơ sở = **1 tuần (tuần = 10 ngày)**. 3 tuần (thượng, trung, hạ tuần) = 1 tháng, 12 tháng = 1 năm = 360 ngày = 36 tick. Mùa ảnh hưởng thu hoạch, bệnh tật, đi đường. Hệ thống chậm chạy theo lịch riêng: NPC xa người chơi và kinh tế theo tháng, thế lực theo quý, lão hóa theo năm.
- **Đơn vị hành động:** mỗi tháng nhân vật có **3 ô thời gian**, mỗi ô đúng một tuần. Hoạt động dài chiếm nhiều ô (một chuyến đi xa, bế quan, một mùa vụ).
- **Tốc độ:** người chơi có thể tua nhanh khi không có việc, nhưng sự kiện quan trọng luôn ngắt tua.
- **Phiên chơi mục tiêu:** một đời đầy đủ 40–70 năm đời phàm trong khoảng 2–4 giờ nếu tua nhanh hợp lý.

---

## 3. Các hệ thống và thứ tự ưu tiên

Quy ước ưu tiên:
- **P0** = bắt buộc để có bản chơi được từ đầu đến chết (MVP).
- **P1** = cần cho v1.0, đưa vào sau khi P0 chạy ổn.
- **P2** = nên có, làm nếu còn thời gian trước v1.0.

### 3.1 Tổng hợp

| Hệ thống | Ưu tiên | Hiện trạng | Phiên bản mục tiêu |
|---|---|---|---|
| Tạo nhân vật | P0 | **Có tool web độc lập, chưa vào game** | v0.1 (đưa logic vào lõi mô phỏng, nối vào vòng tick) |
| Thời gian & vòng tick | P0 | Chưa | v0.1 |
| Thọ nguyên, sinh–lão–bệnh–tử, kết thúc game | P0 | Chưa | v0.1 |
| Sinh tạo thế giới (bản đồ sơn thủy) | P0 | **Đang làm** | v0.2 |
| Hành động & ô thời gian | P0 | Chưa | v0.2 |
| Tài nguyên & kinh tế phàm nhân | P0 | Chưa | v0.3 |
| NPC có đời sống riêng | P0 | Chưa | v0.4 |
| Quan hệ giữa người với người | P1 | Chưa | v0.5 |
| Thế lực tự phát triển | P1 | Chưa | v0.6 |
| Hệ thống sự kiện | P0 (lõi) → P1 (nội dung) | Chưa | v0.3 → v0.7 |
| Nghề nghiệp & con đường sống | P1 | Chưa | v0.7 |
| Cửa ngõ tu tiên (ngưỡng cửa) | P1 | Chưa | v0.8 |
| Tu luyện Luyện Khí tầng 1–3 | P1 | Chưa | v0.8 → v0.9 |
| Tông môn (mức tuyển & nhập môn) | P2 | Chưa | v0.9 |
| Nhật ký đời người & màn tổng kết | P1 | Chưa | v0.9 |
| Lưu/tải, cân bằng, tối ưu, QA | P0 → P1 | Chưa | xuyên suốt, chốt v1.0 |

### 3.2 Chi tiết từng hệ thống

#### A. Tạo nhân vật (P0, đã có)
- Sinh ngẫu nhiên: xuất thân, thiên phú, linh căn, tính cách, thọ nguyên, điều kiện ban đầu.
- **Cần nối vào mô phỏng:** mỗi thuộc tính phải có ít nhất một tác động thật lên hành động, sự kiện hoặc thọ nguyên. Thuộc tính không tác động gì thì bỏ khỏi v1.0.
- **Linh căn ở giai đoạn phàm nhân:** là giá trị **ẩn / chưa thức tỉnh**. Người chơi không thấy rõ cho tới khi được kiểm tra. Điều này giữ cảm giác "có thể bạn là phàm nhân thật sự".
- Seed của nhân vật gắn với seed thế giới để chơi lại cho kết quả có thể tái lập (hỗ trợ debug).

#### B. Thời gian & mô phỏng (P0)
- Một bộ mô phỏng chạy theo tick tuần (các hệ thống chậm theo lịch tháng/quý/năm, mục 2), **tách khỏi giao diện** (mô phỏng chạy được không cần UI để test).
- Mô phỏng **xác định theo seed** (cùng seed + cùng lựa chọn = cùng kết quả).
- Thứ tự mỗi tick cố định: thế giới → thế lực → NPC → sự kiện → người chơi → hậu quả.
- **Mô phỏng theo mức chi tiết (LOD):** NPC gần người chơi mô phỏng đầy đủ, NPC xa dùng bản rút gọn theo năm. Đây là điều kiện để thế giới có hàng trăm NPC mà không chậm.

#### C. Thọ nguyên, sinh–lão–bệnh–tử (P0)
- Thọ nguyên cơ bản phàm nhân ~ 40–80 năm, dao động theo thể chất, xuất thân, nghề nghiệp, bệnh tật, tai họa.
- Sức khỏe suy giảm theo tuổi; bệnh và thương tật để lại hậu quả dài hạn.
- Người tu luyện Luyện Khí được cộng thọ nguyên nhẹ theo tầng (mục 3.2 L2); mô hình thọ nguyên phải có chỗ cộng thêm này ngay từ v0.1.
- **Cái chết:** nhiều nguyên nhân (già, bệnh, đói, bạo lực, tai nạn, thiên tai). Chết là kết thúc, thế giới **ngừng mô phỏng** (theo thiết kế MVP).
- Màn kết thúc: tóm tắt đời người (mục 3.2 N).

#### D. Sinh tạo thế giới sơn thủy (P0, đang làm)
Mục tiêu của v1.0 là một bản đồ **đủ để mô phỏng có ý nghĩa**, không cần đẹp cực đại.

- Địa hình: núi, sông, hồ, đồng bằng, rừng, vùng hoang.
- Phong cách thị giác sơn thủy được tách khỏi dữ liệu logic: lớp dữ liệu (ô/vùng, độ cao, nước, độ phì nhiêu) độc lập với lớp vẽ.
- Địa danh: làng, trấn, thành nhỏ, đường đi, bến sông, ngôi miếu, vùng nguy hiểm.
- Dữ liệu bản đồ phải trả lời được: *"đi từ A đến B mất bao lâu, nguy hiểm thế nào, ai kiểm soát?"* Đây là đầu vào cho hành động, kinh tế, thế lực.
- Quy mô v1.0 **[CẦN XÁC NHẬN]**: 1 vùng, khoảng 5–10 làng, 1–3 trấn, 1 thành, vài vùng hoang dã. Tính tương lai: tạo thêm vùng không phá cấu trúc dữ liệu.
- **Dấu hiệu tiệm cận tu tiên:** núi sâu, di tích, tin đồn về tiên môn. Chỉ là điểm gợi ý, chưa vào được.

#### E. Hành động & ô thời gian (P0)
Danh mục hành động tối thiểu cho v1.0:

| Nhóm | Ví dụ | Giá |
|---|---|---|
| Mưu sinh | làm ruộng, làm thuê, buôn bán nhỏ, săn bắn, thủ công | thời gian, thể lực, rủi ro |
| Di chuyển | đi làng khác, vào trấn/thành, ra vùng hoang | thời gian, tiền, nguy hiểm |
| Học tập | học chữ, học nghề, học võ, nghe ngóng bí mật | thời gian, tiền, cơ hội |
| Xã giao | thăm hỏi, kết giao, cưới hỏi, kết thù | thời gian, tiền, quan hệ |
| Nghỉ ngơi / chữa bệnh | nghỉ dưỡng, đi thầy thuốc | thời gian, tiền |
| Tìm cơ duyên | thăm miếu, vào núi sâu, hỏi thăm tu sĩ | thời gian, rủi ro cao |

Quy tắc: **không có hành động miễn phí.** Mọi hành động đều làm mất ít nhất một thứ.

#### F. Tài nguyên & kinh tế (P0)
- Tài nguyên: **lương thực, tiền (bạc/đồng), sức khỏe, thể lực, uy tín/danh tiếng, thời gian**.
- Kinh tế cục bộ theo vùng: mùa màng, giá lương thực biến động theo mùa, thiên tai, thế lực kiểm soát đường buôn.
- Người chơi **không phải trung tâm kinh tế**: giá cả do mô phỏng, không do người chơi.
- Không có "đồ ngon nhặt miễn phí" dẫn tới vượt trội.
- **Tài nguyên tu luyện** (linh thạch hạ phẩm, đan dược cấp thấp) là hàng cực hiếm và đắt, có chợ riêng tách khỏi kinh tế phàm nhân (xem mục 3.2 L2).

#### G. NPC có đời sống riêng (P0 lõi, P1 độ sâu)
- NPC có: tuổi, nghề, nhà ở, gia đình, tính cách, mục tiêu, tài sản, quan hệ.
- NPC sinh ra, lớn lên, làm việc, kết hôn, sinh con, già đi, chết **khi người chơi không để ý**.
- NPC ra quyết định bằng **cơ chế nhu cầu/mục tiêu đơn giản** (ăn ở → an toàn → quan hệ → tham vọng), chưa dùng AI phức tạp.
- Một số NPC "đặc biệt" (thầy thuốc, tu sĩ lưu lạc, thương nhân, kẻ cướp) sinh ra từ mô phỏng chứ không đặt cố định.
- **Số lượng v1.0** **[CẦN XÁC NHẬN]**: 150–400 NPC mô phỏng đầy đủ + LOD cho phần còn lại.

#### H. Quan hệ (P1)
- Mỗi cặp quan hệ có vài trục: thân thiết, tin cậy, thù hận, nợ ơn.
- Quan hệ thay đổi theo hành động, sự kiện và lời đồn.
- Hậu quả thật: bạn bè giúp qua cơn đói, kẻ thù hại bạn, gia đình ràng buộc thời gian.
- **Con cái:** có thể sinh ra và lớn lên trong mô phỏng (cho sâu sắc nhân sinh), nhưng **người chơi không điều khiển con cháu** và khi người chơi chết thì thế giới dừng.

#### I. Thế lực tự phát triển (P1)
- Loại thế lực v1.0: gia tộc, làng/trấn tự quản, thương hội, băng cướp, quan phủ.
- Mỗi thế lực có: tài nguyên, nhân khẩu, lãnh thổ, thái độ với các thế lực khác.
- Thế lực **thịnh, suy, sáp nhập, diệt vong** theo mô phỏng (mùa màng, chiến tranh nhỏ, buôn bán, tham quan).
- Thế lực tác động lên người chơi qua: thuế, đường đi, an ninh, cơ hội việc làm, tuyển người.
- **Chưa có** thế lực tu tiên hoàn chỉnh. Tông môn chỉ hiện diện qua sứ giả tuyển đệ tử, tin đồn và tác động gián tiếp.

#### J. Hệ thống sự kiện (P0 lõi, P1 nội dung)
- Sự kiện sinh ra từ **trạng thái thế giới + trạng thái nhân vật**, không phải danh sách ngẫu nhiên thuần túy.
- Cấu trúc: điều kiện kích hoạt → mô tả → các lựa chọn (mỗi lựa chọn có giá) → hậu quả.
- Phân loại: đời thường, kinh tế, quan hệ, tai họa, cơ duyên, tu tiên (hiếm).
- Mục tiêu nội dung v1.0 **[CẦN XÁC NHẬN]**: ~120–200 sự kiện, mỗi sự kiện có biến thể theo ngữ cảnh. Chất lượng quan trọng hơn số lượng.
- **Không có sự kiện nào ép người chơi đi theo một tuyến cố định.**

#### K. Nghề nghiệp & con đường sống (P1)
Con đường phàm nhân (v1.0): nông dân, thợ thủ công, thương nhân, thợ săn, thầy thuốc học việc, lính/võ sinh, tán nhân lưu lạc, ẩn dật.

- Mỗi nghề có: thu nhập, rủi ro, kỹ năng, tuổi thọ trung bình, cơ hội gặp cơ duyên khác nhau.
- Chuyển nghề tốn thời gian và quan hệ.

#### L. Cửa ngõ tu tiên (P1)
Đây là phần "tiệm cận" của giai đoạn v1.0.

- **Tiếp xúc:** tin đồn, di tích, tu sĩ ghé qua, vật phẩm lạ.
- **Kiểm tra linh căn:** chỉ xảy ra qua cơ duyên hoặc tuyển đệ tử, có xác suất theo linh căn ẩn, tuổi, may mắn.
- **Hai kết cục chính:**
  - Bước qua: được dẫn khí nhập môn, vào **Luyện Khí tầng 1** và tiếp tục theo mục 3.2 L2.
  - Không bước qua: tiếp tục đời phàm, hoặc ôm hối tiếc/ám ảnh (hệ quả tâm lý, quan hệ).
- **Hai đường vào:** (a) qua tông môn tuyển đệ tử, (b) tán tu tự dẫn khí nhờ cơ duyên (công pháp thô, di tích, tu sĩ lưu lạc chỉ điểm). Đường (b) khó hơn, rủi ro cao hơn, nhưng không bị ràng buộc tông môn.
- Giá: tuổi tác (lỡ tuổi thì khó), tiền, thời gian, bỏ lại gia đình/quan hệ.
- **Tu tiên không phải con đường "đúng"**: có người sống thọ và hạnh phúc hơn khi ở lại phàm giới, và game phải cho thấy điều đó.

#### L2. Tu luyện Luyện Khí tầng 1–3 (P1)
Mục tiêu: cho cảm giác tu luyện thật, có tiến triển và có giá, trong một phạm vi đủ nhỏ để làm kỹ.

- **Cơ chế tiến triển:** mỗi tầng cần tích lũy **linh khí** qua ô thời gian dành cho tu luyện, rồi **đột phá** (có thể thất bại). Tốc độ phụ thuộc linh căn (loại và độ thuần), thiên phú, công pháp, nơi tu luyện (linh khí vùng), tài nguyên hỗ trợ.
- **Đột phá:** xác suất theo tâm cảnh, tài nguyên, tuổi. Thất bại để lại hậu quả (thương tổn kinh mạch, mất tài nguyên, tụt tâm cảnh), không phải "thử lại miễn phí". Hậu quả nặng có thể rút ngắn đời.
- **Thọ nguyên:** mỗi tầng tăng thọ nguyên **nhẹ** (mức tăng cụ thể do cân bằng quyết định, giữ ở mức khiến trường sinh vẫn là mục tiêu xa, chưa phải thứ chạm tay tới). Luyện Khí tầng 3 vẫn chết vì già, bệnh, bạo lực.
- **Tài nguyên tu luyện:** linh thạch hạ phẩm, đan dược cấp thấp, công pháp nhập môn. Khan hiếm, đắt, nguồn từ tông môn, chợ tu sĩ hiếm, hoặc cơ duyên. Mô phỏng kinh tế phải tính cả chợ này nhưng tách khỏi kinh tế phàm nhân.
- **Năng lực:** chỉ vài thứ nhẹ (tăng thể chất, dẫn khí, 1–2 thuật cơ bản dạng tiện ích hoặc tự vệ). Chiến đấu vẫn giải quyết bằng chỉ số + sự kiện, chưa có hệ thống chiến đấu riêng.
- **Quan hệ với phàm giới:** người tu luyện bắt đầu tách khỏi người thân (khác tuổi già, khác mối quan tâm). Đây là cái giá cảm xúc cần có sự kiện tương ứng.
- **Nguy cơ mới:** tu sĩ khác (đồng đạo, kẻ cướp đoạt, ma tu cấp thấp), tẩu hỏa nhập ma, bị tông môn ràng buộc nghĩa vụ.
- **Trần v1.0:** đạt Luyện Khí tầng 3 là điểm cao nhất. Người chơi **không** thấy hoặc đột phá được tầng 4. Có thể gợi ý tầng 4 qua lời đồn để nhắc rằng con đường còn dài.
- **Tỉ lệ mục tiêu:** chạm ngưỡng (vào tầng 1) là thiểu số, đạt tầng 3 là thiểu số nhỏ hơn nhiều **[giá trị cụ thể chốt khi cân bằng bằng mô phỏng hàng loạt]**. Nếu ai cũng đạt tầng 3 thì thế giới mất ý nghĩa "không phải nhân vật chính".

#### M. Tông môn (P2)
- v1.0 chỉ có **một hoặc hai tông môn mức sơ khai**: tuyển người, quy tắc ngoại môn, nghĩa vụ, cấp phát tài nguyên tu luyện hạn chế, nhiệm vụ ngoại môn.
- Phục vụ người chơi ở Luyện Khí tầng 1–3 (đệ tử ngoại môn). Không có nội môn, trưởng lão, chính trị tông môn đầy đủ, đại chiến, bí cảnh.
- Tông môn là **thế lực tự vận hành** như các thế lực khác (mục 3.2 I): cũng có thể thịnh, suy, tuyển ít hay nhiều tùy mô phỏng.

#### N. Nhật ký đời người & tổng kết (P1)
- Sự kiện lớn được ghi vào nhật ký tự động (ngôn ngữ văn chương ngắn).
- Màn tổng kết khi chết: tuổi thọ, nguyên nhân chết, di sản (quan hệ, của cải, danh tiếng), những ngã rẽ đã chọn, điều thế giới đã làm trong lúc bạn sống.
- Đây là **phần thưởng cảm xúc** thay cho hệ thống kế thừa.

#### O. Nền tảng (P0)
- Lưu/tải một đời (một file save có seed + trạng thái).
- Chế độ chạy mô phỏng không giao diện để kiểm thử cân bằng hàng loạt.
- Chạy được ở máy cấu hình trung bình. Ngân sách tick mục tiêu **[ĐÃ CHỐT, ADR 0002]:** một tháng mô phỏng (3 tick tuần + pha tháng) dưới ~200 ms ở quy mô v1.0, trên máy mục tiêu (laptop 4 nhân, 8 GB RAM, Chrome bản mới). v0.1 chỉ đo.

---

## 4. Những gì CẮT khỏi MVP (và khỏi v1.0)

### 4.1 Cắt hẳn ở giai đoạn này

| Bị cắt | Lý do |
|---|---|
| Chuyển sinh, kế thừa, điều khiển con cháu | Phá trụ cột "một đời, một mạng". |
| Luyện Khí tầng 4 trở lên, Trúc Cơ và các cảnh giới cao | Trần v1.0 là Luyện Khí tầng 3. |
| Hệ thống chiến đấu chi tiết (kỹ năng, combo, nhiều pháp thuật) | Tốn kém, không phải trọng tâm. Giải quyết bằng phán đoán dựa trên chỉ số + sự kiện. Chỉ giữ 1–2 thuật cơ bản. |
| Pháp bảo, trận pháp, chế tạo/luyện đan chuyên sâu | Thuộc thế giới tu tiên đầy đủ. Ở tầng 1–3 chỉ dùng đan dược cấp thấp như vật tiêu thụ. |
| Bí cảnh, dungeon, boss | Đi ngược tinh thần "mô phỏng nhân sinh". |
| Đa người chơi, online, bảng xếp hạng | Không liên quan, tốn chi phí lớn. |
| Cốt truyện tuyến tính, nhân vật chính định mệnh | Phản trụ cột #4. |
| Thế giới liên tục sau khi chết | Theo thiết kế MVP, chết thì thế giới dừng. |
| Nhiều vùng/lục địa, thế giới khổng lồ | Giữ một vùng nhỏ, sâu thay vì rộng. |
| Lồng tiếng, cắt cảnh điện ảnh, hoạt hình nhân vật phức tạp | Chi phí lớn, giá trị thấp ở v1.0. |
| Tạo ảnh chân dung bằng AI trong game lúc chạy | Giữ ở khâu sản xuất art (xem `TruongSinhVoLoArt`), không đưa vào runtime v1.0. |

### 4.2 Hoãn (có thể làm sau v1.0)
- Chính trị tông môn đầy đủ, quan hệ sư môn sâu.
- Hệ thống tu luyện từ Luyện Khí tầng 4 trở lên (Trúc Cơ, Kim Đan...), cùng pháp bảo, trận pháp, luyện đan, luyện khí.
- Thế lực tu tiên và chiến tranh giữa các tông.
- Nhiều thế giới khác nhau (biome, văn hóa).
- Mod / công cụ tạo sự kiện cho cộng đồng.
- Meta-progression kiểu nhẹ (mở khóa xuất thân mới) **[CẦN XÁC NHẬN nếu có muốn, nhưng không được phá "không kế thừa sức mạnh"]**.

### 4.3 Nguyên tắc cắt
Khi phải chọn, **giữ chiều sâu của hệ quả hơn là số lượng tính năng**. Một hành động có hậu quả rõ ràng, dài hạn đáng giá hơn năm hành động hời hợt.

---

## 5. Lộ trình phiên bản

| Phiên bản | Mục tiêu | Tiêu chí hoàn thành |
|---|---|---|
| **v0.1 — Vào đời** | Nhân vật sống, già, chết trong vòng tick tuần. Chọn nơi sinh trên bản đồ vùng (chỉ xem, chưa di chuyển). | Chạy 1 đời từ sinh tới chết không lỗi; kết thúc được; tạo nhân vật nối vào mô phỏng; chạy được không giao diện. |
| **v0.2 — Có thế giới** | Bản đồ sơn thủy + hành động cơ bản + ô thời gian. | Người chơi di chuyển, làm việc, tốn thời gian thật. |
| **v0.3 — Có giá để sống** | Kinh tế phàm nhân + khung sự kiện. | Đói, nghèo, bệnh gây hậu quả thật; ~30 sự kiện chạy được. |
| **v0.4 — Có người khác** | NPC mô phỏng đời sống + LOD. | NPC sinh/lão/bệnh/tử khi người chơi không can thiệp; ổn định ở 150+ NPC. |
| **v0.5 — Có quan hệ** | Quan hệ, gia đình, lời đồn. | Quan hệ tác động tới kết cục; có hôn nhân/con cái ở mức cơ bản. |
| **v0.6 — Thế lực sống** | Gia tộc/thương hội/quan phủ/cướp tự phát triển. | Chạy 50 năm không người chơi thì bản đồ thế lực thay đổi hợp lý. |
| **v0.7 — Con đường sống** | Nghề nghiệp + mở rộng nội dung sự kiện. | 6+ con đường phàm nhân khác biệt rõ; ~100 sự kiện. |
| **v0.8 — Ngưỡng cửa & Luyện Khí tầng 1** | Cửa ngõ tu tiên: tiếp xúc, kiểm tra linh căn, hai đường vào (tông môn / tán tu), tu luyện và đột phá lên tầng 1. | Có thể chạm ngưỡng và vào tầng 1; đủ giá để lựa chọn có trọng lượng; thất bại đột phá có hậu quả. |
| **v0.9 — Luyện Khí tầng 2–3 & khép lại một đời** | Đột phá tầng 2–3, tông môn ngoại môn sơ khai, chợ tài nguyên tu luyện, nhật ký, màn tổng kết, cân bằng. | Mỗi cái chết kể được một câu chuyện; tầng 3 là trần cứng; tỉ lệ chạm ngưỡng và đạt tầng 3 nằm trong khoảng mục tiêu qua chạy mô phỏng hàng loạt. |
| **v1.0 — Phát hành** | Đánh bóng, lưu/tải, QA, hiệu năng. | Xem mục 6. |

> Nguyên tắc: **mỗi phiên bản đều phải chơi được từ đầu tới cuối.** Không để "làm hết hệ thống rồi mới ráp".

---

## 6. Định nghĩa "xong" của v1.0

1. Một đời đầy đủ chơi được từ tạo nhân vật đến chết, không lỗi chặn.
2. Ít nhất 6 con đường sống phàm nhân khác biệt về cảm giác và kết cục.
3. Thế giới chạy được 50+ năm không có người chơi mà không sụp đổ vô lý (dân số, kinh tế).
4. Người chơi có thể **chạm ngưỡng tu tiên**, tu luyện và đạt **Luyện Khí tầng 1–3** (trần cứng, không vượt được), và cũng có thể sống trọn đời mà **không** chạm tới. Thất bại đột phá và các cái giá của tu luyện hoạt động đúng thiết kế.
5. Tái lập được: cùng seed và cùng lựa chọn cho cùng kết quả.
6. Lưu/tải ổn định.
7. Kiểm thử cân bằng hàng loạt bằng mô phỏng không giao diện (ví dụ chạy hàng nghìn đời): phân bố tuổi thọ, nguyên nhân chết, tỉ lệ chạm ngưỡng nằm trong khoảng mục tiêu.
8. Hiệu năng đạt ngân sách tick ở máy mục tiêu.

---

## 7. Rủi ro chính

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Phạm vi phình to (nhiều hệ thống, ít chiều sâu) | Cao | Bám mục 4; mỗi phiên bản phải chơi được trọn vẹn. |
| NPC/thế lực mô phỏng không ổn định (sụp dân số, lạm phát) | Cao | Mô phỏng không giao diện + chạy hàng loạt từ sớm (v0.1). |
| Hiệu năng khi nhiều NPC | Trung bình | LOD ngay từ v0.4, không để sau. |
| Nội dung sự kiện lặp, nhạt | Cao | Sự kiện sinh từ trạng thái, có biến thể; ưu tiên chất lượng. |
| Người chơi cảm thấy "không có gì để làm" khi thế giới tự chạy | Trung bình | Hành động luôn có giá và có lựa chọn thật; cơ hội phải hiện rõ. |
| Bản đồ sơn thủy đẹp nhưng không đủ dữ liệu logic | Trung bình | Tách lớp dữ liệu và lớp vẽ; kiểm tra các câu hỏi ở mục 3.2 D. |
| Chết quá sớm do ngẫu nhiên gây ức chế | Trung bình | Tinh chỉnh bằng dữ liệu mô phỏng; cảnh báo và cơ hội cứu vãn trước cái chết, không phải "bất tử hóa". |

---

## 8. Câu hỏi mở (cần chủ dự án quyết định)

1. ~~**Ranh giới v1.0**~~ **[ĐÃ CHỐT]:** cho chơi Luyện Khí tầng 1–3, trần là tầng 3.
2. **Engine & nền tảng — [ĐỀ XUẤT]:** web, **TypeScript + Vite**. Lõi mô phỏng là package thuần TS (`packages/sim`), không phụ thuộc UI, chạy được bằng Node/Vitest để cân bằng hàng loạt. Bản desktop (Steam) đóng gói sau bằng Electron hoặc Tauri. Lý do: vòng lặp sửa–chạy nhanh nhất, cùng stack với `portrait-studio` (chia sẻ kiểu dữ liệu và công cụ), game thiên menu/văn bản nên không cần engine 3D/2D nặng. Godot là phương án dự phòng; Unity bị loại vì tốn thời gian cho game kiểu này. Chưa có code game nào, và công cụ tạo nhân vật hiện có là tool web, nên không có chi phí chuyển đổi nào cản lựa chọn này.
3. **Góc nhìn & giao diện — [ĐỀ XUẤT]:** giao diện bảng điều khiển (panel) kết hợp **bản đồ sơn thủy tương tác** (kéo, phóng to, bấm vào địa danh để chọn điểm đến). Người chơi không điều khiển nhân vật đi lại trên bản đồ. Sự kiện hiện dạng thẻ có minh họa và chân dung NPC.
4. **Quy mô thế giới — [ĐỀ XUẤT]:** làm theo hai nấc. Nấc 1 (v0.4 đến v0.7): 1 vùng, 5–8 làng, 1–2 trấn, 1 thành, ~150 NPC, ~80 sự kiện chất lượng. Nấc 2 (v0.8 đến v1.0): mở lên mức trong mục 3.2 sau khi LOD và cân bằng đã ổn. Không tăng quy mô trước khi mô phỏng ổn định.
5. **Ô thời gian mỗi tháng — [ĐỀ XUẤT]:** 3 ô/tháng, hoạt động dài chiếm nhiều tháng. Dễ đọc, dễ cân bằng hơn điểm liên tục. Con số 3 là giá trị khởi điểm, chốt bằng mô phỏng.
6. **Meta-progression — [ĐỀ XUẤT]:** không có sức mạnh nào mang sang đời sau. Chỉ có **sổ lưu các đời đã chơi** (nhật ký, kết cục, thành tựu) ở chế độ chỉ xem, và có thể mở thêm xuất thân hoặc sự kiện mới mà không tăng sức mạnh. Nếu muốn giữ tuyệt đối thuần, bỏ phần mở khóa và chỉ giữ sổ lưu.
7. **Ngôn ngữ — [ĐỀ XUẤT]:** chỉ làm Tiếng Việt, nhưng **toàn bộ chuỗi văn bản đặt trong file khóa–giá trị từ ngày đầu** để thêm ngôn ngữ sau không phải sửa code. Chọn font hỗ trợ đủ dấu tiếng Việt và hợp phong cách Hán Việt.
8. **Hệ thống tạo nhân vật hiện có — [ĐÃ LÀM RÕ]:** hiện là một tool web độc lập, chưa nằm trong game và chưa gắn với mô phỏng. Việc cần làm ở v0.1: đưa logic sinh nhân vật thành package dùng chung (`packages/sim`), để tool web và game cùng gọi một nguồn. Cách rà soát: lập bảng thuộc tính → hệ thống nào đọc nó → tác động cụ thể. Thuộc tính không có ít nhất một tác động thì bỏ hoặc hoãn khỏi v1.0 (mục 3.2 A).

---

## 9. Bước tiếp theo đề xuất

1. Duyệt các đề xuất ở mục 8 (engine web TypeScript là quyết định có hệ quả lớn nhất).
2. Rà soát hệ thống tạo nhân vật hiện có theo mục 3.2 A và chốt danh sách thuộc tính cuối.
3. Viết spec kỹ thuật cho **mô phỏng tick không giao diện + seed xác định** (nền của v0.1) trước khi hoàn thiện sinh tạo bản đồ.
4. Chốt cấu trúc dữ liệu bản đồ (lớp logic) song song với phong cách vẽ sơn thủy.

---

## 10. Tài sản đã có và đề xuất tái sử dụng

Hai thứ đã có trước GDD này: demo `Thien-menh-tan-gioi` và repo `code104s/truong-sinh-vo-lo-map-gen`. Cả hai đều là web TypeScript, xác nhận lựa chọn engine ở mục 8.

### 10.1 Demo Thiên Mệnh Tàn Giới

Monorepo pnpm: `packages/simulation` (lõi thuần), `packages/shared` (schema/protocol), `packages/game-data`, `apps/web` (React + Web Worker), `tools/headless` (CLI), kèm bộ tài liệu ADR 01–16. Lõi đã có: RNG sfc32 nhiều luồng, toán số nguyên, digest chuẩn hóa, snapshot, scheduler, kiểm tra bất biến, luật ESLint cấm `Math.random`, test determinism, CLI `pnpm sim run/report/bench`, sinh địa hình hex số nguyên, tu luyện Luyện Khí → Kim Đan, tông môn, tranh chấp linh mạch, Sử ký.

**Khác biệt với GDD này:**

| | Demo | GDD này |
|---|---|---|
| Nhân vật | Tu sĩ cấp thấp ngay từ đầu | Phàm nhân, có thể bước qua ngưỡng tu tiên |
| Tick | 1 ngày | 1 tuần = 10 ngày (ADR 0002) |
| NPC | 20 NPC quan trọng | 150–400 NPC, có LOD |
| Thế lực | 3 tông môn | Gia tộc, làng, thương hội, quan phủ, cướp, tông môn sơ khai |
| Cảnh giới | Luyện Khí → Kim Đan | Chỉ Luyện Khí tầng 1–3 |
| Người chơi chết | Có (ADR-07) | Có, thế giới dừng |

**[ĐÃ CHỐT]** Demo là **dự án riêng**, game này **chỉ lấy ý tưởng**, không copy code hay kế thừa cấu trúc. Các ý tưởng đáng học (viết lại theo nhu cầu của game này):
- Lõi mô phỏng thuần, tách khỏi UI; RNG theo seed nhiều luồng; digest chuẩn hóa để kiểm tra tái lập; snapshot; kiểm tra bất biến; luật lint cấm `Math.random` trong domain; CLI chạy không giao diện để cân bằng hàng loạt.
- Event log tách khỏi snapshot; lệnh có `commandId` chống áp dụng trùng; hành động có lịch, chi phí chỉ trừ một lần.
- Kinh tế đóng có sổ cái (không tạo tài nguyên từ hư không); Sử ký sinh từ sự kiện thật; NPC chỉ phản ứng với tin đã biết.
- Utility AI với hysteresis chống đổi mục tiêu liên tục.
- Bài học quy trình: có ADR cho mỗi quyết định kiến trúc lớn, và nghiệm thu theo test chạy được.

Mọi thứ khác (thế lực tông môn làm trung tâm, tick ngày, 20 NPC, cảnh giới đến Kim Đan) **không** mang sang.

### 10.2 Repo map-gen *(đã thay thế bằng Cartographer, xem 10.6)*

PoC sinh bản đồ 128×128 theo seed, phong cách thủy mặc: địa hình simplex noise, thủy văn (priority-flood, D8, hồ có một cửa ra), sống núi, núi dạng stamp, render PixiJS 8 nhiều lớp, golden hash cho 20 seed, test và benchmark. Chưa có làng, chunk streaming hay gameplay.

**[ĐÃ CHỐT]** Map-gen là **nguồn bản đồ duy nhất** của game (địa hình và hình thức vẽ). Địa hình hex của demo không dùng.
- Từ dữ liệu map-gen sinh ra, game suy ra **lớp logic** cho mô phỏng: vùng, địa danh, đường đi, khoảng cách, độ phì nhiêu, nguy hiểm (mục 3.2 D). Lớp vẽ chỉ đọc, không quyết định logic.
- **Rủi ro:** map-gen dùng noise số thực, một số hàm toán học (sin, exp...) có thể cho kết quả lệch nhẹ giữa trình duyệt/máy. **Cách xử lý:** bản đồ sinh ra **một lần cho mỗi đời và được lưu vào file save**; mô phỏng không bao giờ sinh lại bản đồ từ seed khi tải. Nhờ đó tái lập mô phỏng không phụ thuộc độ chính xác số thực. Golden hash của map-gen vẫn dùng để bắt lỗi sinh bản đồ.
- **Việc cần làm:** thêm vào map-gen các tầng chưa có (địa danh, đường đi, vùng) và xuất ra cấu trúc dữ liệu logic (mục 9, bước 4).

### 10.3 Quyết định đã chốt

1. Demo là dự án riêng, chỉ lấy ý tưởng (10.1).
2. Tick: phân tích ở 10.4 (đề xuất tick tuần).
3. Bản đồ: dùng map-gen làm nguồn duy nhất, lưu bản đồ vào save (10.2).
4. Gộp mọi thứ vào **một monorepo mới** (10.5).

### 10.4 Phân tích tick: ngày, tuần, tháng

| Tiêu chí | Ngày (1) | **Tuần = 10 ngày (36/năm)** | Tháng (12/năm) |
|---|---|---|---|
| Số tick một đời 60 năm | ~21.600 | ~2.160 | ~720 |
| Hợp với phàm nhân | Phần lớn ngày không có gì xảy ra, gây nhiễu | Đủ mịn cho chuyến đi, bệnh, sự kiện | Hơi thô: đi một chuyến gần cũng tốn cả tháng |
| Hợp với ô hành động (3 ô/tháng) | Phải gộp ngày thành ô, thêm một lớp | **Một ô = một tick, khớp tự nhiên** | Phải tách ô trong tick, thêm sắp xếp thứ tự |
| Di chuyển (khoảng cách tính bằng ngày) | Chính xác nhưng thừa | Làm tròn tới tuần, chấp nhận được | Làm tròn mất ý nghĩa gần xa |
| Ngắt giữa tháng (bị cướp, ốm, gặp cơ duyên) | Có | **Có** | Không, phải giả lập trong tháng |
| Chi phí khi có 150–400 NPC | Cao, cần LOD nặng | Thấp nếu hệ thống chậm chạy theo lịch riêng | Thấp nhất |
| Đột phá, bế quan, mùa vụ | Quá mịn | Khớp (tính theo số tuần) | Khớp |

**Kết luận: tick cơ sở = 1 tuần (10 ngày), 3 tuần = 1 tháng.** Lý do: tuần là đơn vị nhỏ nhất mà người chơi còn thấy khác biệt, trùng hẳn với ô hành động, và giữ được khả năng ngắt giữa tháng, trong khi chi phí mô phỏng chỉ bằng khoảng 1/10 tick ngày.

**Lịch chạy theo tầng (để giữ rẻ):**
- Mỗi tuần: người chơi, NPC trong bán kính gần người chơi, sự kiện, hành động đến hạn.
- Mỗi tháng: NPC xa (mô phỏng rút gọn), kinh tế, bệnh dịch, thu hoạch theo mùa.
- Mỗi quý: chiến lược thế lực, giá lương thực theo mùa.
- Mỗi năm: lão hóa và kiểm tra tử vong của NPC xa, sinh nở, biến động dân số.

**Rủi ro:** tick tuần làm mô phỏng NPC xa dễ bị lệch khi chuyển giữa mức chi tiết cao và thấp. Cần test: một NPC đi qua ranh giới LOD không được đổi kết cục khác biệt có hệ thống so với mô phỏng đầy đủ.

### 10.5 Monorepo mới

Đề xuất cấu trúc (pnpm workspace, TypeScript):

```
truong-sinh-vo-lo/
  packages/
    sim/            lõi mô phỏng thuần (tick, NPC, thế lực, sự kiện, thọ nguyên)
    worldgen/       map-gen đưa vào (sinh bản đồ, xuất dữ liệu logic)
    shared/         kiểu dữ liệu, schema, giao thức worker, save
    content/        sự kiện, nghề, tên, chuỗi văn bản tiếng Việt (khóa–giá trị)
  apps/
    game/           giao diện game (Vite + Preact; bản đồ vẽ bằng renderer của Cartographer, ADR 0006)
    character-tool/ tool tạo nhân vật hiện có, dùng chung logic từ sim
    portrait-studio/ pipeline tạo chân dung (có thể giữ ở dạng app riêng)
  tools/
    headless/       CLI chạy mô phỏng hàng loạt, cân bằng
  docs/             GDD, ADR, nghiên cứu
```

Quy tắc: `sim` và `worldgen` không import React, DOM hay Worker. Mọi quyết định kiến trúc lớn ghi thành ADR trong `docs/`.

### 10.6 Chuyển sang Cartographer (thay quyết định ở 10.2)

**[ĐÃ CHỐT]** Bỏ map-gen khỏi monorepo, dùng [Jannchie/cartographer](https://github.com/Jannchie/cartographer) (MIT).

- **Cách lấy:** bản chụp, không phụ thuộc trực tiếp. Commit `e8c8db8919abe6a074e4d72e2f431e46bf93f2d1`. Phần sinh dữ liệu (`src/gen`) ở `packages/worldgen/src/cartographer/`, phần vẽ (renderer atlas) ở `apps/game/src/cartographer/`. Chi tiết và các chỗ đã sửa: `packages/worldgen/src/cartographer/UPSTREAM.md`.
- **Lý do:** có sẵn địa hình tectonic và xói mòn, khí hậu, quần xã, sông hồ, quốc gia, quận và văn hóa, đường sá, tên Trung Hoa, và bản đồ thành thị kiểu Trung Hoa. Lõi sinh chạy không cần giao diện, có `dmath` (fdlibm) nên kết quả không lệch giữa trình duyệt và Node.
- **Đã kiểm chứng:** worldgen tái lập (cùng seed cùng kết quả, có test pin digest), 256×192 sinh khoảng 0,6 giây; renderer kiểu `ink` vẽ được trong `apps/game`.
- **Nhượng bộ đã chấp nhận:** phong cách là cổ địa đồ có đổ bóng địa hình, không phải núi mực kiểu tranh sơn thủy của map-gen.
- **Việc còn lại:**
  1. Tên địa danh mới có zh/en/ja. Cần bước chuyển sang Hán-Việt.
  2. Bản đồ ở quy mô lục địa (6000 km, 23 km/ô). Vùng chơi phải cắt từ một quốc gia hoặc quận, thành thị lấy từ bộ sinh thành thị (`src/settlement`, chưa chụp vào).
  3. Hiện vẽ ra canvas bitmap nên phóng to bị vỡ nét. Cần chuyển sang `AtlasViewer` (ô vector) của Cartographer khi làm bản đồ tương tác.
  4. Lưu bản đồ vào file save như đã chốt ở 10.2 (không sinh lại khi tải).

### 10.7 Khảo sát: cắt vùng chơi từ thế giới Cartographer

**Đã chụp** `src/settlement` (45 file được `generateSettlement` dùng, bỏ `render.ts` và `themes.ts`) và `i18n.ts` vào `packages/worldgen`. Sinh một thành thị không cần DOM, kết quả tái lập (trừ `stats.ms`), có test.

**Dữ liệu đo được** (tên đặt kiểu `eastern`, seed `tsvl-01..03`):

| Độ phân giải | Km/ô | Thời gian sinh | Số thành trong thế giới |
|---|---|---|---|
| 256×192 | 23,4 | ~0,6 s | 10 (3 kinh đô) |
| 512×384 | 11,7 | ~1,8 s | 23–24 |
| 1024×768 | 5,9 | ~5,2 s | 48 |

- Thế giới có 4–5 nền văn hóa, nên mỗi seed có ít nhất 1, đôi khi 4 quốc gia kiểu Trung Hoa (`eastern`, chế độ quận huyện) ở 1024×768.
- Một quốc gia rộng 2–3 triệu km², vượt xa vùng chơi. **Quận huyện** trung vị khoảng 6.000 km² (~78×78 km), nhỏ nhất ~1.100 km².
- Chỉ **kinh đô và vài thành lớn** là thật trong dữ liệu (10 thành ở 256×192, 1412 quận nhưng chỉ 10 quận có trị sở là thành). **Làng và thị trấn không có sẵn**, phải tự đặt.
- Thành thị sinh theo yêu cầu: 15.000 dân (kinh đô) mất ~1,3 s và ~3.600 nhà; 2.000–5.000 dân mất 0,2–0,5 s.

**Cách cắt đề xuất:**
1. Chọn quốc gia `eastern`, lấy **kinh đô** làm tâm.
2. Vùng chơi là **hợp các quận** có trị sở (hoặc trọng tâm) trong bán kính khoảng **150 km**. Ở mọi seed đã thử vùng này gồm 12–25 quận, 35.000–67.000 km² đất liền, **1 thành** (kinh đô). Dùng quận thay vì hình tròn để biên giới theo đúng ranh hành chính.
3. Dùng **1024×768 (5,9 km/ô)**: vùng chơi có hơn 1.000 ô đất; ở 512×384 chỉ khoảng 250–400 ô nên quá thô. Sinh một lần khi bắt đầu đời và lưu vào save (~5 s trong worker).
4. Cắt sông và đường (`world.roads`, `world.rivers`) theo mặt nạ vùng.
5. **Đặt làng và thị trấn:** tạo nhãn tổng hợp tại trị sở các quận (đặt tên bằng `Namer` của Cartographer, chuyển Hán-Việt sau). Truyền cho `fromWorld` để suy ra tham số, rồi `generateSettlement` khi người chơi tới nơi (sinh lười, không sinh trước).
6. Mỗi quận là một nút của đồ thị đường đi; khoảng cách tính bằng km từ `kmPerCell`.

**Rủi ro:**
- Sinh cả thế giới (5 s) chỉ để dùng một vùng 150 km. Chấp nhận được vì chỉ làm một lần, nhưng nếu muốn nhanh hơn thì phải sửa upstream.
- Tên làng/thị trấn tự tạo cần chất lượng ngang tên của Cartographer, chưa kiểm tra.
- Số lượng và kích cỡ thị trấn tự đặt chưa có luật, phải chọn theo dân số mô phỏng (mục 3.2 G).
