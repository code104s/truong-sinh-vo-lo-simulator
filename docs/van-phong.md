# Văn phong Trường Sinh Vô Lộ

- **Ngày:** 2026-10-27
- **Trạng thái:** **ĐÃ DUYỆT** (2026-10-27, chủ dự án chọn giọng E; các câu ở mục 5 đã sửa).
- **Phạm vi:** mọi chữ kể chuyện trong `packages/content` — nhật ký, sự kiện, tổng kết.
- **Không áp dụng cho chữ giao diện** (nút, nhãn, thông báo lỗi): chữ giao diện viết rõ và ngắn, không cần chất văn.

## 1. Bài toán
Người chơi đọc chữ của game theo bốn cách khác nhau. Một giọng duy nhất không phục vụ tốt cả bốn.

| Lớp | Đọc thế nào | Bao nhiêu |
|---|---|---|
| Biên niên (nhật ký) | lướt, hàng trăm dòng mỗi đời | rất nhiều |
| Sự kiện (lời kể, lựa chọn, kết quả) | dừng lại, đọc kỹ rồi quyết | 2–4 lần một năm (v0.3) |
| Tổng kết đời, mốc đời | đọc một lần, cuối đời | ít |
| Cửa ngõ tu tiên (v0.8 trở đi) | hiếm, phải thấy là "khác" | rất ít |

Thể loại kéo về hai phía:
- **Tu tiên tiếng Việt:** người đọc quen văn dịch Trung, dày Hán-Việt, đại từ "hắn, nàng, lão", sáo ngữ kiểu "trong mắt hiện lên một tia…".
- **Mô phỏng đời phàm nhân:** GDD đòi "ngôn ngữ văn chương ngắn" (3.2 N) về đói, nghèo, bệnh, đồng áng. Chất liệu ấy gần văn xuôi làng quê Việt hơn.

## 2. Các giọng đã xét

| Giọng | Mẫu | Được | Mất |
|---|---|---|---|
| A. Sử ký (biên niên khô) | "Năm ấy hạn, dân đói." | Hợp màn Biên niên, gọn nhất | Lạnh; 30 sự kiện viết vậy thì đọc như sổ thuế |
| B. Văn dịch tiên hiệp | "Hắn ngẩng đầu, trong mắt hiện lên một tia kinh ngạc." | Nhận ra ngay thể loại | Sáo, nặng Hán-Việt sai chỗ, kéo phàm nhân thành nhân vật chính (phá trụ cột 4) |
| C. Cổ văn chương hồi | "Lúc bấy giờ, thôn Phố Kỳ gặp năm đại hạn…" | Trang trọng, có chất cổ | Khó giữ đều qua hàng nghìn câu; người chơi trẻ thấy xa |
| D. Văn xuôi làng quê hiện đại | "Lúa cuốn lá, ngả màu rơm." | Cụ thể, thấm, đọc nhanh | Một mình nó thì mất chất tu tiên |
| **E. Biên niên thôn dã, cổ phong tăng dần** | gốc D, khung A, Hán-Việt đặt đúng chỗ, càng gần tu tiên càng cổ | Giữ được cả hai phía, lại dùng chính độ "cổ" của chữ để báo người chơi đang tới gần thế giới khác | Phải giữ kỷ luật dùng từ (mục 4) |

## 3. Chọn: giọng E — "biên niên thôn dã, cổ phong tăng dần"
- **Nền** là văn xuôi làng quê thuần Việt: câu ngắn, động từ cụ thể, một chi tiết giác quan.
- **Khung** là biên niên: chủ ngữ ẩn, kể việc đã xảy ra, không bình phẩm.
- **Hán-Việt** chỉ dùng cho định chế và khái niệm của thế giới (thuế đinh, quan sai, mãi lộ, Thành hoàng, phúc duyên). Không dùng cho động tác, thân thể, cái ăn.
- **Độ cổ là tín hiệu thế giới.** Chuyện phàm nhân dùng chữ phàm nhân. Chuyện tu tiên, khi phàm nhân kể lại, vẫn dùng chữ phàm nhân: "đạp kiếm bay qua mây", không phải "ngự kiếm phi hành". Chỉ khi người chơi thật sự bước qua cửa (v0.8) thì từ ngữ mới chuyển sang Hán-Việt tu tiên. Người chơi *nghe* được mình đã sang thế giới khác.

## 4. Quy tắc

### 4.1 Chung
1. **Không gọi người chơi**: không "bạn", không "ngươi", không tên nhân vật. Chủ ngữ ẩn ("Gánh nước hai tuần, vai sưng tấy.").
2. **Không bình phẩm đạo đức.** Kết quả nói điều đã xảy ra và điều còn lại ("Nợ thuế vẫn còn đó"), không "thật đáng thương", "quả là sáng suốt".
3. **Không có chữ của giao diện trong lời kể**: không "kế hoạch", "ô", "chỉ số", "điểm". Lời kể nói "hai tuần", không nói "2 ô".
4. **Đơn vị đời xưa:** văn, đấu, mẫu, tuần (mười ngày), tháng Giêng, tháng Chạp, giáp hạt. Không kg, giờ, phút.
5. **Trung tính phương ngữ khi kể:** cha mẹ (không thầy u, tía má), lúa gạo, cái bát. Lời thoại được phép mang chất vùng miền nếu nhân vật có quê rõ.
6. **Thành ngữ dân gian:** tối đa một câu mỗi sự kiện, và phải đúng nghĩa ("nứt chân chim", "chưa ráo mồ hôi", "trầy da tróc vảy").

### 4.2 Đại từ cho người trong chuyện
| Người | Gọi | Ghi chú |
|---|---|---|
| Người không rõ, trung tính | người ấy | mặc định |
| Đàn ông bị coi thường (cướp, thương lái ép giá) | gã | mang thái độ của người kể, dùng có chủ ý |
| Người già | ông lão, bà cụ | |
| Người có chức | quan sai, thầy thuốc, thầy đồ | gọi theo việc |
| **Không dùng** | hắn, y, nàng, lão (đứng một mình) | giọng văn dịch |

### 4.3 Hán-Việt: dùng ở đâu, tránh ở đâu
- **Dùng:** định chế, lễ tục, khái niệm thế giới.
  - Ví dụ: thuế đinh, tô, quan sai, sổ đinh, mãi lộ, Thành hoàng, cầu đảo, phúc duyên, ngộ tính, linh căn (v0.8).
- **Tránh:** khi đã có từ thuần Việt cho động tác, thân thể, đồ ăn, cảm xúc.
  - kinh ngạc → giật mình; phẫn nộ → giận; thực vật → cái ăn; hành tẩu → đi.
- **Không bao giờ dùng** (sáo ngữ văn dịch): "một tia", "khẽ cười", "trong lòng thầm nghĩ", "khóe miệng nhếch lên", "vẻ mặt", "không khỏi".

### 4.4 Theo lớp

| Lớp | Hình thức | Độ dài | Mẫu |
|---|---|---|---|
| Biên niên | câu khẳng định, việc trước, hệ quả sau | ≤ 14 chữ | "Khỏi kiết lỵ, nhưng thân thể không còn như trước." |
| Lời kể sự kiện | dựng cảnh; một chi tiết giác quan; tối đa một câu thoại; câu cuối đặt cái giá trước mặt | 2–3 câu, ≤ 55 chữ | xem mục 5 |
| Lựa chọn | bắt đầu bằng động từ; việc cụ thể; không lộ kết quả; lựa chọn riêng của một tính cách phải nghe ra tính cách ấy | ≤ 10 chữ | "Gánh nước sông tưới cứu ruộng" |
| Kết quả | việc đã xảy ra + cái còn lại | 1–2 câu | "Nộp {money} văn. Bọn chúng đếm tiền, phẩy tay cho qua." |
| Tổng kết, mốc đời | trang trọng hơn, nhiều Hán-Việt hơn một bậc, nhịp chậm (văn bia) | | "Mất năm sáu mươi tư tuổi, vì sốt rét. Một đời ở Phố Kỳ." |
| Cửa ngõ tu tiên (v0.8) | Hán-Việt tu tiên xuất hiện lần đầu; câu dài hơn, nhịp chậm | | để dành |

## 5. Soát lại câu văn đang có trong game

| Khóa | Đang có | Vấn đề | Đề xuất |
|---|---|---|---|
| `log.death` | Qua đời năm {age} tuổi. Nguyên do: {detail}. | "Nguyên do:" là chữ của tờ khai | Mất năm {age} tuổi, vì {detail}. |
| `log.death.hungry` | Qua đời năm {age} tuổi, giữa cơn đói. Nguyên do: {detail}. | như trên | Mất năm {age} tuổi giữa cơn đói, vì {detail}. |
| `log.plan.invalid` | {action}: {reason}. Đành nghỉ ngơi và xem lại kế hoạch. | chữ giao diện trong lời kể (quy tắc 3) | {action} không thành ({reason}), đành nghỉ. *(tên hành động đứng đầu câu vì được điền nguyên dạng viết hoa)* |
| `log.health.worse` | Sức khỏe sa sút: {band}. | dấu hai chấm kiểu bảng | Sức khỏe sa sút, {band}. |
| `log.harvest.own` | Gặt xong, được {net} đấu (nộp tô {rent} đấu, thuế {tax} đấu). | ngoặc đơn kiểu hóa đơn | Gặt được {net} đấu; nộp tô {rent}, thuế {tax}. |
| `log.tax.short` | Không đủ tiền nộp thuế đinh, mới nộp {paid} văn, còn nợ {owed} văn. | dài, lặp "nộp" | Thiếu tiền thuế đinh: nộp {paid} văn, còn nợ {owed}. |
| `event.wandering_physician.result.herbs_ok` | Tự hái lá theo lời thầy dặn, uống vài thang thấy đỡ dần. | đạt | — |
| `event.tax_collector.result.corvee` | Bị bắt đi phu đắp đê hai tuần, đổi lấy món nợ thuế. | đạt | — |

Các câu biên niên khác (đói, gặt, đói kém, bệnh, tai nạn) đã đúng giọng.

## 6. Bảng kiểm khi viết một sự kiện
- [ ] Không gọi người chơi; không tên nhân vật trong lời kể.
- [ ] Lời kể 2–3 câu, có đúng một chi tiết giác quan, câu cuối nói cái giá.
- [ ] Mỗi lựa chọn bắt đầu bằng động từ, ≤ 10 chữ, không lộ kết quả.
- [ ] Kết quả 1–2 câu, có "cái còn lại".
- [ ] Không có từ trong danh sách cấm (mục 4.3), không "hắn, nàng, y".
- [ ] Hán-Việt chỉ ở định chế và khái niệm thế giới.
- [ ] Đọc to một lần: nhịp không vấp, không có câu bị động gượng ("câu chuyện quên đi").
