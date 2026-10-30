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

### S5 — tu luyện, đột phá tầng 1 (2026-10-30)
- **Chốt mốc vào tầng 1** (chủ dự án, 2026-10-30): Q1 ghi "dẫn khí nhập thể = vào tầng 1", nhưng GDD 5 đòi v0.8 có "đột phá lên tầng 1" và "thất bại đột phá có hậu quả". Chọn: **dẫn khí xong vẫn là phàm nhân** (đệ tử ký danh S3, tán tu S4), tu tới đỉnh rồi **đột phá thành công mới vào tầng 1** (`entered` là lúc ấy); vào tầng 1 tu tiếp tới đỉnh tầng 1 thì dừng (`lock.realm_cap`, "chưa tới lúc"). Đột phá tầng 2 là v0.9.
- **Tu luyện** (`action.cultivate`, `life/cultivate.ts`): một ô, thể lực 80, không ra tiền, không rút RNG.
  - Linh khí mỗi ô = 120 × dải linh căn (tạp 50, khá 100, tốt 170%) × ngộ tính (50–150%) × công pháp (`TECHNIQUE_PCT`: tông môn 100, tán tu 60) × linh khí nơi ở × linh thạch, chia mệt. Đỉnh 10.000 (`QI_PEAK`, giữ giá trị Bước 0).
  - Linh thạch: còn hơn 3 khối thì mỗi ô đốt một khối, linh khí ×150%; 3 khối cuối giữ cho đột phá.
  - Tu một nửa số ô (18 trong 36 ô một năm), ngộ tính vừa, ở làng — năm tới đỉnh (S6 sửa: S5 tính nhầm một năm 54 ô và đặt gốc 40, khiến khá + tông môn mất gần 14 năm; nay gốc 120):

    | | Tạp | Khá | Tốt |
    |---|---|---|---|
    | Tông môn | 9,3 | **4,6** | 2,7 |
    | Tán tu | 15,4 | 7,7 | 4,6 |

    Linh căn khá ở tông môn trong khoảng 3–6 năm của Q7. Quận có núi 120%, di tích 150% rút ngắn tương ứng; thành 80% kéo dài.
- **Tâm cảnh** (Q8, không thêm chỉ số ẩn): điểm từ tính cách (điềm tĩnh, lạnh nhạt +1; nóng nảy, tham lam, tham vọng −1), đói −1, đang bệnh hay thương −1, tang người thân gần trong năm (cha mẹ, vợ chồng, con, anh em) −1, đột phá hỏng trong năm −3. Ra bốn dải: yên (≥ 1), thường (0), động (−1), loạn (≤ −2). Tâm cảnh loạn thì khóa đột phá (`lock.unsettled`) — hỏng xong phải chờ khoảng một năm.
- **Đột phá** (`action.breakthrough`): một ô, thể lực 150, rút một lần trên luồng `actions`. Chỉ khi linh khí đầy, không thương kinh mạch, tâm cảnh không loạn.
  - Cơ hội = 500.000 ppm; tâm cảnh yên +100.000, động −150.000; mỗi khối linh thạch (tối đa 3, dùng hết dù thành hay hỏng) +50.000; từ 30 tuổi mỗi năm −15.000 (tối đa −300.000); tán tu −80.000; giới hạn 50.000–900.000.
  - Lần đầu hỏng, người 25 tuổi tính thường: đệ tử mang 3 khối linh thạch 35%, không linh thạch 50%; tán tu không linh thạch 58% (test 4.000 lần) — trong khoảng 30–60% của mục 6.
  - **Hỏng:** thương kinh mạch (bệnh của S4, nếu chưa mang bệnh), linh khí còn nửa đỉnh, tâm cảnh loạn một năm; 10% số lần hỏng là **hỏng nặng: tổn thọ 3 năm** (`lifespanBonus`).
  - **Thành:** vào tầng 1, linh khí về 0.
- **Tầng 1 cho gì** (Q9): thọ +5 năm (`lifespanBonus`); nét ẩn `qi_body` (trọng số 0, chỉ đột phá đặt): sức khỏe tối đa +100, bệnh 70%; thể lực hồi 125%. **Chưa có "thuật" tiện ích** — Q9 để chọn ở S5; đề xuất để S6 hay F2 (thân nhẹ đi đường nhanh hơn) nếu chủ dự án muốn.
- **Test:** 719 (sim 496); 12 test mới (`cultivate.test.ts`). Người chơi máy cũ không tu luyện nên lượt rút của batch không đổi.
- **Đo** (batch sáu chiến lược 1.000 đời): **PASS**, kết quả trùng hệt S4 từng dòng (trừ thời gian chạy) — người chơi máy cũ không tu luyện, nét `qi_body` thêm cuối bảng với trọng số 0. Batch "tìm đạo" so hai đường là việc của S7.

### S6 — giá với phàm giới, sự kiện tu tiên (2026-10-30)
- **Sửa S5:** một năm có 36 ô (mỗi tick một ô), không phải 108; S5 lấy 54 ô cho "một nửa số ô" nên đặt linh khí gốc mỗi ô 40, khiến linh căn khá + tông môn mất gần 14 năm tới đỉnh. Nay gốc **120** (`QI_PER_SLOT`): khá + tông môn 84 ô, tu 18 ô mỗi năm thì 4,6 năm. Bảng năm tới đỉnh ở mục S5 giữ nguyên số (đã tính theo tỉ lệ).
- **Quan hệ phai khi ngồi tu nhiều** (Q10): `CultivationState.secluded` đếm ô tu luyện trong năm. Đầu năm, năm qua tu từ 18 ô (một nửa số ô) thì `fadeBonds` chạy thêm một lượt (như người lưu lạc), rồi đếm lại từ 0.
- **11 sự kiện mới nhóm "Đường tiên"** (tổng nhóm 21, toàn bộ **121**). Văn bản ở `events.cultivation.vi.ts`: người đã dẫn khí kể bằng chữ người tu, người ôm ám ảnh kể bằng chữ phàm nhân.

  | Sự kiện | Khi nào | Lựa chọn, giá |
  |---|---|---|
  | Cha mẹ ngoài sân (`parent_far`, người thật) | năm nay đã tu từ 6 ô, cha/mẹ từ 50 tuổi ở cùng quận | ra ở nhà (một ô chăm người, gần lại); gửi 200 văn; ngồi lại (nhạt đi) |
  | Bữa cơm một người (`spouse_cold`, người thật) | như trên, vợ/chồng ở cùng quận | nói chuyện cả buổi; hứa bớt ngồi tu (mất 300 linh khí); im lặng (nhạt, thêm hiềm) |
  | Viên thuốc tiên (`fake_elixir`) | mang ám ảnh, chưa có đường tu | mua 800 văn (vào quỹ quận, không được gì); **buông** (bỏ ám ảnh); đi qua |
  | Giấc mơ trên núi (`haunted_dream`) | như trên | bỏ việc lên núi một tháng (có thể ngã); **buông**; thức tới sáng (mệt) |
  | Người kể chuyện ở chợ (`immortal_rumor`) | ở trấn, thành, chưa nghe chuyện tiên | trả 10 văn (nghe chuyện tiên, kỳ tuyển); đứng nghe (chuyện tiên); đi qua |
  | Đồng đạo (`fellow_cultivator`) | đã dẫn khí, đang tìm cơ duyên hay ngồi tu | đàm đạo (thể lực, +400 linh khí); chia gạo; chào rồi đi |
  | Kẻ chặn đường (`cultivator_robber`) | đã dẫn khí, có linh thạch, ở núi hay đang tìm cơ duyên | đưa hết linh thạch; chạy (40% bị đuổi kịp: thương, mất một khối); van xin (mất một khối, sức khỏe) |
  | Khí nghịch (`qi_deviation`) | đang ngồi tu; tâm cảnh động ×10, loạn ×25 | dừng (−500 linh khí); cố (50% thương kinh mạch, −1.000; không thì +300); nghỉ một tuần (−200) |
  | Chợt hiểu (`cultivation_insight`) | đang ngồi tu, theo ngộ tính | ngồi tiếp một tuần (+800); ghi lại (+200); đứng dậy |
  | Tin từ trên núi (`sect_errand`) | đệ tử còn tên | đi hái thuốc hai tuần (tính 2 tuần tạp dịch); nộp 300 văn vào kho tông môn (1 tuần); hẹn lần sau |
  | Sư huynh xuống núi (`sect_senior`) | đệ tử tông môn còn tên | biếu một khối linh thạch (+600); xin chỉ điểm (+200); tiễn ra cửa |

  - **Ám ảnh có thể buông** (Q10): lựa chọn "buông" bỏ cờ `haunted`, đặt `let_go`; sự kiện ám ảnh không đến nữa. Không trừ chỉ số vô cớ: giá của ám ảnh là tiền, thời gian người chơi tự chọn bỏ ra.
  - Linh thạch không đổi ra tiền ở mọi lựa chọn (Q11).
- **Chưa làm:** "thuật" tiện ích tầng 1 (Q9) — để chủ dự án quyết ở S7 hay F2.
- **Test:** 727 (sim 504); 8 test mới (`seclusion.test.ts`). Bảng sự kiện mẫu (`events.test.ts`) thêm đường tu (đệ tử có linh thạch, đang tích linh khí) để mở lựa chọn; danh sách sự kiện gọi người thật 36 → 38.
- **Đo** (batch sáu chiến lược 1.000 đời): **PASS** mọi tiêu chí v0.6; điều độ 59,61 tuổi (S5: 59,57), cưới trước 30 tuổi 71,9%, 3,04 sự kiện/năm (S5: 3,01). Sự kiện ám ảnh gặp nhiều ở người chơi máy thường vì phần lớn đã trả tiền cho tu sĩ xem rồi biết mình không có linh căn (S2): thuốc tiên giả 313–1.462, giấc mơ 367–1.329 lần mỗi 1.000 đời (học giả nhiều nhất); người kể chuyện 51–219. Tám sự kiện đời tu chưa xảy ra vì người chơi máy cũ không dẫn khí — đo ở S7 với người chơi máy tìm đạo.
- **Digest pin:** snapshot thêm `secluded` → digest đổi; đời mẫu 3 (đã mang ám ảnh từ S2) gặp giấc mơ trên núi, chọn lựa chọn đầu (bỏ việc một tháng) → chết đói 44 → 41. Cùng nguyên nhân.

### S7 — người chơi máy tìm đạo, cân bằng, đo (2026-10-30)
- **Người chơi máy tìm đạo** (`tools/headless/src/seekers.ts`, `pnpm sim batch --policy seekers` chạy kèm người điều độ để so). Chỉ đọc view và khóa sim công bố, sống còn trước như các chiến lược khác:
  - `seeker_sect`: năm tuyển (chia hết cho 3) từ tháng Giêng lên trị sở, tháng Ba dự tuyển, tới 20 tuổi; biết mình không có linh căn thì thôi; ngoài mùa tuyển về nhà;
  - `seeker_rogue`: từ 15 tới 45 tuổi; nhà ở nơi tìm được (núi, miếu) thì tháng nào cũng tìm cơ duyên, không thì mỗi năm một chuyến lúc nông nhàn (tháng 10–12) lên một quận núi (vùng không núi thì tìm miếu ở làng, trấn khác); có công pháp thô thì tự dẫn khí;
  - đã có đường tu: đủ ăn một năm thì tu hai ô mỗi tháng, chưa đủ thì một ô; đệ tử làm tạp dịch một ô mỗi tháng từ tháng 6; đủ đỉnh thì đột phá, tâm cảnh bất an thì chờ;
  - chuyện cơ duyên (vào hang, đãi tu sĩ, cúng miếu, chạm đá, xin chỉ điểm) chọn lựa chọn đầu đang mở; chuyện khác như người điều độ.
- **Số đo đường tu trong mọi batch** (`CultResult`, `CultStats`): dải linh căn thật (đo, người chơi máy không thấy), dải đã biết, đường vào, tuổi vào tầng 1, các lần đột phá, chết sớm vì hậu quả đột phá (chết vì thương kinh mạch, chết trong một năm sau lần hỏng, hay chết già sau lần hỏng nặng — thọ đã bị cắt ba năm). Batch sáu chiến lược thêm tiêu chí: mỗi chiến lược vào tầng 1 dưới 0,5% đời.
- **Đọc tiêu chí mục 6:**
  - "30–60% đời có linh căn vào tầng 1" tính **gộp hai đường**; từng đường in riêng, tông môn phải cao hơn tán tu, cả hai phải có người;
  - "khác người điều độ ít nhất hai mặt" so các đời **đã vào đường tu** (đời chưa bước vào sống như người thường; phần ấy đo ở "đời không linh căn sống kém hơn");
  - "thọ hơn trung bình không quá 8 năm" so với **người điều độ cùng tuổi**: trung bình tuổi lúc mất của đời điều độ đã sống tới đúng tuổi người ấy vào tầng 1 (người tầng 1 đã qua được tuổi trẻ, so với cả thảy thì lệch vì chọn mẫu).
- **Ba lượt cân bằng** (Q2: chỉnh tốc độ tu luyện, tỉ lệ đột phá trước; tỉ lệ linh căn đổi theo ADR 0023):

  | Lượt | Thay đổi | Tông môn | Tán tu | Lần đầu hỏng |
  |---|---|---|---|---|
  | 1 | (luật S6, 5% linh căn) | 83% | 19,5% | 60% |
  | 2 | linh căn tạp tu 50 → 20%; bot tán tu tìm miếu ở vùng không núi | 61% | 17% | 56% |
  | 3 | linh căn 15% (ADR 0023); tán tu đột phá −8 → −3%; thân thể tầng 1 bệnh 70 → 85% | 53% | 23% | 49% |

  Lượt 1 cho thấy đệ tử vào sổ từ 13 tuổi gần như chắc tới tầng 1 (có cả đời để thử lại), còn tán tu kẹt ở ba chỗ: vùng không núi thì bot không đi tìm, linh căn tạp tu bằng 60% của 50% thì hai mươi năm mới tới đỉnh, đột phá không linh thạch lại muộn tuổi thì 9/10 lần đầu hỏng.
- **Sửa lỗi S5:** sức khỏe tối đa cộng nét `qi_body` (+100) không có trần, người trẻ vào tầng 1 có sức khỏe 1.100 và save bị validate từ chối. `computeHealthMax` nay giữ trần 1.000 sau khi cộng nét; thân thể tầng 1 giữ sức hơn người thường khi về già. Có test hồi quy (`cultivate.test.ts`).
- **Đo cuối** (máy cloud 4 lõi, sau mọi thay đổi):
  - batch tìm đạo 1.000 đời: **PASS**. Đời có linh căn 145; vào tầng 1 gộp 38,3% (tông môn 77/145 = 53,1%, tán tu 34/145 = 23,4%). Đột phá 158 đời, lần đầu hỏng 49,4%, chết sớm vì hậu quả 3 đời (1,9%). Người tầng 1 70,5 tuổi, người điều độ cùng tuổi 63,7 (+6,8 năm); của cải trung vị cao nhất 36.529 văn (điều độ 32.291). Đời đã vào đường tu khác người điều độ ba mặt (tuổi thọ, nguyên nhân chết, của cải); kỹ năng chính vẫn là nông, sự kiện tu tiên 11–15%. Đời không linh căn: tìm đạo 59,3–59,6 tuổi, 30.987–31.660 văn; điều độ 59,4 tuổi, 32.890 văn. Sự kiện 3,35/năm sau 12 tuổi;
  - mọi sự kiện tu tiên xảy ra trừ ba sự kiện hiếm (`RARE_SEEKER_EVENTS`): gặp lại ẩn sĩ, viên đá ẩn sĩ (cần đã gặp ẩn sĩ khi ẩn dật — nghề v0.7) và vợ/chồng lạnh nhạt (người chơi máy tìm đạo ít khi cưới). Đường đi của cả ba có test riêng;
  - batch sáu chiến lược 1.000 đời: không ai vào tầng 1; mọi tiêu chí v0.6 đạt **trừ** "gia đình cưới trước 30 tuổi" 69,4% (2.000 đời: 69,1%; cần 70%). Cùng code mà linh căn 5% thì 71,9%: nguyên nhân là nhiều thanh niên NPC đỗ kỳ tuyển rời vùng hơn (ADR 0023). Chủ dự án duyệt hạ tiêu chí còn **65%** (2026-10-30); đo lại 1.000 đời: 69,4%, **PASS**;
  - batch nghề 500 đời (cỡ nghiệm thu v0.7): **PASS**; 1.000 đời thì farmer – soldier, merchant – soldier chỉ khác một mặt (tiêu chí v0.7 đo ở 500 đời);
  - thế giới 30 seed × 100 năm: dân số mỗi quận 75–130% hạn mức; trượt đúng hai nợ v0.7 (gia tộc 2–10 ở 95% vùng-năm, cướp sau đói kém gấp 1,0 lần).
- **Hiệu năng:** trung bình 397 µs/tick trên 30 vùng (máy cloud 4 lõi, bận chạy batch song song); vùng 20 quận 698 µs. Vượt ngân sách 300 µs — nợ v0.7 còn đó, đề xuất một task tối ưu riêng. Batch mỗi chiến lược 296–330 s trên máy này (ngân sách 110 s đo trên máy chủ dự án).
- **Digest pin:** đổi theo ADR 0023 (linh căn 15%); đời 1 chết đói 52 → 50, đời 2, 3 giữ tuổi.
- **Test:** 737 (sim 508, headless 14); mới: `omens.test.ts` (3), `tools/headless/tests/seekers.test.ts` (6), test hồi quy trần sức khỏe.

### Sau S7 — task hiệu năng (2026-10-30)
- **Đo** (máy cloud 4 lõi): thế giới 20 quận 1.096 µs/tick, 9 quận 350; đời người chơi máy điều độ 635–740 µs/tick (nhiễu giữa các lần chạy khoảng ±10%). Mỗi vùng 186–316 NPC, khoảng 40 người ở L0, còn lại L1: tính ra chừng 2,5 µs mỗi NPC-tuần.
- **Profiler** (`node --cpu-prof`, 10 đời điều độ): pha NPC 69% (bước tháng L1 46%, tuần L0 16%, xếp kế hoạch 11%), thế lực 8%, rút sự kiện 6%, khung người chơi máy 6%. Hồ sơ phẳng: hàm tự tốn nhiều nhất chỉ 3–4% (khóa hành động, hậu quả, tác dụng ô, độ mệt). Không có chỗ O(n²): bảng tra người, trần thể lực đã nhớ từ v0.4.
- **Thử sửa vặt giữ digest:** bỏ kiểm lại trạng thái RNG mỗi tuần của NPC, dùng bảng tra người có sẵn ở bốn pha thế lực, nhớ kết quả quét người trong một lần rút sự kiện. Digest y nguyên, nhưng thời gian không đổi đo được (chênh nằm trong nhiễu). Đã **bỏ** cả ba, không đưa code phức tạp hơn mà không nhanh hơn.
- **Kết luận:** muốn sim nhanh rõ thì phải bớt việc sim làm (đổi luật tầng L1, đổi digest và cân bằng), việc ấy cần chủ dự án quyết. Sim trong game không chậm: một năm 36 tuần khoảng 25 ms.
- **Bộ test:** `apps/game` kiểm chữ bằng 300 đời trong một test chạy 187 s, quá giới hạn 180 s nên `pnpm test` trượt trên máy này. Tách thành bốn tệp 75 đời (`content-lives-*.test.ts`, cùng seed đời 0–299) để vitest chạy song song: game 93 s. Tách test tương đương L0/L1 (98 s) khỏi `npc.test.ts` (163 s) sang `npc-tiers.test.ts`: hai tệp chạy song song hết 94 s. Cả bộ `pnpm test` xanh, 5 phút 13 giây trên máy 4 lõi (trước đó trượt ở game). Tổng CPU khoảng 10,5 phút, nên máy nhiều lõi hơn sẽ nhanh hơn nhiều.
