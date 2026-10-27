# ADR 0013 — Hộ, khẩu phần, đói và nghèo

- Trạng thái: **ĐÃ DUYỆT** (2026-10-27, chủ dự án đồng ý mọi khuyến nghị Q1–Q11 ở `docs/v0.3-giai-doan-a.md`; liên quan Q2, Q3)
- Ngày: 2026-10-27
- Liên quan: GDD 3.2 C, 3.2 F, 3.2 G, 3.2 H, 5 (v0.3, v0.5); ADR 0005, 0008, 0010, 0012

## Bối cảnh
- Đã có sẵn trong `DEATH_CAUSES`: `starvation`, `disaster`. Chưa có đường nào dẫn tới hai nguyên nhân này.
- Gia đình thật (cha mẹ, vợ chồng, con cái là NPC) thuộc v0.4–v0.5. v0.3 cần câu trả lời tạm cho hai câu hỏi:
  - ai nuôi đứa trẻ;
  - túi tiền và kho lương thuộc về ai.
- Xuất thân (`destitute`, `commoner`, `comfortable`, `wealthy`) hiện chỉ đổi thọ nguyên và tần suất bệnh. Nghèo chưa có nghĩa kinh tế.
- Từ 12 tuổi người chơi tự xếp kế hoạch tháng (ADR 0008).

## Phương án
| | A. Lập thân ở 16 tuổi (khuyến nghị) | B. Hộ trừu tượng nhiều miệng ăn |
|---|---|---|
| Cách làm | Dưới 16: sống trong hộ cha mẹ trừu tượng. Ăn theo mức an ninh lương thực của xuất thân và tình hình quận. 16 tuổi: ra riêng với phần chia gia sản theo xuất thân. Hộ chỉ còn người chơi. | Hộ có cha mẹ, anh chị em dạng số đếm (lao động + miệng ăn). Cha mẹ già và chết theo bảng. Người chơi điều khiển cả kho chung. |
| Ưu | Đơn giản, rõ ràng. Không giả lập người sẽ bị thay ở v0.4–v0.5. | Gần "gia đình ràng buộc" (GDD 3.2 H) hơn |
| Nhược | Từ 16 tới v0.5 người chơi sống một mình | Phải làm lại toàn bộ khi có NPC. Dễ thành "NPC giả". |

## Quyết định (phương án A)

### Tuổi thơ và thiếu niên (0–15)
- Cha mẹ là hộ trừu tượng, không phải NPC. Chỉ có hai thông số:
  - mức an ninh lương thực theo xuất thân;
  - tình hình chợ quận nhà (ADR 0012).
- **Năm bình thường:** trẻ được nuôi đủ.
- **Năm quận đói kém** (chợ quận nhà ≤ 1 tháng dự trữ): mỗi tuần, trẻ có xác suất bị bỏ đói một tuần (luồng `economy`). Xác suất theo xuất thân:

  | Xuất thân | Xác suất bỏ đói một tuần |
  |---|---|
  | `destitute` | cao |
  | `commoner` | vừa |
  | `comfortable` | thấp |
  | `wealthy` | 0 |

  Trẻ bị bỏ đói dùng đúng luật đói ở dưới, nên trẻ con nhà nghèo có thể chết đói trong nạn đói.
- **12–15 tuổi:**
  - Làm việc như v0.2. Tiền và lương làm ra vào **túi riêng** của người chơi.
  - Vẫn ăn ở nhà, không tốn khẩu phần riêng.
  - Thuế đinh chưa tính.

### Lập thân (16 tuổi)
- Sự kiện có lựa chọn `event.coming_of_age` (ADR 0014) với hai lựa chọn:
  - **Ra riêng:** nhận phần chia, từ đó tự nuôi mình.
  - **Ở lại làm cho nhà tới 20 tuổi:**
    - Ăn ở nhà.
    - Nộp 50% thu nhập (tiền và lương thực) cho hộ cha mẹ. Phần nộp chuyển vào quỹ quận nhà để bảo toàn tiền.
    - Phần chia khi ra riêng ở tuổi 20 lớn hơn.
- Phần chia khởi điểm theo xuất thân. Số liệu là điểm khởi đầu, chốt bằng batch:

  | Xuất thân | Tiền | Lương thực | Đất | Quyền đất |
  |---|---|---|---|---|
  | `destitute` | 0 | 5 đấu | 0 | tá điền |
  | `commoner` | 300 văn | 20 đấu | 6 mẫu | tự canh |
  | `comfortable` | 2.000 văn | 40 đấu | 15 mẫu | tự canh |
  | `wealthy` | 10.000 văn | 80 đấu | 40 mẫu | cho thuê một phần, thu tô |

- **Nguồn gốc phần chia:** lấy từ quỹ và kho của quận nhà. Không tạo từ hư không; sổ cái ghi lại.
- **Thu tô của nhà `wealthy`:** tô lấy từ sản lượng dân nền của quận. Người chơi không làm vẫn có thu, nhưng thu theo thời tiết; năm mất mùa thì tô cũng ít.

### Khẩu phần và đói (từ khi ra riêng)
- **Ăn hằng tuần** (pha Hậu quả): trừ khẩu phần từ kho của người chơi.
  - Kho thiếu và có tiền: **tự mua phần còn thiếu** ở chợ quận đang đứng, theo giá mua.
  - Chợ cạn hoặc hết tiền: ăn phần còn lại.
  - Cài đặt tự mua mặc định bật. Đây là hành vi sinh tồn, không phải lựa chọn chiến lược. Người muốn tích trữ thì dùng `TRADE`.
- **Bộ đếm đói** `hunger` (số nguyên, ẩn; giao diện chỉ thấy dải mức):

  | Tình trạng tuần | Thay đổi `hunger` |
  |---|---|
  | Ăn đủ | −1, không xuống dưới 0 |
  | Ăn ≥ 50% khẩu phần | +1 |
  | Ăn < 50% khẩu phần | +2 |

- **Dải mức và tác động** (số liệu chốt bằng batch):

  | Dải | `hunger` | Tác động |
  |---|---|---|
  | `fed` (no) | 0 | — |
  | `hungry` (đói) | 1–3 | Hồi thể lực −50%. Ngưỡng bệnh "yếu" của ADR 0005 tính như khi sức khỏe thấp. |
  | `starving` (đói lả) | 4–7 | Mất sức khỏe mỗi tuần, tăng dần. Khóa hành động nặng (`lock.hunger`). |
  | `famished` (kiệt) | ≥ 8 | Mất sức khỏe lớn. Mỗi tuần có thể để lại di chứng. |

- **Ngắt tua:** lần đầu chuyển sang `hungry` và lần đầu sang `starving` là mục nhật ký `major`.
- **Nguyên nhân chết:** chết khi đang `starving` hoặc `famished` ghi là `starvation`. Chết vì bệnh mà bệnh nặng lên do đói vẫn ghi là `illness`, kèm chi tiết "trong cơn đói".
- **Lối thoát của người nghèo** (cái giá thật, không phải ân huệ):
  - hái lượm;
  - làm thuê;
  - bán bớt kho;
  - sự kiện xin ăn, đi phu, vay nặng lãi (ADR 0014).
- **Không có:**
  - cứu trợ tự động;
  - "nhà nước nuôi";
  - hồi sinh.

### Nghèo
- Nghèo được định nghĩa bằng số tuần đủ ăn từ kho và tiền: `weeksOfFood = (grain + money / giá mua) / khẩu phần`.
- Giao diện hiện `weeksOfFood` dạng dải mức, không hiện con số chính xác.
- Nghèo dẫn tới hậu quả qua bốn đường:
  - không trả nổi phí thầy thuốc;
  - không có học phí;
  - không có vốn buôn;
  - không nộp nổi thuế (sinh sự kiện quan sai đòi thuế).

## Hệ quả
- `CharacterState` (hoặc `HouseholdState` riêng trong snapshot) thêm các trường: `money`, `grain`, `landMu`, `tenure`, `hunger`, `independent`, `stayUntil`.
- `CharacterView` thêm `household` (dải mức, không lộ `hunger`). `hunger` vào `HIDDEN_CHARACTER_KEYS`.
- Batch phải chứng minh:
  - "lười" giờ trả giá bằng tuổi thọ (chết đói, hoặc bệnh không chữa được);
  - xuất thân nghèo có phân bố tuổi thọ thấp hơn rõ rệt.
- Mục tiêu cụ thể ở Q3 của tài liệu Giai đoạn A.
- v0.4 thay hộ cha mẹ trừu tượng bằng NPC cha mẹ thật. Phần chia, khẩu phần, luật đói giữ nguyên, dùng chung cho NPC.
- Hoãn:
  - vợ chồng, con cái, nuôi cha mẹ già (v0.5);
  - bạn bè giúp qua cơn đói (v0.5);
  - mua bán đất (v0.7).
