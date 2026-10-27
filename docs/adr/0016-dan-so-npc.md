# ADR 0016 — Dân số NPC: hạn mức, sinh tử, nghề, kinh tế, sự kiện

- Trạng thái: **ĐÃ DUYỆT** (2026-10-27, chủ dự án đồng ý mọi khuyến nghị Q1–Q11 ở `docs/v0.4-giai-doan-a.md`; liên quan Q1, Q4–Q8)
- Ngày: 2026-10-27
- Liên quan: GDD 1.1, 3.2 F, 3.2 G, 3.2 H, 3.2 J, 5 (v0.4–v0.7), 8 (Nấc 1); ADR 0012, 0013, 0014, 0015

## Bối cảnh
- **GDD 3.2 G:**
  - NPC có tuổi, nghề, nhà ở, gia đình, tính cách, mục tiêu, tài sản, quan hệ.
  - NPC ra quyết định theo nhu cầu đơn giản: ăn ở → an toàn → quan hệ → tham vọng.
  - Một số NPC "đặc biệt" (thầy thuốc, thương nhân, kẻ cướp…) sinh ra từ mô phỏng.
- **GDD 5:** v0.4 làm "sinh, lão, bệnh, tử"; hôn nhân, con cái là việc của v0.5. Quy mô nấc 1 khoảng 150 NPC; số 150–400 còn **[CẦN XÁC NHẬN]**.
- **Dân nền** (ADR 0012): mỗi quận 7.000–35.000 người tổng hợp. Một vùng có 9–20 quận, 160.000–400.000 người.
- **Hộ cha mẹ** của người chơi là trừu tượng (ADR 0013). Sự kiện dùng người vô danh lấy từ kho 100 chân dung (ADR 0014).

## Phương án
| | A. Người có tên rút từ dân nền (khuyến nghị) | B. Sinh nở thật giữa các cặp NPC | C. Dân số cố định |
|---|---|---|---|
| Cách làm | Mỗi quận một hạn mức người có tên. Trẻ mới sinh "từ dân nền" để giữ hạn mức, chưa có cha mẹ là NPC | Có hôn nhân, cặp NPC sinh con | Tạo một lần, không sinh thêm |
| Ưu | Ổn định, rẻ; không làm trước phần của v0.5 | Gần đời thật nhất | Đơn giản nhất |
| Nhược | Trẻ chưa có cha mẹ thật tới v0.5 | Lấn sang v0.5; dân số dễ sụp hoặc bùng | Dân số tàn dần; trái "sinh ra… khi người chơi không để ý" |

## Quyết định (phương án A)

### Hạn mức và dân số ban đầu
- Hạn mức người có tên theo loại nơi: **làng 12, trấn 20, thành 30**. Ví dụ: tsvl-01 có 134 người, tsvl-03 có 282.
- Người có tên được trừ khỏi `mouths` của quận, để không bị tính hai lần: dân nền vẫn ăn kho quận, còn NPC ăn bằng túi riêng.
- Tạo lúc bắt đầu đời người chơi, từ luồng RNG riêng của thế giới (`npc-world`):
  - **Tuổi:** theo tháp dân số, 0–70 tuổi, khoảng 35% dưới 16.
  - **Xuất thân:** theo trọng số của loại nơi, như người chơi (`BACKGROUND_WEIGHTS`).
  - **Thuộc tính:** `createCharacter`, dùng chung với người chơi.
  - **Người lớn:** nhận phần chia theo xuất thân, đã trừ đi số năm sống riêng.
  - **Nghề:** theo nơi ở, kỹ năng và xuất thân (xem dưới).

### Sinh, lớn, chết
- **Chết:** cùng luật người chơi — già, bệnh, tai nạn, đói (ADR 0005, 0013).
- **Sinh:** đầu mỗi năm, mỗi quận thêm số trẻ sơ sinh để bù:
  - nền ≈ hạn mức / 35 (tuổi thọ trung bình);
  - cộng 1/3 phần thiếu so với hạn mức.

  Số trẻ rút theo phân phối có seed (luồng `npc-world`). Không vượt 130% hạn mức.
- **Dưới 16 tuổi:** hộ cha mẹ trừu tượng, như người chơi (ADR 0013), kể cả bị bỏ đói năm đói kém theo xuất thân.
- **16 tuổi:** tự lập thân, chọn theo bộ não nhu cầu:
  - bần cùng thường ở lại;
  - người có chí lớn có thể lên trấn;
  - còn lại ra riêng.
- **Cha mẹ thật, hôn nhân, con cái:** v0.5.
- **Không di cư** ở v0.4: NPC ở quận nhà, trừ thương nhân (dưới). Di cư theo đói kém thuộc v0.6.

### Bộ não nhu cầu (L0 xếp kế hoạch tháng; L1 dùng cùng kế hoạch)
- Chuyển lõi chiến lược "điều độ" của người chơi máy (S7) vào `packages/sim/src/npc/brain.ts`. Người chơi máy vẫn ở `tools/headless` và có thể gọi lõi này.
- Thứ tự ưu tiên:
  1. **Ăn ở:**
     - giữ một năm ăn;
     - thiếu ăn tới mùa gặt thì kiếm cái ăn ngay;
     - mua ở chợ quận khi chợ còn lương, giữ tiền nộp thuế.
  2. **An toàn:** yếu thì nghỉ, có bệnh và còn của thì chữa (ở trấn).
  3. **Nghề:** làm theo nghề.
  4. **Tham vọng** (đủ ăn hai năm): học chữ, buôn bán nhỏ — theo tính cách.
- **Quan hệ** (tầng thứ ba trong GDD) thuộc v0.5.

### Nghề (bản tối thiểu; v0.7 mở rộng)
| Nghề | Nơi | Việc chính | Thành nghề khi |
|---|---|---|---|
| Nông | Làng | Làm ruộng; mùa đông săn hay hái lượm | Có ruộng, hoặc làm tá điền |
| Làm thuê | Trấn, thành | Làm thuê | Mặc định ở trấn |
| Thợ săn | Làng | Săn | Kỹ năng săn từ "Thạo" trở lên |
| Thầy đồ | Trấn, thành | Học chữ, thu học phí | Chữ từ "Giỏi" trở lên |
| **Thầy thuốc** (đặc biệt) | Trấn, thành; đi làng quanh năm | Chữa bệnh, thu phí | Chữ "Thạo" và tính cách hợp; tối đa 1 người mỗi trấn hay thành |
| **Thương nhân** (đặc biệt) | Trấn, thành; đi quận kề | Buôn bán nhỏ | Kỹ năng buôn "Thạo" và có vốn |

- Kẻ cướp, tu sĩ lưu lạc: v0.6 (cần thế lực) và v0.8.

### Kinh tế (ADR 0012)
- Lương, học phí, phí thuốc, thuế đinh, mua bán lương của NPC đều đi qua **cùng quỹ, cùng kho quận**.
- **Sổ cái** = quỹ quận + túi người chơi + túi mọi NPC. Không đổi ở mọi tick.
- NPC chết: túi và kho về quỹ, kho quận nhà (thừa kế thật thuộc v0.5).
- Phí thầy thuốc NPC trả cho quỹ quận như người chơi. Chưa trả vào túi thầy thuốc: dịch vụ giữa người với người thuộc v0.5.

### NPC trong sự kiện (ADR 0014)
- Sự kiện có người trong chuyện thì lấy **người thật** khi có người hợp:
  - **Đám ma trong làng:** NPC cùng quận mất trong năm.
  - **Thầy thuốc qua làng:** thầy thuốc NPC gần nhất.
  - **Người xin ăn:** NPC đang đói trong quận.
  - **Lái lúa:** thương nhân NPC.
  - **Ẩu đả ở chợ:** hai NPC trong quận.

  Không có người hợp thì vẫn dùng người vô danh, như v0.3.
- Lựa chọn của người chơi tác động lên NPC thật khi luật cho phép. Ví dụ cho người xin ăn một đấu thì NPC đó được thêm lương.
- **Tin sinh tử** vào nhật ký người chơi (khóa `log.npc.*`, mức `minor`): người trong quận đang ở hay quận nhà mất, hay có trẻ mới sinh.

### Người chơi thấy gì (ADR 0001 bổ sung ở Bước 0)
- `STATE.people`: NPC đang ở quận người chơi đứng, gồm id, tên, giới, tuổi, nghề, dải sức khỏe, khóa chân dung. Không lộ thuộc tính ẩn.
- Chưa xem được NPC quận khác. Chưa có tin đồn (v0.5).

## Hệ quả
- Người chơi bớt là "nhân vật chính": có người sống, chết quanh mình dù mình không làm gì (GDD 1.1 trụ cột 3, 4).
- Kinh tế v0.3 gần như không đổi, vì NPC chỉ là khoảng 0,1% dân. Batch v0.3 phải giữ mọi tiêu chí.
- Cần một công cụ "thế giới tự chạy" (`pnpm sim world`) để đo 100 năm không người chơi. Chỉ là công cụ kiểm: trong game, người chơi chết thì thế giới dừng (GDD 3.2 C).
- v0.5 thêm cha mẹ, vợ chồng, con cái thật bằng cách gắn quan hệ vào `id`, không phải viết lại dân số.

## Ghi chú triển khai S1 (2026-10-27)
- **Mã:** `packages/sim/src/npc/population.ts` (`seedPopulation`, `NPC_QUOTA`, `AGE_BANDS`). Gọi trong `Life.create` ngay sau khi tạo chợ, và trong `simulateWorld`.
- **Tạo một người:**
  - Tuổi, tuần sinh: luồng `npc-world`.
  - Thuộc tính, tên, nghề: luồng riêng của NPC (`createCharacter` dùng chung với người chơi). Thêm hay bớt một người không làm đổi thuộc tính người khác.
  - **Người già sinh trước năm 1** của lịch thế giới: tick sinh âm. Schema snapshot nhận `birthTick` và `skillLastUsed` âm; luật chỉ dùng hiệu số tick nên không đổi.
  - **Không ai sinh ra đã quá thọ:** người già hơn thọ nguyên trừ 2 năm thì trẻ lại cho vừa.
- **Tháp tuổi:**

  | Tuổi | Trọng số |
  |---|---|
  | 0–15 | 35 |
  | 16–29 | 25 |
  | 30–44 | 20 |
  | 45–59 | 13 |
  | 60–70 | 7 |

  Đo 40 đời × 32 người: 28–42% dưới 16 tuổi.
- **Nghề ban đầu:**
  - dưới 16 tuổi: `child`;
  - làng: thợ săn 15%, còn lại nông;
  - trấn, thành:
    - thầy thuốc: tối đa 1 người, từ 30 tuổi, tính cách chính trực, hiền hậu, điềm tĩnh hay trung hậu;
    - thầy đồ 10%;
    - thương nhân 10%, trừ nhà bần cùng;
    - còn lại làm thuê.
- **Kinh nghiệm nghề** = 300 mỗi năm đã làm từ 16 tuổi, tối đa 9.000. Thợ săn, thầy thuốc, thương nhân ít nhất "Thạo"; thầy đồ ít nhất "Giỏi".
- **Người từ 16 tuổi** ra riêng với phần chia theo xuất thân, lấy từ quỹ và kho quận nhà (`becomeIndependent`). Sổ cái của đời (`totalMoney`) và của thế giới tự chạy nay cộng cả túi NPC.
- **Tầng ban đầu:** quận người chơi sinh ra L0, quận khác L1. Đổi tầng theo tháng có ở S3.
- **Chưa có luật:** NPC đứng yên tới S2. Tuổi vẫn tăng theo tick; sức khỏe, túi, kho không đổi; không ai chết.
- **Ảnh hưởng đo được:**
  - Batch v0.3 vẫn PASS, số lệch không đáng kể. Điều độ 59,70 → 59,68; lang bạt 47,87 → 47,97, do dân nền bớt và quỹ quận đã chia phần cho NPC.
  - `pnpm sim economy` PASS.
  - Digest pin đổi; tuổi và nguyên nhân chết của ba đời mẫu giữ nguyên.
- **Chi phí:** batch 66 s → 106 s, vì mỗi đời phải sinh 130–300 người. Đời "lười" ngắn nên thấy rõ nhất: 4 s → 10,6 s cho 1.000 đời, tức khoảng 6 ms mỗi lần tạo đời. Vẫn trong ngân sách Q9 (≤ 3 lần v0.3). S7 đo lại và tối ưu nếu cần.

## Ghi chú triển khai S4 (2026-10-27)
- **Mã:** `packages/sim/src/npc/lifecycle.ts`.
  - `npcYearStart`: gọi đầu năm trong `npcPhase`, trước bước tuần.
  - `comeOfAge`: gọi đầu tháng trong `planMonth`.
  - `baseOccupation`, `refreshOccupation`: nghề mới tự lo và nghề đổi theo kỹ năng.
- **Ở nhà tới 20 tuổi:** `stayAtHomeYear` chuyển sang `household.ts`, người chơi và NPC dùng chung (digest đời mẫu không đổi). Hàm tìm trấn gần nhất `nearestTownFrom` chuyển sang `travel.ts`, dùng chung với sự kiện.
- **Snapshot NPC** thêm `root` (seed gốc của đời) và `regionId`, để sinh trẻ, cấp id mà không cần truyền tham số.
- **Sinh:**
  - đầu năm, mỗi quận sinh `hạn mức/35 + 1/3 phần thiếu` trẻ, phần lẻ rút theo xác suất, không vượt 130% hạn mức;
  - RNG riêng theo (đời, năm, quận), nên không phụ thuộc thứ tự xử lý;
  - trẻ mới sinh dùng `createCharacter`, xuất thân theo loại nơi, ở trong hộ trừu tượng tới 16 tuổi.
- **Dọn người đã mất** khỏi snapshot sau một năm. Id không dùng lại.
- **Lập thân NPC lúc 16 tuổi,** cùng ba ngả với người chơi:
  - nhà bần cùng ở lại tới 20 với xác suất 50%, mỗi đầu năm nộp nửa túi về nhà;
  - người có chí lớn, khéo xoay xở ở làng lên trấn gần nhất với xác suất 30%, không lấy ruộng;
  - còn lại ra riêng với phần chia.

  Nghề lúc mới tự lo: ở làng là thợ săn nếu săn đã "Thạo", không thì nông; ở trấn, thành là làm thuê.
- **Tầng tham vọng của bộ não** (`ambitionPlan`): đủ ăn hai năm và dưới 45 tuổi thì ô làm thứ hai thành việc riêng theo tính cách.
  - người chuộng chữ nghĩa học chữ: chính trực, điềm tĩnh, hiền hậu, trung hậu, lạnh lùng, kỳ quặc;
  - người ham lời buôn bán nhỏ: có chí lớn, khéo xoay xở, tham lam, vui tính.
- **Nghề nảy từ mô phỏng** (đầu năm, chỉ người làm thuê ở trấn, thành):
  - chữ "Thạo", từ 30 tuổi, tính cách hợp, quận chưa có thầy thuốc → **thầy thuốc**;
  - chữ "Giỏi" → **thầy đồ**;
  - buôn "Thạo", đủ vốn tối thiểu, quận chưa đủ một phần năm hạn mức là thương nhân → **thương nhân**.

  Thương nhân hết vốn tối thiểu thì quay lại làm thuê.
- **Lỗi cân bằng tìm ra và đã sửa — thương nhân vốn mỏng chết đói:** 60 trong 104 người chết đói là thương nhân. Lãi người mới khoảng 15‰ vốn mỗi tuần, nên vốn vài trăm văn kiếm ít hơn làm thuê mà còn có thể lỗ. Nay thương nhân chỉ buôn khi vốn từ 4.000 văn (lãi bằng lương làm thuê); vốn ít hơn thì đi làm thuê. Chết đói giảm từ 14,0% xuống **7,9%**, năm thường từ 5,6% xuống **4,5%**.
- **Kết quả** (`pnpm sim world --seeds 10 --years 100`):
  - mỗi quận **83–130%** hạn mức ở mọi năm;
  - dưới 16 tuổi **27,4%**;
  - có thầy thuốc **100%** số năm, có thương nhân **99%**; mỗi quận tối đa một thầy thuốc;
  - tuổi trung bình lúc mất **58,8**;
  - nguyên nhân chết: bệnh 47,5%, già 28,1%, tai nạn 16,5%, đói 7,9%;
  - sổ cái giữ nguyên.
- **Tai nạn 16,5%,** cao hơn người chơi máy (khoảng 12%): NPC có nhiều trẻ con và thợ săn, cùng bảng tai nạn theo tuổi với người chơi. Ghi nhận, chưa chỉnh.
- **Batch v0.3:** PASS, số gần như không đổi (điều độ 59,71, lao lực 56,77, học giả 57,76, lang bạt 48,04).
  - Thời gian chạy đời 249 s → **464 s** với 8 luồng: dân số nay giữ quanh hạn mức suốt đời người chơi, không thưa dần như đoàn ban đầu không sinh.
  - Cả lệnh 7 phút 59 giây, khoảng 4,5 lần v0.3: **lại vượt ngân sách Q9**.
  - Máy có 16 luồng logic (i5-13400F, 6 nhân hiệu năng và 4 nhân tiết kiệm). Mặc định `--threads 15`: chạy đời 404 s, cả lệnh 6 phút 55 giây, khoảng 3,9 lần v0.3. Thêm luồng lợi ít vì nhân tiết kiệm chậm. Tối ưu tiếp ở S7, ví dụ giữ đối tượng RNG của NPC giữa các tuần.

## Ghi chú triển khai S5 (2026-10-27)
Phần lớn kinh tế NPC đã làm ở S1–S4. S5 rà lại và đo:
- **Rà mọi dòng tiền** trong mã NPC và luật dùng chung. Mọi chỗ đổi tiền đều có cặp: túi ↔ quỹ quận.
  - phần chia lúc ra riêng, ở nhà nộp nửa túi;
  - lương, học phí, phí thuốc, buôn bán nhỏ (`settleAction`);
  - mua bán lương (`tradeGrain`, `buyGrain`), thuế đinh;
  - của người mất về quận nhà;
  - lưu thông tiền giữa quận.

  NPC không vay nợ. Không tìm thấy chỗ nào tạo hay mất tiền.
- **`simulateWorld`, `pnpm sim world` đo thêm kinh tế có NPC,** cùng cách đo với `pnpm sim economy`: số lần đói kém, giá thấp/cao nhất, tháng-quận quỹ cạn, kho thấp nhất. Sổ cái kiểm **từng tick**, không chỉ đầu và cuối. Lệnh `world` nay PASS khi đạt sổ cái và các tiêu chí kinh tế v0.3; tiêu chí dân số NPC thêm ở S7.
- **Kết quả** (10 vùng × 100 năm, có NPC; trong ngoặc: `pnpm sim economy` không có NPC):

  | Chỉ số | Có NPC | Không có NPC | Mục tiêu |
  |---|---|---|---|
  | Đói kém, mỗi quận | 1 lần / 9,7 năm | 1 lần / 11,9 năm | 8–15 năm |
  | Giá | 70–500% | 70–500% | trong 70–500% |
  | Tháng-quận quỹ cạn | 2,5% | 1,0% | ≤ 5% |
  | Kho âm | 0 vùng | 0 vùng | 0 |
  | Sổ cái lệch (từng tick) | 0 vùng | — | 0 |

  Đói kém dày hơn một chút vì NPC mua lương tích kho, và vì lệnh `world` dùng pha Thế giới đầy đủ của đời người chơi (thời tiết rồi gọi tên tai họa). Vẫn trong khoảng mục tiêu.
- **Test:**
  - đời người chơi trên vùng thật tsvl-01 có làm ruộng, ra riêng, bán lương: sổ cái không đổi ở **mọi tuần** trong 30 năm, qua trẻ sinh, người mất, lập thân, đổi nghề;
  - thế giới tự chạy trên tsvl-03 100 năm: sổ cái từng tick, kho không âm, giá trong khoảng, quỹ cạn ≤ 5%.
- Không đổi luật nào: digest pin giữ nguyên.

## Ghi chú triển khai S6 (2026-10-27)
- **Máy sự kiện:** định nghĩa sự kiện thêm `cast` (chọn người thật, chạy trước lời kể, tham số, thẻ). Sự kiện chờ lưu `npcId`; thẻ mang `figure.npcId`. Lúc hiện thẻ và lúc chọn, máy đọc lại người ấy theo id, kể cả người đã mất. Trạng thái sự kiện thêm danh sách `met` (người đã gặp qua sự kiện).
- **Năm sự kiện gọi người thật.** Không có người hợp thì về người vô danh như v0.3, cùng lời kể cũ.

  | Sự kiện | Người thật | Lựa chọn tác động |
  |---|---|---|
  | Đám tang trong làng | Người cùng quận mất gần nhất trong năm. Có người mất thật thì trọng số 100.000 thay vì 25.000 | Lời kể có tên, tuổi mất; thẻ là người mất |
  | Thầy thuốc qua làng | Thầy thuốc NPC còn sống gần nhất (km giữa trị sở) | Phí vẫn vào quỹ quận như v0.3 |
  | Người xin ăn | Người ra riêng trong quận đang đói, hoặc hết gạo và hết tiền | Gạo cho, bữa cơm, gạo bị cạy: vào kho người ấy |
  | Thương lái ép giá | Thương nhân NPC gần nhất đủ bạc mua 20 đấu | Bạc từ túi thương nhân, lúa vào kho thương nhân (không qua quỹ quận) |
  | Ẩu đả ở chợ | Một người 16–49 tuổi ở trấn | Lảng đi thì người ấy bị thương nhẹ hai tuần; kết quả mới `walk_away_named` |

  - **Khác thiết kế ở trên (đã duyệt 2026-10-27):** ẩu đả gọi **một** người thật, bên kia là gã bán thịt vô danh. Lý do: lời kể chỉ cần một tên, đỡ phải viết lại cả ba kết quả.
  - Tìm người không rút RNG, trừ người xin ăn và ẩu đả (chọn ngẫu nhiên trong danh sách).
- **Văn bản:** thêm `body.named` cho năm sự kiện và `event.market_brawl.result.walk_away_named`. Không dùng đại từ có giới (NPC có nam có nữ), nên sửa ba câu cũ cho trung tính:
  - "nhờ ông chữa" → "nhờ chữa";
  - "Bán hai mươi đấu cho gã" → "Bán hai mươi đấu ngay tại sân";
  - "Con cháu ông cụ" → "Con cháu người mất".
- **Tin sinh, mất** (`log.npc.death`, `log.npc.birth`): người ở quận đang đứng hoặc có quận nhà trùng quận nhà người chơi.
  - Tin mất báo **đúng tuần mất**: NPC tầng L1 tính trước cả tháng, nên tuần mất có thể sau tuần đang chạy.
  - Tin sinh là trẻ mới cấp id trong tuần (đầu năm).
  - Mức `minor`; **khác thiết kế (đã duyệt 2026-10-27):** người đã gặp trong sự kiện mà mất thì `major`, để tua "đến sự kiện" dừng lại.
- **Đo trong đời thật** (30 đời, tsvl-01 và tsvl-03, 456 năm sống):

  | Sự kiện | Lần xảy ra | Có người thật |
  |---|---|---|
  | Ẩu đả ở chợ | 16 | 16 |
  | Đám tang | 52 | 18 |
  | Thầy thuốc qua làng | 9 | 9 |
  | Thương lái | 2 | 2 |
  | Người xin ăn | 20 | **0** |

  Tin NPC mất 94, tin trẻ sinh 167 (khoảng một tin mỗi năm rưỡi đời). Người xin ăn gần như không bao giờ là người thật: NPC ra riêng hiếm khi đói (S2–S4).
- **Test:**
  - năm sự kiện ra biến thể `named` có tên, thẻ đúng người, mọi khóa lời kể, lựa chọn, kết quả đủ;
  - không có người hợp thì về v0.3;
  - lựa chọn đổi kho, túi, thương tích của người ấy, sổ cái giữ;
  - sự kiện chờ ghi `npcId` và `met`, tải lại đọc ra người ấy, nhật ký kết quả có tên;
  - tin mất đúng tuần, `major` khi đã gặp; tin sinh đầu năm, mỗi trẻ một lần.
- **Batch v0.3 chạy lại** (5 × 1.000 đời, 15 luồng, 6 phút 34 giây): PASS. Tuổi thọ trung bình gần như không đổi so với S5:

  | Chính sách | S5 | S6 |
  |---|---|---|
  | điều độ | 59,71 | 59,68 |
  | làm quá sức | 56,77 | 56,85 |
  | học giả | 57,76 | 57,70 |
  | lang bạt | 48,04 | 48,25 |

  Sự kiện (trừ "lười") 2,40 lần/năm sau 12 tuổi, trong mục tiêu 2–4.
- **Digest pin đổi:** sự kiện gọi người thật đổi chuỗi RNG và trạng thái NPC; tuổi và nguyên nhân chết của ba đời mẫu giữ nguyên.

## Ghi chú S7: nghiệm thu dân số (2026-10-27)
- **`pnpm sim world` PASS/FAIL theo đủ tiêu chí mục 6** (`docs/v0.4-giai-doan-a.md`), không chỉ sổ cái và kinh tế:

  | Tiêu chí | Kết quả (10 vùng × 100 năm) | Mục tiêu |
  |---|---|---|
  | Dân số mỗi quận, mọi năm | 83–130% hạn mức | 70–130% |
  | Tuổi trung bình lúc mất | 58,8 | 50–65 |
  | Nguyên nhân chết | bệnh 47,5%, già 28,1%, tai nạn 16,5%, đói 7,9% | đủ bốn nguyên nhân |
  | Chết đói | 7,9% (năm thường 4,5%) | ≤ 10% |
  | Dưới 16 tuổi | 27,4% | 25–45% |
  | Năm có thầy thuốc / thương nhân | 100% / 99% | ≥ 80% |
  | Sổ cái, kinh tế v0.3 | 0 vùng lệch; đói kém 9,7 năm/lần, giá 70–500%, quỹ cạn 2,5% | như S5 |

- **Batch v0.3 đo thêm NPC** (`tools/headless`): tuổi lúc mất của NPC mất khi người chơi 16–45 tuổi, cùng cửa sổ cho mọi chiến lược.
  - Tiêu chí mới: "lang bạt" so với "điều độ" lệch ≤ 1 năm (tương đương LOD phía người chơi, mục 6).
  - Kết quả: 58,22 so với 58,24, **lệch 0,01 năm** (khoảng 62.000 và 82.000 NPC mất).
- `pnpm sim economy` vẫn PASS (quỹ cạn 1,0%).

## Ghi chú F4 (2026-10-27)
- Tin mất của **người đã gặp** (danh sách `met`) nay tới người chơi **dù người ấy mất ở quận nào**, mức `major`. Người chưa gặp vẫn chỉ có tin khi ở quận đang đứng hoặc cùng quận nhà, mức `minor`.
- Màn tổng kết lấy "những người đã đi trước" từ chính các tin mất mức `major` này, nên không đổi hợp đồng `LifeSummary`.
- Nhật ký không nằm trong snapshot, nên digest, batch và `pnpm sim world` không đổi.

