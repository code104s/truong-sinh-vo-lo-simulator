# ADR 0017 — Quan hệ và lời đồn

- Trạng thái: **ĐÃ DUYỆT** (2026-10-27, chủ dự án đồng ý mọi khuyến nghị Q1–Q13 ở `docs/v0.5-giai-doan-a.md`; liên quan Q1, Q6, Q7, Q9, Q10).
- Ngày: 2026-10-27
- Liên quan: GDD 1.1, 3.2 E, 3.2 F, 3.2 H, 3.2 J, 5 (v0.5); ADR 0008, 0012, 0014, 0015, 0016

## Bối cảnh
- **GDD 3.2 H:**
  - mỗi cặp quan hệ có vài trục: thân thiết, tin cậy, thù hận, nợ ơn;
  - quan hệ thay đổi theo hành động, sự kiện và lời đồn;
  - hậu quả thật: bạn bè giúp qua cơn đói, kẻ thù hại mình.
- **GDD 3.2 E:** nhóm Xã giao gồm thăm hỏi, kết giao, cưới hỏi, kết thù; giá là thời gian, tiền, quan hệ.
- **GDD 3.2 F:** uy tín/danh tiếng là tài nguyên (hoãn từ v0.3).
- **Ràng buộc đo được** (v0.4):
  - mỗi vùng có 130–330 NPC; một NPC khoảng 1 KB trong snapshot;
  - trình duyệt +1 năm còn khoảng 3 ms tới ngân sách 50 ms (p95);
  - một đời người chơi gặp trung bình 5,5 người qua sự kiện, nhiều nhất 16.

## Phương án
| | A. Thưa, quanh người chơi (khuyến nghị) | B. Đủ mọi cặp | C. Chỉ tiếng tăm, không quan hệ từng người |
|---|---|---|---|
| Cách làm | Bốn trục chỉ cho cặp người chơi–NPC đã có tương tác; NPC–NPC chỉ có ruột thịt, hôn nhân | Mỗi cặp NPC–NPC cũng có bốn trục, đổi theo mô phỏng | Một chỉ số uy tín mỗi quận, không nhớ ai với ai |
| Ưu | Rẻ (vài chục cặp mỗi đời); đủ cho mọi hậu quả GDD nêu ở phía người chơi | Thế giới xã hội sống động nhất | Rẻ nhất |
| Nhược | NPC chưa có bạn bè, kẻ thù riêng | 10⁴–10⁵ cặp, vượt ngân sách trình duyệt và save; khó cân bằng | Không có "bạn giúp qua cơn đói", không có kẻ thù cụ thể |

## Quyết định (đề xuất: phương án A, kèm tiếng tăm theo quận)
- **Kho quan hệ:** ánh xạ thưa `id NPC → { closeness, trust, hostility, owed }`, số nguyên.
  - `closeness`, `trust`, `hostility` trong 0..100; `owed` trong −100..100 (dương: người ấy nợ ơn mình).
  - Chỉ có mục khi đã tương tác (sự kiện có người thật, hành động xã giao, ruột thịt).
  - Lưu trong snapshot, sắp theo id.
- **Thay đổi quan hệ:**
  - lựa chọn sự kiện có người thật: cho người xin ăn thì thân thiết và nợ ơn tăng, lảng đi khi người ấy bị đánh thì thân thiết giảm;
  - hành động xã giao (Q7);
  - tiếng tăm của mình ở quận người ấy: cộng, trừ vào lúc mới quen;
  - phai mỗi năm về 0 (thân thiết, tin cậy chậm; thù hận rất chậm). Người mất thì giữ lại cho tổng kết, không đổi nữa.
- **Hành động xã giao** (mỗi cái một ô, nhắm vào một người cùng quận; `PlanSlot.person`):
  - **thăm hỏi:** quà theo xuất thân; thân thiết, tin cậy tăng. "Kết giao" là thăm hỏi nhiều lần;
  - **cưới hỏi:** sính lễ; cần thân thiết từ "bạn" (ADR 0018);
  - **nhờ cậy:** vay lương hoặc tiền từ túi, kho người ấy; nợ ơn tăng; không trả trong một năm thì tin cậy giảm.
  - Không có hành động "kết thù": thù hận sinh từ lựa chọn và sự kiện.
- **Hậu quả:**
  - bạn từ "bạn" trở lên: sự kiện mang gạo khi mình đói (tốn kho bạn, cộng nợ ơn);
  - kẻ thù từ "thù" trở lên: sự kiện trả thù (trộm, đánh, nói xấu làm giảm tiếng tăm);
  - người thân giúp khi đói theo luật chung (ADR 0018).
- **Tiếng tăm (lời đồn):** của người chơi, theo từng quận, −100..100.
  - Việc làm có gắn tiếng ở quận nơi xảy ra: cứu người, giúp việc làng (+); trốn thuế, đánh nhau, trộm, nợ không trả (−).
  - Đầu tháng lan sang quận kề một nửa phần chênh; đầu năm phai 10% về 0.
  - Ảnh hưởng: nhận lời cưới, nhờ cậy, trọng số một số sự kiện, quan hệ lúc mới quen.
  - Là thứ một quận "biết" về người chơi (thay cho tri thức từng người, chưa làm).
- **Tin đồn:** tin nghe từ quận kề (đói kém, tai họa, người quen hoặc người thân mất), trễ một tháng, mức `minor` trừ người thân.

## Hệ quả
- Quan hệ gắn vào `id` NPC (ADR 0015), không viết lại dân số.
- Thêm luồng RNG `social` cho hành động xã giao và tiếng tăm, để không đổi luồng sẵn có.
- Snapshot thêm vài chục mục quan hệ và một mảng tiếng tăm theo quận: vài KB.
- NPC–NPC chưa có bạn bè, kẻ thù; có thể thêm ở v0.6 cùng thế lực, nếu ngân sách cho phép.
- Sự kiện quan hệ làm tăng số sự kiện/năm; giữ mục tiêu 2–4 bằng trọng số (ADR 0014).

## Ghi chú Bước 0: đo nền (2026-10-27)
- **Node:** `pnpm sim world --seeds 10 --years 100` trung bình 150,4 µs/tick (ngân sách 300). Snapshot lúc sinh: tsvl-01 137 KB (134 NPC), tsvl-03 286 KB (282 NPC); NPC chiếm gần hết.
- **Trình duyệt, +1 năm** (Chrome headless, 1920×1080, tsvl-01 · Phố Kỳ, 54 lần bấm mỗi lượt; đời mới có seed ngẫu nhiên nên mỗi lượt khác nhau):

  | Bản | Trung bình | p95 | Chậm nhất |
  |---|---:|---:|---:|
  | Production (`vite preview`), 3 lượt | 16,9 / 18,9 / 24,6 ms | 25,7 / 35,1 / 42,5 ms | 27,9 / 41,4 / **60,2** ms |
  | Dev server, 3 lượt | 27,1 / 27,5 / 28,4 ms | 42,0 / 44,8 / 47,9 ms | 47,5 / **84,4** / **54,9** ms |

  - Bản production nhanh hơn dev khoảng 25–35% ở trung bình.
  - **Chậm nhất vượt 50 ms ở cả hai bản** trong một số lượt, ngay cả trước khi v0.5 thêm gì: đuôi dao động (có lẽ do dọn rác bộ nhớ), không phải trung bình.
  - Ngân sách "+1 năm ≤ 50 ms" chưa nói là trung bình, p95 hay chậm nhất. **Chủ dự án chốt (2026-10-27): đọc theo p95 trên bản production.**

## Ghi chú S4: quan hệ người chơi–NPC, hành động xã giao (2026-10-28)
- **Phạm vi:** S4 làm **thăm hỏi** và **nhờ cậy**. **Cưới hỏi** (`action.propose`) dời sang S5 cùng gia đình người chơi, vì cần sính lễ, nơi ở chung và con cái của S5.
- **Ô xã giao:** nhóm hành động `social`, mỗi hành động một ô, nhắm vào một người qua `PlanSlot.person`. Kế hoạch hợp lệ khi và chỉ khi ô xã giao có người, ô khác không có.
- **Khóa (kiểm mỗi tuần như các khóa khác, ô bị khóa thành nghỉ, cảnh báo một lần):**
  - `lock.person_away`: người ấy không có, đã mất, hay đang ở quận khác;
  - `lock.stranger`: nhờ cậy người không phải ruột thịt mà thân thiết dưới 20 ("người quen");
  - thăm hỏi không đủ tiền quà: khóa tiền như mọi hành động tốn tiền.
- **Thăm hỏi** (thể lực 30): quà theo xuất thân (10/30/100/300 văn) chuyển vào túi người được thăm, sổ cái giữ. Thân thiết +10 (dưới 50), +5 (dưới 80), +2 (từ 80); tin cậy +3; thù hận −5; nếu mình đang nợ ơn thì trả bớt 5. Thăm năm lần liền từ người lạ thành "bạn".
- **Nhờ cậy** (thể lực 10):
  - xác suất nhận lời (ppm) = thân thiết × 6.000 + tin cậy × 4.000 − thù hận × 8.000 − phần mình đang nợ × 5.000, cộng 300.000 nếu là ruột thịt; rút một lần trên luồng `social` dù kết quả thế nào;
  - nhận lời: tối đa 40 lương (4 tuần ăn) từ phần trên 360 của người ấy; không có lương dư thì tối đa 200 văn từ phần trên 300. Mình nợ ơn thêm 15, thân thiết +2;
  - từ chối, hoặc nhận lời mà không còn gì dư: thân thiết −2;
  - nợ ơn làm khó nhờ tiếp: không có tài nguyên nào sinh ra từ hư không, người giúp mất đúng phần mình nhận.
- **Phai đầu năm** (sau pha NPC của tick đầu năm): thân thiết −5, tin cậy −3, thù hận −2; ruột thịt không nhạt dưới 50 ("bạn"); mình còn nợ ơn từ 20 trở lên thì tin cậy −10 thêm (thay cho "không trả trong một năm"). Quan hệ với người đã mất giữ nguyên cho tổng kết.
- **Sự kiện đổi quan hệ:** `EventDef.bonds` là bảng kết quả → độ đổi, máy sự kiện áp sau khi chọn nếu người thật trong chuyện còn sống; người vô danh không có gì. Đã nối: người xin ăn, ẩu đả ở chợ, người môi giới ruộng, thầy thuốc.
- **Chưa làm ở S4:** tiếng tăm và tin đồn (S6); sự kiện bạn mang gạo khi đói, kẻ thù trả thù (S7); người chơi máy biết xã giao (S8). Người chơi máy hiện không xã giao nên batch v0.3 không đổi tuổi thọ, chỉ đổi digest vì luồng `social` và quan hệ từ sự kiện.

## Ghi chú S6: tiếng tăm và tin đồn (2026-10-28)
- **Kho:** `LifeSnapshot.reputation`, một số nguyên −100..100 cho mỗi quận của vùng, khởi đầu 0 (`social/reputation.ts`).
- **Dải** (`CharacterView.reputation` ở quận đang đứng; `legacy.reputation` ở quận nhà): khét tiếng ≤ −50, bị chê ≤ −15, vô danh −14..14, được nể ≥ 15, có tiếng tốt ≥ 50.
- **Lan, đầu tháng:** mỗi quận nghe một nửa tiếng của quận kề vang nhất (theo độ lớn; bằng nhau thì quận số nhỏ). Nếu nửa ấy vang hơn tiếng đang có, quận nhích một nửa phần chênh về phía nó. Tính trên bản đầu tháng nên xa một quận thì tiếng nhỏ đi một nửa, không bao giờ vượt nơi phát ra. Ví dụ chuỗi 4 quận, tiếng 40 ở quận đầu: tháng 1 → 40/10/0/0, tháng 2 → 40/15/2/0, lâu dài ≤ 40/20/10/5.
- **Phai, đầu năm:** 10% về 0, làm tròn lên (tiếng nhỏ cũng phai hết). Phai, lan chạy đầu tick, trước việc làm của tuần đó.
- **Việc làm có tiếng** ở quận nơi xảy ra:
  - sự kiện: bảng `EventDef.reputation` (kết quả → điểm), áp sau khi chọn, cùng chỗ với bảng quan hệ. 15 sự kiện đã gắn: cứu người khỏi đám cháy +15/+10; chia gạo lúc giá vọt +8, găm hàng −5; can ẩu đả +5, xông vào đánh −10; trốn thuế −10; cho người xin ăn +3/+5; giúp việc làng (đắp đê, tát nước, đuổi châu chấu, gặt giúp) +3; lo tang chu đáo +10, đơn sơ +2, nhờ làng xóm −5; chăm cha mẹ ốm +5, mời thầy +3, bỏ mặc −5; viếng, giúp đám ma hàng xóm +2/+4, không tới −2; góp, giúp hội làng +2, không tới −2; bắt được kẻ trộm kho +5; đánh thắng cướp +5;
  - ngoài sự kiện, ở quận nhà: thiếu thuế đinh −5, khất nợ vay −5.
- **Ảnh hưởng:**
  - nhận lời nhờ cậy, cưới hỏi: cộng tiếng ở quận đang đứng × 3.000 ppm (tiếng 50 → +15%);
  - quan hệ lúc mới quen: tin cậy bằng nửa tiếng tốt, hiềm khích bằng nửa tiếng xấu;
  - trọng số sự kiện: ở trấn, kẻ bị chê dễ bị gây sự gấp rưỡi. Đã thử "người xin ăn tới nhà có tiếng tốt gấp đôi" rồi bỏ: người chơi máy luôn cho nên càng được nể càng bị xin, batch điều độ chết đói 5,0% → 5,1% (ngưỡng 5%); bỏ đi thì batch trở về đúng số của S5.
- **Tin đồn** (`LifeSnapshot.rumors`, tin chờ nghe): đầu tháng ghi tin từ các quận kề quận đang đứng — đói kém mới bắt đầu, tai họa (hạn, lụt, châu chấu), dịch — và nghe sau một tháng, mức thường (không ngắt tua). Người có quan hệ với mình (không phải người thân, chưa gặp trong sự kiện) mất ở quận khác: tin đồn sau một tháng; người lạ ở quận khác thì không có tin. Người thân mất vẫn là tin quan trọng ngay, ở mọi quận.
- **Tổng kết đời** thêm số bạn (từ dải "bạn", không kể người thân), số kẻ thù (dải "kẻ thù") và tiếng tăm quê nhà.
- **Tất định:** số nguyên, không rút RNG; thế giới tự chạy không đổi (tiếng tăm chỉ của người chơi).
- **Chưa làm ở S6:** NPC chưa có tiếng tăm riêng; tri thức từng người ("ai biết gì") vẫn chưa có (Q9); sự kiện quan hệ mới dùng tiếng tăm ở S7; người chơi máy chưa nhắm tiếng tăm (S8).
- **Digest pin đổi;** tuổi, nguyên nhân chết của ba đời mẫu giữ nguyên (52/53/42).
- **Kết quả:** `pnpm sim world` PASS, không đổi so với S5 (chết đói 9,8%); `pnpm sim batch` PASS, đúng số của S5 (tuổi TB 59,66, chết đói 50/1.000 đời): người chơi máy chưa xã giao, chưa vào trấn gây sự, nên tiếng tăm chưa chạm tới kết cục của nó.

## Ghi chú S7: sự kiện quan hệ (2026-10-28)
- **Chín sự kiện mới** (`events/defs/relations.ts`), mỗi sự kiện gọi một người thật (`cast`, biến thể `named`), đổi quan hệ qua bảng `bonds`, một số gắn tiếng qua bảng `reputation`. Cùng hai sự kiện gia đình của S5 (cha mẹ già ốm, tang người thân) là 11 sự kiện quan hệ (Q10: 8–12).

  | Sự kiện | Khi nào | Lựa chọn (giá) |
  |---|---|---|
  | Bà mối | chưa vợ/chồng, có người hợp đôi cùng quận | lễ bà mối gấp đôi quà (tiền) → thân thiết 30, tin cậy 10; từ chối |
  | Đám cưới trong làng | tháng 11–Giêng, có cô dâu mới 18–21 tuổi | mừng cưới bằng quà (tiền); giúp nấu cỗ (thể lực); không sang |
  | Người quen mang gạo | mình đói, người quen thân (thân thiết ≥ 50, không phải người thân) còn dư trên một năm ăn | nhận tối đa 4 tuần ăn (mình nợ ơn 15); từ chối |
  | Kẻ thù | người có hiềm khích (thù hận ≥ 30) cùng quận | sang nói cho ra lẽ (rủi ro: thắng, hay bị đánh và mất 20% thóc, tối đa 150 thăng, vào kho kẻ ấy); mang lễ gấp ba quà làm lành (thù hận −25); nhịn (mất thóc, thù hận −10) |
  | Con ốm | con dưới 16 đang ốm cùng quận | mời thầy thuốc 100 văn (dứt bệnh); ở nhà chăm (2 ô); khấn Thành hoàng |
  | Đòi nợ ơn | người mình nợ ơn (≥ 20) cùng quận | trả gấp năm quà; làm đỡ một tuần; khất (tin cậy −10, tiếng −3) |
  | Chia gia tài | cha hoặc mẹ mất trong 12 tuần, không còn vợ/chồng; anh chị em đã ra riêng cùng quận | nhường gấp mười quà; giữ phần (thù hận +25, tiếng −2) |
  | Người quen gặp khó | người quen (thân thiết ≥ 20) đang đói | cho 4 đấu thóc; cho vay 100 văn; làm ngơ. Chỉ cho từ phần trên một năm ăn, phần tiền trên 300 văn (cùng luật người thân giúp nhau, Q6) |
  | Vợ chồng lục đục | có vợ/chồng cùng quận, nhà túng (đói hay túi dưới 100 văn) | ở nhà một tuần nói chuyện (1 ô); mua quà; bỏ ra ngoài |

- **Nối sự kiện cũ vào người thật:**
  - **mất trộm kho:** kẻ trộm là một người đang đói ở quận này nếu có. Thóc mất vào kho người ấy (không còn mất hẳn); bắt được quả tang thì người ấy thành thù (thù hận 30), nên về sau có thể có sự kiện kẻ thù;
  - **hàng xóm nhờ gặt:** người nhờ là một nhà làm ruộng trong làng; gặt giúp thì thân thiết +10, người ấy nợ ơn 5.
  - Tổng cộng 18 sự kiện gọi người thật.
- **Tần suất:** batch điều độ 2,86 sự kiện/năm (S6: 2,81), trong mục tiêu 2–4; không phải giảm trọng số sự kiện cũ.
- **Sự kiện hiếm trong batch** (`RARE_EVENTS`): con ốm, đòi nợ ơn, kẻ thù, người quen mang gạo, người quen gặp khó, vợ chồng lục đục. Chúng cần vợ/chồng, con, kẻ thù, người quen thân hay món nợ ơn mà người chơi máy hiện chưa tạo (chưa cưới hỏi, xã giao). Đường đi của từng sự kiện được test trực tiếp (`events.test.ts`, trạng thái mẫu có người trong chuyện). Gỡ khỏi danh sách khi có chiến lược `family` (S8).
- **Digest pin đổi:** đời mẫu chỉ nghỉ 52/53/42 → 51/52/42 tuổi (đời mẫu luôn chọn lựa chọn đầu đang mở, ở các sự kiện mới phần lớn là lựa chọn tốn tiền).
- **Kết quả:** `pnpm sim world` PASS, không đổi (chết đói 9,8%). `pnpm sim batch` **FAIL**: điều độ chết đói 5,1% (51/1.000 đời), ngưỡng 5%.
  - Đo 3.000 đời: có S7 5,5% (165), gỡ 9 sự kiện mới 5,4% (162). S7 chỉ thêm khoảng 0,1 điểm.
  - Tỉ lệ thật đã trên 5% từ trước S7: các lần PASS ở S4–S6 (48–50/1.000) là mẫu 1.000 đời may mắn; độ dao động ngẫu nhiên của khoảng 50 ca là cỡ ±7 ca. Cần chủ dự án quyết cách xử lý.

## Ghi chú F5: nghiệm thu trên trình duyệt (2026-10-28)
- **Ảnh nghiệm thu** (`docs/nghiem-thu/v0.5/`, khổ 1280×800 và 1920×1080, Chrome headless, dev server, đời thật tsvl-01 sinh ở thành Vị Kinh): màn chính; người thân, người quen (F1); xem nhanh có quan hệ (F1); bảng chọn người cưới hỏi kèm lý do khóa (F2); biên niên lúc cưới — thăm hỏi bốn lần rồi ngỏ lời, sính lễ 300 văn (F2, F3); gia đình — vợ, con trai chào đời, tiếng tăm "Bị chê" (F1, F3); lọc "Người quanh mình" (F3); tổng kết có di sản — vợ, 1 con còn sống, 1 bạn, tiếng tăm quê nhà (F4). Console không có lỗi ở cả hai khổ.
  - Đời thử là người chơi tự xếp: thăm người hợp đôi mỗi tháng tới khi đủ thân, cưới năm 18 tuổi, có con năm 21 tuổi. Ba làng thử trước (Phố Kỳ, Vân Hành, Đan Lam) không có người hợp đôi suốt 18–32 tuổi: làng chỉ khoảng 12 người, người độc thân được NPC cưới rất nhanh — đúng luật, nhưng người chơi ở làng muốn lập gia đình phải đi nơi khác.
- **Save trình duyệt có gia đình** (`docs/nghiem-thu/v0.5/browser-save.json`, 166 NPC; người chơi có vợ, một con; 5 mục quan hệ; tiếng tăm 9 quận; lệnh: 90 `ADVANCE`, 4 `SET_PLAN` trong đó 2 có ô xã giao, 18 `CHOOSE`, 12 `TRADE`) phát lại bằng `pnpm sim replay --save docs/nghiem-thu/v0.5/browser-save.json`: **PASS**, digest `19166e3f253f3404`.
- **+1 năm trên bản production** (`vite preview`, Chrome headless 1920×1080, tsvl-01 · Phố Kỳ, 52 lần bấm không bị sự kiện ngắt; đo từ lúc bấm tới khi ngày đổi và nút mở lại):

  | Lượt | Trung bình | p95 | Chậm nhất |
  |---|---:|---:|---:|
  | 1 | 16,5 ms | 24,1 ms | 26,5 ms |
  | 2 | 24,4 ms | **53,8 ms** | 67,6 ms |
  | 3 | 22,3 ms | 36,7 ms | 52,5 ms |
  | 4 | 23,7 ms | 42,8 ms | 43,0 ms |
  | 5 | 23,9 ms | 39,7 ms | 45,4 ms |

  Ngân sách (chủ dự án chốt ở Bước 0): p95 ≤ 50 ms trên bản production. **Bốn trên năm lượt đạt**; lượt 2 vượt (53,8 ms), chạy liền sau một lượt khác khi máy còn bận — đuôi dao động như đã thấy ở Bước 0 (production trước v0.5: p95 25,7–42,5 ms, chậm nhất tới 60,2 ms). Trung bình v0.5 cao hơn Bước 0 khoảng 3–5 ms.
