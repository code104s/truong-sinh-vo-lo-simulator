# ADR 0022 — Cửa ngõ tu tiên và Luyện Khí tầng 1

- Trạng thái: **ĐÃ DUYỆT** (2026-10-29, chủ dự án đồng ý mọi khuyến nghị Q1–Q15 ở `docs/v0.8-giai-doan-a.md`).
- Ngày: 2026-10-29
- Liên quan: GDD 1.2, 3.2 A, C, D, E, F, L, L2, M, 5 (v0.8); ADR 0001, 0005, 0014, 0019, 0020

## Bối cảnh
- **GDD 5 (v0.8):** cửa ngõ tu tiên — tiếp xúc, kiểm tra linh căn, hai đường vào (tông môn / tán tu), tu luyện và đột phá lên tầng 1. Tiêu chí: chạm được ngưỡng và vào tầng 1; lựa chọn có trọng lượng; thất bại đột phá có hậu quả.
- **GDD 3.2 A, L, L2:** linh căn ẩn tới khi được kiểm tra; tu tiên không phải con đường "đúng"; tầng 1–3 cho thọ nguyên nhẹ; trần v1.0 là tầng 3.
- **Hiện trạng** (`docs/v0.8-giai-doan-a.md` mục 2):
  - linh căn đã rút lúc sinh cho người chơi và NPC (5% có), ẩn, chưa ai đọc;
  - `lifespanBonus` có sẵn chỗ, luôn 0;
  - chín cờ dấu vết sự kiện (chuyện tiên nhân, hang đá, ẩn sĩ…) đã đặt, chưa ai đọc;
  - bốn loại thế lực tự vận hành theo quý, chưa có tông môn.

## Phương án
| | A. Ngưỡng cửa trong vùng, tông môn tối giản (khuyến nghị) | B. Tông môn đầy đủ trong vùng | C. Chỉ một đường (kỳ tuyển) |
|---|---|---|---|
| Cách làm | Tiếp xúc, kiểm tra, tu luyện diễn ra trong vùng; tông môn ngoài vùng, chỉ có kỳ tuyển và đệ tử ký danh | Sơn môn là một địa điểm trong vùng, tông môn tự vận hành, ngoại môn, nhiệm vụ | Bỏ đường tán tu, chỉ kỳ tuyển |
| Ưu | Vừa phạm vi v0.8; đệ tử vẫn sống trong vùng nên quan hệ, nghề, kinh tế giữ nguyên; v0.9 mở rộng tông môn | Gần GDD 3.2 M nhất | Rẻ nhất |
| Nhược | Tông môn còn mỏng tới v0.9 | Là phạm vi v0.9 (P2); kéo theo bản đồ, kinh tế riêng | Trái GDD 5 (hai đường vào) |

## Quyết định: phương án A
- **Trần v0.8 là Luyện Khí tầng 1** (Q1): bước qua ngưỡng = dẫn khí nhập thể = vào tầng 1; tích lũy tới "đỉnh tầng 1", đột phá tầng 2 là v0.9.
- **Linh căn** (Q2): giữ 5% (người chơi và NPC) làm khởi điểm; mục tiêu đo bằng batch "tìm đạo".
- **Tiếp xúc** (Q3): hành động "tìm cơ duyên" ở quận có núi, nơi có miếu; di tích, miếu suy từ bản đồ; các cờ dấu vết cũ tăng cơ hội; tu sĩ lưu lạc là người qua đường trong sự kiện.
- **Kiểm tra linh căn** (Q4): đá thử ở di tích, tu sĩ chỉ điểm, kỳ tuyển; trả dải `none / mixed / fair / good`, biết một lần nhớ cả đời.
- **Tông môn** (Q5): một tông môn ngoài vùng (thế lực loại `sect`); kỳ tuyển mỗi 3 năm ở thành, kiểm cả trẻ NPC (đỗ thì rời vùng); người chơi đỗ thành đệ tử ký danh, ở lại vùng tự tu, nhận cấp phát, làm nghĩa vụ hằng năm.
- **Tán tu** (Q6): công pháp thô (cần biết chữ) hay tu sĩ chỉ điểm; tu bằng 60% tông môn, đột phá rủi ro hơn, không ràng buộc.
- **Tu luyện** (Q7): hành động "tu luyện"; linh khí mỗi ô theo linh căn, ngộ tính, công pháp, linh khí nơi ở, linh thạch.
- **Đột phá** (Q8): một ô, một lần rút; tâm cảnh là dải tính từ trạng thái sẵn có; thất bại có hậu quả (thương kinh mạch, mất linh khí, tâm cảnh tụt; nặng thì giảm thọ).
- **Tầng 1** (Q9): thọ +5 năm, sức khỏe tối đa +10%, ít bệnh vặt, thể lực hồi nhanh; một thuật tiện ích.
- **Giá với phàm giới** (Q10): tu luyện chiếm ô kiếm ăn; quan hệ phai nhanh hơn; ám ảnh khi không bước qua.
- **Tài nguyên tu luyện** (Q11): chưa có chợ; chỉ từ tông môn, cơ duyên; không vào sổ cái tiền.
- **Nợ `world` v0.7** (Q12): làm ở S7, có giới hạn, trình trước khi đổi tiêu chí hay luật.
- **Hoãn** quy mô thế giới nấc 2 (Q13) và nghề thầy đồ (Q14).
- **Phiên bản** (Q15): `PROTOCOL_VERSION` 8, `SAVE_VERSION` 8, `SIM_VERSION` 0.8.0; save v0.7 bị từ chối.

## Hệ quả
- Người chơi và NPC có cùng linh căn, cùng kỳ tuyển; NPC đỗ rời vùng (dân số giảm nhẹ, đo trong `world`).
- Hành động mới tranh ô với kiếm ăn: cân bằng sáu chiến lược cũ không đổi vì họ không tìm đạo.
- Tài nguyên tu luyện là một "tiền" thứ hai ngoài sổ cái; v0.9 thêm chợ thì phải nối hai kinh tế qua chợ riêng, không qua quỹ quận.

## Ghi chú thực hiện

### Bước 0 (2026-10-29)
- **Hợp đồng v8** (ADR 0001): `cultivation.ts` (cảnh giới, dải linh căn, đường vào, dải linh khí, một đời tu), `CharacterView.cultivation`, `LifeSummary.legacy.cultivation`, thế lực loại `sect`; `PROTOCOL_VERSION` 8, `SAVE_VERSION` 8, `SIM_VERSION` 0.8.0.
- **Sim** (`life/cultivation.ts`): snapshot thêm đường tu (người phàm, chưa kiểm); phép chiếu ra view, tổng kết; `QI_PEAK` tầng 1 đặt tạm 10.000 (chốt ở S5); `qiPlacePct` — linh khí nơi ở theo bản đồ: quận có đường núi 120%, làng 100%, trấn 90%, thành 80% (di tích 150% thêm ở S1). Không đổi luật: chưa ai đọc linh căn.
- **Giao diện:** bảng loại thế lực thêm tông môn (triện 宗, không tô quận vì tông môn không giữ đất trong vùng). Nội dung: cảnh giới, dải linh căn, đường vào, dải linh khí, tông môn.
- **Đo nền** (cùng máy, sau khi đóng v0.7):
  - `world` 10 seed × 100 năm: trùng hệt v0.7 từng dòng (FAIL như cũ: cướp sau đói kém 1,3 lần — nợ v0.7); 202,8 µs/tick;
  - batch sáu chiến lược 1.000 đời: PASS, kết quả trùng hệt v0.7 (`v0.7-balance.json`, bỏ trường thời gian); thời gian 42–125 s, cao hơn lúc đóng v0.7;
  - đo xen kẽ chiến lược điều độ với v0.7 (git worktree ở `9759453`): v0.7 108,9 / 103,9 s, v0.8 106,3 / 106,9 s — **bằng nhau**; máy hôm nay chậm hơn lúc đóng v0.7 (99,6 s), không phải do Bước 0;
  - batch theo nghề 500 đời: PASS, kết quả trùng hệt v0.7 (`v0.7-paths.json`); 57–71 s mỗi nghề (≤ 90 s);
  - +1 năm trên production (Chrome headless 1920×1080, 5 lượt × 57 lần): p95 20,3–22,8 ms (đóng v0.7: 32,9–38,8 ms; khác vì tải máy, Bước 0 không làm nhanh hơn).
- **Test:** 664 (shared 99, worldgen 29, sim 447, headless 8, game 87). Digest pin đổi (SIM 0.8.0, snapshot thêm đường tu); tuổi, nguyên nhân chết ba đời mẫu giữ.
- Sửa kèm: fixture `legacy` trong `apps/game/tests/state.test.ts` có trường thừa `hauls` (do lệnh thay chuỗi ở F3b v0.7).

### S1 — tiếp xúc (2026-10-29)
- **Chốn trên bản đồ** (`life/cultivation.ts`), suy từ bản đồ có sẵn bằng băm số hiệu quận trong thế giới (không rút RNG, không lưu):
  - **di tích** (hang đá cũ) ở một nửa số quận có đường núi, ít nhất một nếu vùng có núi; linh khí nơi ấy 150%;
  - **miếu** ở một phần ba số làng, trấn, ít nhất một; một quận có thể có cả hai.
- **Tìm cơ duyên** (`action.seek`, nhóm hành động mới `seek` — hợp đồng v8 thêm vào `ACTION_GROUPS`):
  - chỉ ở quận có đường núi (vào núi sâu) hay có miếu (thăm miếu); nơi khác khóa `lock.no_seek_place`;
  - một ô, thể lực cao (200), không ra tiền, lương;
  - núi sâu rủi ro 1.500 ppm mỗi ô (như săn bắn: bị thương, hiếm khi chết); thăm miếu không rủi ro.
- **Năm sự kiện tiếp xúc**, nhóm sự kiện mới `cultivation` ("Đường tiên"); lưu lạc, ẩn dật gặp gấp đôi (`CAREER_EVENT_PCT`):

  | Sự kiện | Khi nào | Để lại |
  |---|---|---|
  | Hang đá trong núi | vào núi ở quận có di tích; biết chỗ hang ×3, có nửa tấm bản đồ ×2 | vào hang: `found_ruin` (có thể bị thương); đánh dấu lối: `knows_cave` |
  | Lạc trong núi | vào núi ở quận có núi | leo nhìn đường: có khi thấy hang (`knows_cave`), có khi ngã; chờ sáng tốn gạo; theo suối mất thêm một tuần |
  | Người lạ đeo kiếm (tu sĩ lưu lạc) | ai cũng có thể gặp (400 ppm/tuần), đang tìm cơ duyên ×25, đã nghe chuyện tiên ×4, lưu lạc quen đường ×3, từng khấn miếu ×2 | mời cơm, hỏi chuyện: `met_cultivator` |
  | Ông từ giữ miếu | thăm miếu; từng khấn miếu ×2 | nghe chuyện hang và kỳ tuyển: `heard_immortal`, `knows_cave`, `heard_trial` |
  | Ông lão dưới gốc tùng | vào núi, đã gặp ẩn sĩ (`met_hermit`, v0.7); từng biếu quà ×2 | hầu trà, hay hỏi khi đã biếu quà: `hermit_stone` |

  - Văn bản ở `content/strings/events.cultivation.vi.ts`, giọng E: người chưa bước qua cửa nên vẫn kể bằng chữ phàm nhân.
- **Ba lối dẫn tới chỗ kiểm linh căn ngoài kỳ tuyển** (`ROOT_TEST_LEADS`, dùng ở S2): đá trong hang (`found_ruin`), tu sĩ lưu lạc (`met_cultivator`), viên đá của ẩn sĩ (`hermit_stone`).
- **Cờ cũ có tác dụng:** `heard_immortal`, `knows_cave`, `half_map`, `met_hermit`, `hermit_gift`, `temple_prayer`, `road_friend` đổi trọng số hay mở lựa chọn (test).
- **Đo** (batch sáu chiến lược 1.000 đời): PASS mọi tiêu chí v0.6. Thay đổi nhỏ vì tu sĩ có thể ghé người thường: điều độ 59,76 → 59,74 tuổi, lang bạt 49,93 → 50,18; cưới trước 30 tuổi 72,4%; 3,00 sự kiện/năm (trước 2,98). Tu sĩ ghé 130–908 lần mỗi 1.000 đời (học giả nhiều nhất vì hay nghe chuyện tiên). Thời gian 103–128 s mỗi chiến lược trên máy đang bận (đo xen kẽ ở S7).
- **Digest pin:** đời mẫu 1 chết đói 50 → 52, đời 3 38 → 42 (thêm một sự kiện vào lượt rút); cùng nguyên nhân.
- Sửa trong lúc làm: quận vừa có di tích vừa có miếu từng bị tính là di tích, ông từ ở đó không bao giờ xuất hiện (test bắt); nay xét từng chốn riêng (`hasSite`).

### S2 — kiểm tra linh căn (2026-10-29)
- **Dải linh căn** (`rootBand`, Q4): độ thuần trừ 15 mỗi hệ thêm; từ 55 là tốt, từ 25 là khá, dưới nữa là tạp; không có linh căn là "không có". Tất định theo linh căn ẩn: kiểm cách nào, bao nhiêu lần cũng ra một dải; biết rồi nhớ cả đời (`testRoot`).
  - Với phân bố linh căn lúc sinh (5% có; số hệ 1–5 theo trọng số 10/20/30/25/15; độ thuần 1–100), trong người có linh căn: tạp 56%, khá 28%, tốt 16% (tính theo công thức; test 20.000 người xác nhận thứ tự). Trên toàn dân: tạp 2,8%, khá 1,4%, tốt 0,8%.
- **Ba lối kiểm** (sự kiện nhóm `cultivation`), mỗi lối nối một dấu vết của S1; phúc duyên 1–10 nhân dịp gặp 60–150%, không đổi kết quả:

  | Sự kiện | Khi nào | Giá |
  |---|---|---|
  | Khối đá trong hang | tìm cơ duyên ở quận có di tích, đã vào hang (`found_ruin`) | một tuần, thể lực |
  | Hẹn lúc trăng tròn | đã gặp tu sĩ lưu lạc (`met_cultivator`), trung tuần | 300 văn, hay làm đỡ việc hai tuần |
  | Viên đá trắng | tìm cơ duyên ở quận có núi, đã nhận viên đá của ẩn sĩ (`hermit_stone`) | một tuần |

  - Kết quả sự kiện là chính dải; văn bản gọi tên "linh căn" lần đầu (người trên núi nói, người chơi nghe lại).
  - Người không có linh căn: cờ ám ảnh `haunted` (Q10), sự kiện ám ảnh ở S6.
- `PlayerState.cultivation` (tùy chọn, chỉ người chơi) để sự kiện đọc, ghi đường tu; NPC để trống.
- **Đo** (batch sáu chiến lược 1.000 đời): PASS mọi tiêu chí v0.6; điều độ 59,68 tuổi, cưới trước 30 tuổi 72,3%, 3,01 sự kiện/năm. Hẹn kiểm linh căn xảy ra 517–863 lần mỗi 1.000 đời người thường (học giả nhiều nhất) — vì tu sĩ lưu lạc (S1, 400 ppm/tuần) ghé quá nửa số đời và người chơi máy chọn trả tiền. Thời gian 50–162 s mỗi chiến lược, tăng cả ở chiến lược lười (không chạm phần mới) — máy bận; đo xen kẽ ở S7.
- **Digest pin:** đời 3 gặp tu sĩ nên được hẹn kiểm (chọn thôi) → digest đổi; tuổi, nguyên nhân giữ.

### S3 — tông môn tối giản (2026-10-30)
- **Tông môn** (`factions/sect.ts`): thế lực loại `sect`, lập ngay sau quan phủ lúc dựng vùng (đời người chơi và `world`), không rút RNG. Sơn môn ngoài vùng: không giữ quận, không có đường; trị sở là nơi sứ giả xuống tuyển (thành, không thì trấn). Tên theo vùng (băm), sáu tên `sect.name.*`, hiển thị "{tên} Tông".
- **Kỳ tuyển** (Q5): năm chia hết cho 3, cả tháng Ba; tháng Giêng năm ấy người chơi nghe tin (`log.sect.rumor`).
  - Đầu tháng Ba sứ giả kiểm **trẻ NPC 8–20 tuổi chưa ra riêng**, cùng luật dải linh căn (S2): khá, tốt thì đỗ; kỳ nào ít hơn 2 người khá, tốt thì nhận cả tạp.
  - Trẻ đỗ **rời vùng**: ra khỏi danh sách người, ra khỏi thế lực; tiền, lương, hàng trong túi về cha mẹ (không còn ai thì về quỹ, kho quận) — sổ cái giữ. Con cháu, anh em người chơi đỗ thì có tin lớn (`log.sect.kin_taken`).
- **Người chơi dự tuyển** (`action.trial`, nhóm "Đường tiên"): một tuần, ở trị sở trong tháng có kỳ tuyển, tới 20 tuổi (người chơi tự xếp việc từ 12); chưa có đường tu.
  - Sứ giả kiểm linh căn (ghi dải như S2). Đỗ thì thành **đệ tử ký danh**: đường tu `sect` (dẫn khí nhập môn, công pháp nhập môn), 3 khối linh thạch.
  - Trượt (tạp khi kỳ đủ người, hay không có linh căn): mang ám ảnh `haunted`.
- **Đệ tử ký danh** ở lại vùng tự tu (S5). Nghĩa vụ mỗi năm: 6 tuần tạp dịch (`action.sect_duty`, ở đâu cũng làm được). Đầu năm xét (năm mới vào không xét):
  - đủ tuần thì thôi; thiếu thì nộp 600 văn thay vào kho tông môn (trong sổ cái);
  - không nộp nổi: ghi một năm bỏ nghĩa vụ; hai năm liền thì **bị gạch tên** (mất cấp phát; đường tu, công pháp giữ);
  - còn tên thì nhận 2 khối linh thạch.
- **Trạng thái:** `CultivationState` thêm `stones` (linh thạch — không phải tiền, ngoài sổ cái, Q11) và `duty` (tuần tạp dịch, năm bỏ, lúc vào; null khi không còn là đệ tử); `FactionState.trial` (kỳ gần nhất). `PlayerState.cultivation` đã có từ S2.
- **Đo:**
  - `world` 30 seed × 100 năm: mọi tiêu chí v0.7 giữ (dân số mỗi quận 75–130%, dưới 16 tuổi 28,0%, đói kém 1 lần/11,0 năm, quỹ cạn 3,0%, sổ cái 0 vùng lệch, gia đình đạt); hai tiêu chí nợ v0.7 vẫn không đạt như trước (gia tộc trong khoảng 94,7%, cướp sau đói kém 1,0 lần). Tông môn đưa 606 trẻ NPC rời vùng trong 30 vùng × 100 năm (20 mỗi vùng). Trẻ sinh có cha mẹ thật 89,4% → 84,5% (≥ 60); NPC nắm tới 41,8% tổng tiền (trước 36,3%).
  - Batch sáu chiến lược 1.000 đời: mọi tiêu chí v0.6 đạt; lần đầu FAIL vì "bị cướp bắt theo" (`event.bandit_seize`) ra 0 lần — chỉ người chơi máy lang bạt gặp, 3–6 lần mỗi 1.000 đời ở v0.7–S2, RNG đổi thì ra 0. Đưa vào danh sách hiếm có ghi chú (đường đi có test riêng).
- **Digest pin:** số hiệu thế lực sau tông môn dịch một; trẻ NPC rời vùng đổi làng: đời 3 chết đói 42 → 44; đời 1, 2 giữ tuổi.
- Chưa có ở S3 (để F1): giao diện chưa hiện linh thạch, nghĩa vụ; `CultivationView` chưa có hai trường ấy.

### S4 — tán tu (2026-10-30)
- **Công pháp thô** (Q6), cờ `crude_manual`, nhớ cả đời; hai lối, cả hai nối dấu vết của S1–S2:

  | Sự kiện | Khi nào | Giá |
  |---|---|---|
  | Cuộn sách trong khe đá (`event.ruin_scroll`) | tìm cơ duyên ở quận có di tích, đã vào hang (`found_ruin`), chưa có đường tu | một ô, thể lực; **đọc cần chữ từ mức "Thạo"** (1.000 điểm), chưa đủ chữ thì chỉ có lối bỏ lại |
  | Xin chỉ đường (`event.cultivator_teach`) | đã gặp tu sĩ lưu lạc, đã được kiểm là có linh căn (dải khác "không có"), trung tuần | 1.500 văn (vào quỹ quận), hay theo làm việc bốn tuần |

- **Tự dẫn khí** (`action.induce`, nhóm "Đường tiên", `life/rogue.ts`): một ô, thể lực 120, không ra tiền.
  - Khóa: chưa có công pháp (`lock.no_manual`), đã có đường tu (`lock.has_path`), đã biết không có linh căn (`lock.no_root`), đang thương kinh mạch (`lock.meridian`, khóa tạm như mệt, đói).
  - Lần đầu cũng là lần biết linh căn (ghi dải như S2). Không có linh căn: mang ám ảnh `haunted`, công pháp thành vô dụng (Q6).
  - Thành công mỗi ô (ppm): tạp 80.000, khá 200.000, tốt 350.000; nhân linh khí nơi ở (Bước 0, S1), ngộ tính (50–150%), chia mệt; trần 800.000. Thành thì đường tu `rogue`: không linh thạch, không nghĩa vụ, tông môn không xét.
  - Hỏng: mất ô; 15% số lần hỏng là **thương kinh mạch** (`illness.meridian`): bệnh nặng 8–16 tuần, tổn hại 10–35 mỗi tuần, khỏi thì luôn để lại di chứng 20–60 (giảm sức khỏe tối đa). Bệnh có trọng số 0 trong bảng bệnh nên không bao giờ đến như bệnh thường (thêm cuối bảng: lượt rút bệnh cũ không đổi).
  - Rút trên luồng `actions` (như chuyến buôn), chỉ khi có người tự dẫn khí: đời không đi đường này không đổi.
- **Cảnh giới**: như đệ tử ký danh ở S3, dẫn khí thành chỉ đặt đường tu; `realm` vẫn `mortal`, `entered` vẫn null. Lúc nào ghi "vào tầng 1" (dẫn khí xong hay đột phá ở đỉnh) chốt ở S5 cho cả hai đường.
- **Công pháp theo đường** (`TECHNIQUE_PCT`): tông môn 100%, tán tu 60% — S5 nhân vào linh khí mỗi ô (Q7).
- **Đo** (test 5.000 người mỗi ô, ngộ tính 1–10, rút tới khi thành, tối đa 108 ô = ba năm toàn ô):

  | Nơi | Tạp | Khá | Tốt |
  |---|---|---|---|
  | Làng (100%) | 12,5 ô; 1,71 lần thương kinh mạch | 5,1 ô; 0,61 lần | 2,9 ô; 0,29 lần |
  | Thành (80%) | 15,6 ô; 2,19 lần | 6,5 ô; 0,83 lần | 3,7 ô; 0,41 lần |
  | Quận có núi | 8,5 ô; 1,13 lần | 3,5 ô; 0,38 lần | 2,0 ô; 0,15 lần |

  - Đệ tử ký danh được dẫn khí ngay khi đỗ, không rủi ro. Mỗi lần thương kinh mạch còn khóa dẫn khí 8–16 tuần, nên thời gian thật dài hơn số ô.
  - Batch sáu chiến lược 1.000 đời (máy cloud 4 lõi): **PASS** mọi tiêu chí v0.6; điều độ 59,57 tuổi (S2: 59,68), cưới trước 30 tuổi 71,9%, 3,01 sự kiện/năm. "Xin chỉ đường" xảy ra 19–35 lần mỗi 1.000 đời người thường (đã trả tiền cho tu sĩ xem linh căn); người chơi máy cũ không xếp tự dẫn khí nên không ai thành tán tu. Thời gian 105–299 s mỗi chiến lược trên máy chậm, không so với ngân sách.
  - So batch "tìm đạo" giữa hai đường là việc của S7 (người chơi máy tìm đạo chưa có).
- **Test:** 705 (shared 99, worldgen 29, sim 483, headless 8, game 87); digest pin không đổi. Bảng sự kiện mẫu (`events.test.ts`) nâng chữ lên 1.000 để mở lối đọc tàn quyển.
