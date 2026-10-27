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

## Ghi chú triển khai S1 (2026-10-27)
- **Chưa bật ra riêng trong đời thật.** Nguồn lương thực (chợ S2, thu hoạch S3, lương S4) chưa có; bật ra riêng lúc 16 tuổi bây giờ thì mọi đời chết đói ở 16–18 tuổi. Tới khi có nguồn thu, người chơi tạm ở nhà cha mẹ nuôi (đúng một nhánh của sự kiện lập thân). `becomeIndependent` đã có và có test; sẽ nối vào đời thật khi S3/S4 xong, rồi thành sự kiện có lựa chọn ở S5.
- **Đói kém quận nhà** đọc qua `Life.homeSupply()`, tạm trả `normal` tới S2. Năm thường `feedPhase` không rút RNG, nên đời thật hiện không đổi hành vi (batch 1.000 đời × 5 chiến lược y hệt Bước 0).
- **Số liệu khởi điểm:**
  - Khẩu phần: người lớn 10 thăng/tuần, dưới 12 tuổi 5 thăng.
  - Bỏ đói khi đói kém (ppm/tuần): `destitute` 300.000 · `commoner` 150.000 · `comfortable` 40.000 · `wealthy` 0 (chỉnh ở S2, xem dưới).
  - Đói nhẹ: hồi sức khỏe còn 50%, hồi thể lực còn 50%, tính như sức khỏe yếu khi xét bệnh.
  - Đói lả: không hồi sức khỏe; mất 30 + 15 × (đói − 4) mỗi tuần; khóa việc nặng (`lock.hunger`, khóa tạm thời).
  - Kiệt: mất 100 + 20 × (đói − 8) mỗi tuần; 25% để lại di chứng 10–30.
  - Kết quả: người khỏe nhịn hẳn chết sau 6–10 tuần (60–100 ngày); ăn nửa khẩu phần thì chết chậm hơn.
- **Nhật ký:**
  - Ghi khi dải đói xấu đi.
  - Trẻ còn ở nhà đói nhẹ chỉ ghi `minor`: không làm gì được nên không ngắt tua. Đói lả trở lên luôn ngắt tua.
  - "Dần lại sức" ghi khi thoát khỏi đói lả, không ghi khi đói nhẹ lên xuống, để tránh ngập nhật ký.
- **Chết vì bệnh khi đang đói nhẹ** dùng khóa nhật ký riêng `log.death.hungry` ("giữa cơn đói"); nguyên nhân vẫn là `illness`.
- **Chưa có:** trường `stayUntil` (thêm ở S5 cùng sự kiện lập thân); tự mua lương khi thiếu (thêm ở S2 cùng chợ).

## Ghi chú triển khai S2 (2026-10-27)
- **Đói kém quận nhà đã nối vào đời thật** (chợ quận, ADR 0012), nên trẻ nhà nghèo có thể chết đói.
- **Lỗi đã sửa:** luật bỏ đói của hộ cha mẹ áp cả cho người lớn còn ở nhà (trạng thái tạm từ S1). Kết quả là người 40–70 tuổi chết đói vì "cha mẹ". Giờ luật chỉ áp cho tuổi dưới 16 (`COMING_OF_AGE`), đúng như ADR.
- **Hiệu chỉnh mức bỏ đói** (chủ dự án chọn 2026-10-27, batch 1.000 đời × 5 chiến lược). Kết quả rất phi tuyến:

  | Mức bỏ đói (bần cùng / bình dân / khá giả) | Chết đói | "lao lực" chết 40–80 |
  |---|---|---|
  | 40 / 20 / 5% | 4,1% | 82,7% |
  | **30 / 15 / 4% (chọn)** | **1,7%** | **84,5%** |
  | 20 / 10 / 2,5% | 0,1% | 86,0% |

  - Lý do chọn mức 30%: chừa chỗ cho chết đói người lớn khi bật ra riêng (Q3: "điều độ" chết đói ≤ 5%), mà nạn đói vẫn có giá thật với nhà nghèo.
- **Tiêu chí batch:** mỗi chiến lược ≥ 80% chết 40–80 tuổi, theo mục 6 v0.3, thay cho mức 85% của v0.2. Bộ tiêu chí đầy đủ của Q3 thêm ở S7 (xem ghi chú S7).

## Ghi chú triển khai S7 (2026-10-27)

- **Bật lập thân trong đời thật** (`COMING_OF_AGE_LIVE = true`, G2). Mười sáu tuổi, chưa ra riêng thì gặp sự kiện lập thân, một lần trong đời: ở lại tới hai mươi / lên trấn (chỉ người có chí lớn, khéo xoay xở) / ra riêng.
- **Chiến lược batch có kinh tế** (`tools/headless/src/policies.ts`), chỉ đọc view và chợ đang đứng:
  - **Mua bán đầu tháng** bằng lệnh TRADE:
    - kho dưới một năm ăn (360 thăng) thì mua cho đủ, trừ khi chợ đói kém;
    - kho quá hai năm ăn thì bán phần thừa;
    - luôn giữ 300 văn để nộp thuế đinh và trả thầy thuốc.
  - **Ruộng chỉ cho ăn lúc gặt:** kho không đủ ăn tới mùa gặt thì một ô săn hay hái lượm; túng hẳn (dưới mười hai tuần ăn) thì cả hai ô. Mùa đông ruộng nghỉ thì đi săn.
  - **Yếu (sức khỏe dưới 50%):** có bệnh và còn của thì chữa; hết của thì vẫn làm một ô kiếm ăn.
  - **Học giả, kẻ ngao du:** chỉ học, chỉ đi khi đã dành được hai năm ăn và chưa tới 45 tuổi; sau đó dành dụm như người điều độ.
  - **Gặp sự kiện** (`policyChoose`): chọn lựa chọn đang mở có giá nhẹ nhất theo hoàn cảnh. Thứ đang thiếu thì đắt: thiếu lương không bán lương, thiếu tiền không tiêu tiền, yếu thì tránh lựa chọn tốn máu. "Lười" vẫn đi lối ra.
- **Lỗi chiến lược tìm ra khi đo** (đều là lỗi người chơi máy, không phải luật):
  - Dân trấn có hàng nghìn văn vẫn chết đói, vì năm đói kém chợ hết lương. Sửa bằng cách giữ kho một năm ăn.
  - Bán hết lương cho lái lúa, rồi đói. Sửa bằng cách tính giá lựa chọn theo hoàn cảnh.
  - Sức khỏe dưới 50% thì tiêu hết tiền chữa rồi nằm nghỉ cả tháng tới chết đói. Sửa: chỉ chữa khi còn của, vẫn làm một ô kiếm ăn.
  - Học giả tiêu hết vào học, về già không làm nổi thì đói. Sửa bằng ngưỡng hai năm ăn và tuổi 45.
- **Tiêu chí batch (mục 6, Q3)** viết thành `batchCriteria`:
  - Mọi chiến lược: không kẹt; bần cùng sống ngắn hơn giàu ít nhất 5 năm.
  - Điều độ: ít nhất 80% chết trong 40–80 tuổi; chết đói không quá 5%.
  - Lười: chết đói ít nhất 40%; sống ngắn hơn điều độ ít nhất 10 năm.
  - Lao lực: sống ngắn hơn điều độ.
  - Sự kiện (gộp mọi chiến lược trừ "lười"): 2–4 mỗi năm sau 12 tuổi, mọi sự kiện xảy ra ít nhất một lần.
  - Bỏ hai tiêu chí cũ: "mỗi chiến lược ≥ 80% chết 40–80" (từ S2, khi chưa ra riêng) và "điều độ chết già ≥ 30%" (v0.2).
- **Kết quả** (`pnpm sim batch --seeds 1000 --policy all`, PASS):

  | Chiến lược | Tuổi TB | 40–80 | Chết đói | Bần cùng / giàu |
  |---|---|---|---|---|
  | lười | 17,9 | 3,0% | 94,5% | 15,3 / 65,6 |
  | điều độ | 59,7 | 86,4% | 2,6% | 54,2 / 64,3 |
  | lao lực | 56,8 | 85,4% | 1,5% | 51,4 / 59,4 |
  | học giả | 57,8 | 83,8% | 35,1% | 49,8 / 61,9 |
  | ngao du | 47,9 | 62,4% | 43,5% | 23,8 / 64,9 |

  - Sự kiện: 2,39 mỗi năm sau 12 tuổi; đủ 29 loại.
  - Người giàu chỉ có 37 đời mỗi chiến lược (ít người sinh ra giàu), nên số của họ dao động nhiều hơn.
- **Không đổi số liệu kinh tế nào** (ADR 0012 giữ nguyên). Đã thử hai phương án, chỉ để so sánh rồi bỏ:
  - lương làm thuê 90 văn;
  - cho làm mướn ở làng.

  Lương 90 văn đưa chết đói của học giả từ 35% xuống 14%; bần cùng điều độ gần như không đổi (7% → 6%). Mục 6 không đòi hỏi các mức này.
  Ghi lại để cân nhắc khi có NPC và gia đình (v0.4–v0.5).
- **Hệ quả cho người chơi:** không xếp kế hoạch thì sau lập thân sẽ chết đói ở 17–21 tuổi. Đời mẫu trong digest pin chỉ nghỉ nên nay chết đói năm 21 tuổi.

