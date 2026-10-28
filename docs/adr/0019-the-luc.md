# ADR 0019 — Thế lực: quan phủ, gia tộc, thương hội, băng cướp

- Trạng thái: **ĐÃ DUYỆT** (2026-10-28, chủ dự án đồng ý mọi khuyến nghị Q1–Q13 ở `docs/v0.6-giai-doan-a.md`).
- Ngày: 2026-10-28
- Liên quan: GDD 1.1 (trụ cột 3), 2, 3.2 B, D, F, G, I, 5 (v0.6), 10.4; ADR 0002, 0012, 0015, 0016, 0017, 0018

## Bối cảnh
- **GDD 3.2 I:** thế lực (gia tộc, làng/trấn tự quản, thương hội, băng cướp, quan phủ) có tài nguyên, nhân khẩu, lãnh thổ, thái độ; thịnh, suy, sáp nhập, diệt vong theo mô phỏng; tác động lên người chơi qua thuế, đường đi, an ninh, việc làm, tuyển người.
- **GDD 5 (v0.6):** "Chạy 50 năm không người chơi thì bản đồ thế lực thay đổi hợp lý."
- **GDD 10.4:** thế lực chạy theo quý.
- **Hiện trạng** (`docs/v0.6-giai-doan-a.md` mục 2):
  - quỹ quận gánh dân nền, chợ và vai quan phủ (thu thuế cố định); sự kiện quan sai, cướp đường dùng người vô danh; rủi ro đường chỉ theo địa hình;
  - gia tộc đã nảy từ v0.5: họ lớn nhất nắm 30–45% ruộng, 36–52% tiền của quận; dòng họ từ 4 người tăng lên 1–2 mỗi quận sau 50 năm;
  - 19–28% người lớn không ruộng; thương nhân 3–6 người mỗi trấn, thành.

## Phương án
| | A. Thế lực là thực thể có kho, người, đất; tính theo quý (khuyến nghị) | B. Thế lực chỉ là nhãn suy ra từ NPC mỗi lần cần | C. Thế lực như "dân nền" thứ hai, không có NPC thật |
|---|---|---|---|
| Cách làm | Trạng thái riêng mỗi thế lực (id, kho, người, đất, thái độ); pha Thế lực mỗi quý; NPC thuộc thế lực, có nghề mới | Tính gia tộc, thương hội từ NPC lúc đọc; không có kho, không có quyết định | Số người, kho trừu tượng mỗi thế lực, không gắn NPC |
| Ưu | Đúng GDD: có quyết định, thịnh suy, giao tranh; tác động được kinh tế, đường đi | Rẻ, không thêm trạng thái | Rẻ, dễ cân bằng |
| Nhược | Thêm trạng thái, sổ cái, schema; phải cân bằng | Không "tự phát triển": không có quyết định, không giao tranh | Trái trụ cột "cùng luật"; thế lực không có người thật để gặp |

## Quyết định: phương án A
- **Bốn loại** (Q1): quan phủ (một mỗi vùng, trị sở ở thành), gia tộc (suy từ dòng họ v0.5), thương hội (mỗi trấn, thành đủ thương nhân), băng cướp (lập trong năm khó). Quận là đất; "làng tự quản" để v0.7.
- **Trạng thái** (`sim/src/factions/`): `id` ("f" + số, không dùng lại), loại, tên (ghép từ nội dung), trị sở, đất (quận giữ; cướp giữ thêm cạnh đường), người (id NPC), kho tiền/lương (chỉ quan phủ, thương hội, cướp), thái độ thưa với thế lực khác, độ tham (quan phủ).
- **Pha Thế lực mỗi quý** (Q2): giữa pha Thế giới và pha NPC, luồng RNG `factions`, duyệt theo id. Mỗi quý: cập nhật người, kho, uy thế → lập, tàn, tách, nhập → quyết định (thu thuế, phát chẩn, tiễu phỉ, cướp, giữ đường) → đọ thế → đổi người giữ đất.
- **Tiền** (Q3): kho chuyển chứ không sinh. Sổ cái = quỹ quận + túi người chơi + túi NPC + kho thế lực, kiểm từng tick.
- **Gia tộc** (Q4): dòng theo đường cha ≥ 4 người lớn còn sống cùng quận, đủ ruộng hoặc tiền; trưởng họ; uy thế = ruộng + tiền + người; túi riêng, không kho chung.
- **Thương hội** (Q5): ăn phần lời của dòng lương giữa quận qua đường nó giữ; giữ đường thì rủi ro đường giảm; không nắm giá chợ.
- **Băng cướp** (Q6): lập trong năm khó ở quận xa trị sở hoặc giáp núi rừng, từ người không ruộng, nghèo; cướp kho làng, chặn đường, dụ người; tan khi tiễu thua hay dưới 3 người.
- **Quan phủ** (Q7): độ tham đổi khi thay quan; đặt thuế trong khoảng; phát chẩn; sai dịch; mất quận khi thua thế, lấy lại khi tiễu thắng.
- **Giao tranh** (Q8): đọ thế trừu tượng, một lần rút mỗi cặp mỗi quý; ba cặp: quan – cướp, gia tộc – cướp, gia tộc – gia tộc.
- **Nghề NPC mới** (Q9): `bandit`, `official`, cùng luật sống chết với mọi người.
- **Tác động lên người chơi** (Q10): qua luật có sẵn (thuế, rủi ro đường, trọng số an ninh, việc làm) và 8–12 sự kiện; chưa có hành động gia nhập.

## Hệ quả
- Snapshot thêm danh sách thế lực (vài chục mục) và nghề NPC mới: vài KB.
- Thuế, rủi ro đường, an ninh không còn là hằng số: cân bằng người chơi đổi; đo batch trên 3.000 đời khi đổi.
- Quỹ quận nhận ít thuế hơn: theo dõi "quỹ cạn" (ngưỡng 5%) từ S1.
- Pha Thế lực theo quý rẻ; hành vi cướp, sai dịch chạy trong pha NPC nên cần trả nợ hiệu năng tầng L1 trước (Q13).
- Bản đồ cần lớp "ai kiểm soát" (FE).

## Ghi chú khi làm
### Bước 0 (2026-10-28)
- **Hợp đồng v6** đúng bản nháp, trừ tên thế lực: `FactionName { key, params }` thay cho chuỗi (sim không tạo chuỗi hiển thị). Ghi ở ADR 0001.
- **Khung rỗng** `sim/src/factions/state.ts`: `FactionState`, `FactionWorldState { nextId, list }`, `factionMoney`, `controlOf`, `factionViews`, `factionPhase` (chỉ kiểm đầu quý). Gọi ở `Life.step` và `simulateWorld`, sau pha Thế giới, trước pha NPC. Sổ cái cộng kho thế lực ở cả hai chỗ.
- **Kết quả giữ nguyên:**
  - `world` 10 vùng × 100 năm: 3.069 NPC mất, tuổi 58,6, sổ cái lệch 0 vùng (như v0.5);
  - bench 2 vùng × 400 năm: chữ ký trùng khít trước khi thêm pha;
  - batch 6 × 1.000 đời: số liệu mọi chiến lược trùng v0.5;
  - digest pin đổi (luồng `factions`, trường snapshot mới); tuổi, nguyên nhân chết 51/52/42 giữ nguyên.
- **Chi phí pha rỗng:** không đo được, nằm trong nhiễu (bench 5.359 ms so với 5.240–5.437 ms trước).
- **Snapshot:** kho thế lực rỗng 22 byte, trạng thái luồng `factions` 43 byte; save mẫu tuổi 30 là 408 KB (phần `sim` 196 KB).
- **Nợ hiệu năng (Q13):**
  - Hồ sơ pha NPC tầng L1 phẳng (`stepL1` khoảng 87% thời gian thế giới), không có điểm nóng. Tối ưu vi mô (gom `monthOf`, `seasonOf`; chỉ mục trẻ sinh) dưới mức nhiễu, đã bỏ chỉ mục trẻ.
  - Sửa người chơi máy `family`: chỉ đọc danh sách người ở tuần cần; khóa xã giao đọc từ `NpcView.social`, bỏ `PolicyContext.socialLock`. `family` 80–95 s → 79,6 s, kết quả không đổi.
  - Batch mỗi chiến lược sau Bước 0: điều độ 74,8 s · lao lực 71,8 s · học giả 76,4 s · `family` 79,6 s · lang bạt 62,4 s · lười 28,9 s; tổng 6 phút 43 giây. **Chưa đạt ≤ 64 s** → theo Q13, chủ dự án quyết lại ngân sách trước S1.
- **Quyết định (chủ dự án, 2026-10-28): ngân sách batch nâng lên ≤ 90 s mỗi chiến lược.** Nợ hiệu năng v0.5 coi như đóng; từ S1 đo batch mỗi bước và so với số đo Bước 0 ở trên. Node (≤ 300 µs/tick) và trình duyệt (p95 ≤ 50 ms trên production) giữ nguyên.

### S1 (2026-10-28): khung thế lực, quan phủ
- **Trạng thái** thêm `relations` (thái độ thưa với thế lực khác, −100…100, theo id; chưa dùng tới S5). Dải thế cho người chơi tạm tính theo phần quận đang giữ (≥ 75% `dominant`, ≥ 40% `strong`, ≥ 15% `modest`); S5 đổi sang thế đọ được (Q8).
- **Quan phủ** (`sim/src/factions/government.ts`): lập cùng thế giới (`Life.create`, `simulateWorld`), id `f1`, trị sở ở thành (không có thành thì trấn đầu tiên, rồi quận 0), giữ mọi quận, tên `faction.government.name` theo tên trị sở.
- **Thuế (Q3):** quận ghi thuế thu trong quý (`CountyEconomy.taxMoney` từ thuế đinh, `taxGrain` từ thuế điền). Đầu quý, quan phủ lấy **50%** từ các quận nó giữ (không quá quỹ, kho đang có); số ghi mọi quận về 0.
- **Chi nha môn:** mỗi quý quan phủ chi **25%** kho (tiền và lương) vào quỹ, kho quận trị sở — lương quan lại, lính, sửa sang thành. Không có dòng ra này thì tiền, lương dồn mãi vào kho quan. S5 thay một phần bằng lương sai dịch, phát chẩn.
- **Đo:**
  - `world` 10 vùng × 100 năm: PASS. NPC chết đói 8,3% (Bước 0: 8,6%), quỹ cạn 2,2% (không đổi), đói kém mỗi quận 1 lần / 9,7 năm, sổ cái lệch 0 vùng; 152,8 µs/tick.
  - Kho quan phủ năm cuối 4.707–11.376 văn, 1.209–3.666 thăng lương; cao nhất mọi năm 12.366 văn = **0,04% tổng tiền vùng**.
  - Batch 6 × 1.000 đời: PASS. Điều độ 59,75 tuổi, chết đói 2,6%; `family` 59,27 tuổi, chết đói 3,1%, cưới 72,8%, có con 85,8%. Thời gian: điều độ 73,3 s · lao lực 70,5 s · học giả 75,3 s · `family` 77,9 s · lang bạt 61,3 s · lười 27,8 s — trong ngân sách 90 s.
  - Digest pin đổi; tuổi, nguyên nhân 51/52/42 giữ.
- **Phát hiện cho S5:** thuế hiện chỉ thu từ người có tên (vài trăm người mỗi vùng); dân nền (phần lớn miệng ăn) không nộp gì. Nên kho quan phủ quá mỏng để trả lương sai dịch hay phát chẩn đáng kể. S5 cần chốt nguồn thu từ dân nền (vd. thuế đinh dân nền lấy từ quỹ quận).

### S2 (2026-10-28): gia tộc
- **Tổ dòng cha** (`KinLinks.lineage`, mới): id người đầu dòng, truyền từ cha sang con lúc nhận cha (`adopt`); null là chính mình đầu dòng. Cần vì người mất bị dọn khỏi danh sách sau một năm: lần theo liên kết cha thì anh em có cha mất từ lâu thành hai dòng (đo thử: dòng có từ 3 nam trưởng thành ít đi 2–4 lần).
- **Gia tộc** (`sim/src/factions/clans.ts`), mỗi quý sau quan phủ, không rút RNG, duyệt theo id:
  1. **Người:** bỏ người đã mất; con có cha trong họ thì vào họ.
  2. **Tách:** người lớn của họ có quận nhà khác trị sở, đủ 4 người ở một quận → chi ấy thành họ riêng (cùng họ, tên theo quận mới), thái độ +50 với họ gốc.
  3. **Tàn:** người lớn ở quận trị sở dưới 3.
  4. **Nhập:** hai họ nhỏ (dưới 6 người lớn ở trị sở) cùng quận có người lấy nhau → họ ít người nhập vào họ đông hơn, thái độ +50.
  5. **Lập:** dòng cha chưa thuộc họ nào có từ **4 người lớn** cùng quận nhà, tổng ruộng của họ từ **20 mẫu** hoặc tổng tiền từ **20.000 văn**. Tên `faction.clan.name` (họ của trưởng họ, nơi).
  6. **Trưởng họ** là nam lớn tuổi nhất ở trị sở (không có nam thì người lớn tuổi nhất). **Uy thế** = tiền + ruộng × 1.000 + 2.000 mỗi người lớn ở trị sở. Họ uy thế cao nhất quận **đứng đầu** quận ấy.
- **Đứng đầu khác cai quản:** `counties` của gia tộc là quận nó đứng đầu. Bản đồ "ai kiểm soát" (`controlOf`) chỉ tính quan phủ và băng cướp; gia tộc cát cứ là S5 (Q7, Q8).
- **Khác ADR:** `FactionState` thêm `leader` (người cầm đầu), `power` (thế tính lại mỗi quý; gia tộc là uy thế). Dải thế gia tộc theo uy thế so với trung bình các họ trong vùng (≥ 2 lần `dominant`, ≥ 1 `strong`, ≥ 1/2 `modest`). `NpcView.faction` có từ S2. Thế lực tàn ở lại một năm rồi bị dọn.
- **Chỉnh ngưỡng** (`world` 10 vùng × 50 năm):

  | Lập / tàn | Còn sống mỗi vùng | Lập sau năm đầu / tàn | Vùng có cả lập lẫn tàn | Quận đổi họ đứng đầu |
  |---|---|---|---|---|
  | 4 / 2 (lần theo liên kết cha) | 0–16 | 104 / 18 | 10/10 | 17% |
  | 5 / 3, 30 mẫu, 30.000 văn | 0–7 | 39 / 2 | 2/10 | 3% |
  | **4 / 3, 20 mẫu, 20.000 văn (chọn)** | 0–14 | 119 / 36 | **10/10** | **21%** |

- **Đo với ngưỡng chọn:**
  - `world` 100 năm: tiêu chí v0.5 PASS, số liệu NPC trùng S1 (gia tộc không đổi luật NPC). Gia tộc: 298 lập, 175 tàn (gồm nhập), 15 chi tách; năm cuối 9–23 mỗi vùng; quận đổi họ đứng đầu 67%.
  - Batch 6 × 1.000 đời: PASS, số liệu trùng S1. Thời gian: điều độ 78,1 s · lao lực 75,5 s · học giả 80,7 s · `family` 83,6 s · lang bạt 66,0 s · lười 30,3 s — trong 90 s, chậm hơn S1 5–7%.
  - Digest pin đổi; tuổi, nguyên nhân 51/52/42 giữ.
- **Còn cách tiêu chí S8 (mục 6):**
  - mười năm đầu nhiều vùng chưa có gia tộc nào (dân số ban đầu chưa có dòng nhiều đời);
  - số gia tộc còn sống lên tới khoảng một mỗi quận, vùng 20 quận có 23 — "2–10 mỗi vùng" không theo cỡ vùng (8–20 quận). Đề xuất chốt lại ở S8 (vd. theo số quận).

### S3 (2026-10-28): thương hội
- **Lời buôn theo đường** (`EconomyState.tradeMargin`, mới): mỗi tháng, đường nào chở lương thì ghi lời của lái buôn = số lương × (giá quận đắt − giá quận rẻ − phí chở), theo quận mua. Trước S3 phần chênh này không ai nhận (quận đắt mua theo giá quận rẻ); chỉ ghi, không đổi tiền.
- **Thương hội** (`sim/src/factions/guilds.ts`), mỗi quý sau gia tộc, không rút RNG:
  1. **Hội viên:** thương nhân NPC còn sống có quận nhà ở trị sở. **Hội trưởng** là người giàu nhất. **Thế** = kho + túi hội viên.
  2. **Đường:** giữ mọi đường chạm trị sở. Đường nối hai trị sở thì hai hội cùng giữ, chia đôi phần lấy.
  3. **Thu:** **25%** lời buôn đã ghi trên đường mình giữ, lấy từ quỹ quận mua (không quá quỹ). Phần này đã trừ người áp tải, phu khuân: chỉ tốn khi có hàng đi.
  4. **Phí hội quán** 300 văn mỗi quý vào quỹ quận trị sở.
  5. **Chia lãi:** kho vượt mức giữ lại (20 quý phí = 6.000 văn) thì chia nửa phần vượt đều cho hội viên.
  6. **Tan:** hội viên dưới 2; hoặc **lỗ 20 quý liền** (thu dưới phí mà kho dưới mức giữ lại) và kho không đủ một quý phí. Kho còn lại chia hội viên, phần lẻ vào quỹ quận trị sở.
  7. **Lập:** trấn, thành có từ 3 thương nhân, chưa có thương hội (kể cả hội vừa tan còn trong danh sách một năm). Mỗi hội viên góp 1.000 văn vào kho.
- **Chỉnh khi làm** (đo 2 vùng × 100 năm):

  | Cách làm | Lập / tan | Tan vì lỗ | Lãi chia (văn) |
  |---|---|---|---|
  | Lấy 50%, phí 300 + 150/đường, lỗ = quý thu dưới phí, 8 quý | 101 / 95 | 94 | 11,5 triệu |
  | Lấy 25%, lỗ tính cả kho dưới mức giữ lại | 99 / 94 | 92 | 5,3 triệu |
  | + dự trữ 12 quý, góp vốn khi lập | 57 / 52 | 49 | 5,0 triệu |
  | + đường chung chia đôi, chờ một năm mới lập lại | 47 / 42 | 40 | 5,0 triệu |
  | **+ chỉ phí hội quán, dự trữ và lỗ 20 quý (chọn)** | 28 / 22 | 20 | 5,9 triệu |

  Lời buôn đến theo đợt: năm được mùa đều, giá các quận ngang nhau thì không ai chở; có đường im nhiều năm (71% số quý không có thu dù cả năm lãi gấp mười phí). Thương hội tan khi gặp quãng im dài.
- **Đo với cách chọn:**
  - `world` 100 năm: PASS. Thương hội còn sống 0–4 mỗi vùng; 91 lần lập, 64 lần tan. Vùng nhiều cạnh kề có hội lớn hơn (42 cạnh: 4 hội, 15 đường; 12 cạnh: 2 hội, 7 đường).
  - **Cân bằng NPC đổi:** NPC chết đói 8,3% → 5,6%; NPC nắm 22–30% tổng tiền năm cuối (S2: 15–33%), cao nhất mọi năm 32,4%; quỹ cạn 2,2% → 2,5%. Lãi chia làm thương nhân giàu lên; người thân của họ được giúp khi đói.
  - Batch 6 × 1.000 đời: PASS, người chơi gần như không đổi (điều độ 59,72 tuổi, chết đói 2,8%; `family` cưới 72,6%, có con 84,9%). Thời gian: điều độ 79,0 s · lao lực 76,4 s · học giả 81,6 s · `family` 84,9 s · lang bạt 66,5 s · lười 30,8 s — trong 90 s, còn khoảng 5 s cho `family`.
  - Digest pin đổi; tuổi, nguyên nhân 51/52/42 giữ.
- **Để S6:** "giữ đường giảm rủi ro" là tác động lên người chơi (Q10, S6: rủi ro đường theo cướp, thương hội); S3 mới có đường giữ (`FactionState.roads`).

### S4 (2026-10-28): băng cướp
- **Nghề `bandit`** (Q9): chỉ pha Thế lực đặt và gỡ. Ngày thường hái lượm (`action.forage`), không làm ruộng; sống bằng đồ cướp chia mỗi quý. Cùng luật ăn, bệnh, chết. Nội dung `occupation.bandit` ("Theo cướp").
- **Băng cướp** (`sim/src/factions/bandits.ts`), mỗi quý sau thương hội, RNG luồng `factions` (rút theo id người, rồi chỉ số quận):
  1. **Người:** bỏ người mất hay không còn nghề cướp.
  2. **Cướp kho làng:** đủ mỗi người ăn một quý (120 thăng) và 300 văn, lấy từ quận sào huyệt trước rồi quận kề, mỗi quận không quá 50‰ kho, quỹ.
  3. **Chia:** hết lương, nửa tiền, đều cho mỗi người.
  4. **Năm khó** ở quận sào huyệt (tai họa, đói kém, khan lương): mỗi người theo được quanh sào huyệt theo với 10% × hệ số tính cách. **Năm thường:** mỗi người bỏ về nghề cũ với 10%.
  5. **Tan:** dưới 3 người — người còn lại về nghề cũ, kho chia cho họ, phần lẻ về quận sào huyệt.
  6. **Đầu đảng:** người võ nghệ cao nhất. **Thế** = kho + mỗi người (2.000 + võ nghệ).
  7. **Lập:** quận năm khó, hợp làm sào huyệt — không phải trị sở quan phủ; không kề trị sở hoặc có đường núi (hệ số địa hình ≥ 200) — chưa có băng (kể cả băng vừa tan còn trong danh sách một năm). Có từ 3 người theo được thì nổi đảng với xác suất **15%** mỗi quý; người nóng nảy, xảo trá, tham theo trước, rồi người thường cho đủ ba.
- **Người theo được:** người lớn 16–50 tuổi đã ra riêng, không ruộng, túi dưới 2.000 văn, làm ruộng, làm thuê hay săn, quận nhà ở sào huyệt hay quận kề. Hệ số tính cách: nóng nảy, xảo trá, tham ×2; chính trực, hiền, trung tín, nhút nhát ×0; còn lại ×1.
- **Đường giữ:** mọi đường chạm sào huyệt. **Chưa cai quản quận:** `counties` rỗng; quan phủ vẫn giữ mọi quận (cát cứ, tiễu phỉ ở S5). Rủi ro đường cho người chơi ở S6.
- **Chỉnh khi làm:**
  - Bản đầu đòi mỗi người tự rút 10% và đủ ba người cùng rút trúng trong một quý: 0 băng trong 100 năm. Đo 2 vùng × 100 năm: 2.313 quý-quận năm khó, 1.520 ở nơi hợp làm sào huyệt, nhưng chỉ 572 người theo được (khoảng 0,4 người mỗi quận mỗi quý). Đổi sang: nổi đảng theo xác suất mỗi quận, lấy người cả quận kề, ngưỡng nghèo 1.000 → 2.000 văn.
  - Cướp quận sào huyệt trước (bản đầu cướp theo chỉ số quận, quận kề số nhỏ chịu hết).
- **Đo:**
  - `world` 10 vùng × 100 năm: PASS. Băng cướp 79 lập, 77 tan, đông nhất 9 người một vùng. **Người theo cướp trong 2 năm sau đói kém 1,0/năm, năm thường 0,4/năm: gấp 2,5 lần** (Q12: ≥ 1,5). NPC chết đói 6,0%; quỹ cạn 2,5%; sổ cái lệch 0 vùng.
  - Một lượt trước khi đổi thứ tự cướp có tsvl-09 dân số một quận làng 66% hạn mức (hạn mức 12 người, năm 74: 4 người mất vì bệnh, tai nạn trong 3 năm, quanh đó không có băng). So 20 vùng × 100 năm: có cướp 1 vùng tụt 66%, tắt cướp không vùng nào dưới 83%; NPC chết đói 5,7% so với 5,6%. Sau khi đổi thứ tự cướp, 10 vùng đều 83–130%. Tiêu chí dân số theo từng quận-năm mong manh với quận hạn mức nhỏ (một người ≈ 8 điểm).
  - Batch 6 × 1.000 đời: PASS. Điều độ 59,68 tuổi, chết đói 2,4%; `family` cưới 72,0%, có con 86,3%. Thời gian: điều độ 77,3 s · lao lực 74,8 s · học giả 79,9 s · `family` 83,2 s · lang bạt 64,9 s · lười 29,9 s.
  - Digest pin không đổi: ba đời mẫu không gặp băng cướp nào nên chưa rút luồng `factions`.

### S5 (2026-10-28): quan phủ sống
- **Thuế dân nền (chủ dự án chọn, 2026-10-28):** đầu năm mỗi quận quan phủ giữ nộp `7 + độ tham × 8 / 100` ‰ quỹ quận (quan thanh liêm nhất 0,7%, tham nhất 1,5%, trung bình khoảng 1%). Lý do: S1 cho thấy kho chỉ 0,04% tổng tiền vì dân nền không nộp gì.
- **Quan** (Q7): nhiệm kỳ 6–12 năm, mỗi quan rút độ tham 0–100 (luồng `factions`); từ 67 là quan tham, dưới 34 thanh liêm. Quan đầu tiên nhậm chức ở pha Thế lực đầu tiên.
- **Sai dịch** (nghề NPC `official`, Q9): một người cho trị sở cộng một mỗi 3 quận giữ, tối đa 6; tuyển ở quận trị sở từ người làm ruộng, làm thuê, săn 18–45 tuổi (biết chữ, có võ trước) khi kho đủ 4 quý lương cả đội; lương 900 văn mỗi quý; kho không đủ một quý thì cho nghỉ người tuyển sau cùng. Ngày thường nghỉ ở nhà theo luật hành động (việc quan). Người cầm đầu: sai dịch biết chữ nhất. Nội dung `occupation.official` ("Sai dịch").
- **Phát chẩn:** mỗi quận đói kém quan phủ giữ, quan phủ chi tới 20% kho × (100 − độ tham)% mua lương ở quận rẻ nhất mình giữ (không đói kém) chở sang.
- **Tiễu phỉ** (Q8): mỗi quý mỗi băng, đi tiễu với xác suất (1000 − 10 × độ tham)‰ nếu có sai dịch; phí 200 văn mỗi sai dịch vào quỹ trị sở. Thế quan phủ = mỗi sai dịch (2.000 + võ nghệ) + kho góp tới 20.000 văn; thế cướp ×2 nếu sào huyệt có đường núi. Rút một lần theo tỉ lệ thế.
  - **Thắng:** bắt nửa đảng (về nghề cũ), tịch thu kho cướp, lấy lại quận sào huyệt nếu cướp đã chiếm.
  - **Thua:** một sai dịch bỏ đi; cướp thế gấp đôi quan phủ thì chiếm quận sào huyệt.
- **Cát cứ của gia tộc** (Q7): họ đứng đầu một quận quan phủ giữ, uy thế vượt 4 lần **sức quan phủ ở quận** = uy 150.000 × (200 − độ tham)/200 + thế đọ được chia số quận giữ → chiếm quận; giữ tới khi tàn hay uy thế tụt dưới nửa ngưỡng.
- **Gia tộc giữ làng** (Q8): cướp tới quận có họ đứng đầu thì đọ uy thế họ với thế cướp; họ thắng thì quận ấy không mất gì, đảng mất một người.
- **Quan tham, dân oán:** xác suất nổi đảng và theo cướp × (100 + độ tham)%.
- **Người giữ quận** (`FactionState.holds`, mới): quận gia tộc, băng cướp cát cứ; quan phủ giữ mọi quận không ai cát cứ. `controlOf` đọc trường này.
- **Chưa làm:** gia tộc – gia tộc tranh ruộng (Q8 "hiếm"): họ đứng đầu đổi theo uy thế (S2), chưa có đọ thế riêng. Không ai chết trong giao tranh (bị bắt thì về nghề cũ), để không thêm nguyên nhân chết vào hợp đồng. Thuế đinh người có tên theo quan phủ (Q7: tới 300 văn) là tác động lên người chơi, để S6.
- **Chỉnh khi làm:** bản đầu đo sức quan phủ chỉ bằng thế đọ được chia số quận; kho phập phồng theo mùa thuế nên ngưỡng cát cứ dao động từng quý: quận đổi người giữ tới 15 lần trong 10 năm, ngoài quan phủ giữ 37–62% quận-năm. Thêm uy cố định mỗi quận, hệ số 8 → 4, giữ tới khi tụt dưới nửa ngưỡng, cướp phải thế gấp đôi mới chiếm: còn nhiều nhất 3 lần trong 10 năm, ngoài quan phủ giữ 0,6–23% quận-năm.
- **Đo:**
  - `world` 10 vùng × 100 năm: PASS.
    - **Quan tham: 0,5 người theo cướp/năm (306 năm); quan thanh liêm: 0,0 (333 năm).**
    - Tiễu phỉ 105 trận, thắng 79.
    - Quận đổi người giữ 186 lần, nhiều nhất 3 lần/10 năm ở một quận; không thế lực ngoài quan phủ nào giữ quá nửa vùng.
    - Kho quan phủ năm cuối 32–200 nghìn văn, 2–6 sai dịch.
    - Băng cướp 192 lập, 192 tan; sau đói kém gấp 3,2 lần năm thường.
    - NPC chết đói 5,1%; quỹ cạn 2,6%; **NPC nắm 20–44% tổng tiền năm cuối** (S4: 18–35%) — lương sai dịch, thuế lấy từ quỹ quận.
  - Batch 6 × 1.000 đời: PASS. Điều độ 59,65 tuổi, chết đói 2,5%; `family` cưới 71,7%, có con 84,1%. Thời gian: điều độ 77,2 s · lao lực 75,0 s · học giả 80,6 s · `family` 84,3 s · lang bạt 65,4 s · lười 30,4 s.
  - Digest pin đổi; tuổi, nguyên nhân 51/52/42 giữ.

### S6 (2026-10-28): tác động lên người chơi và NPC
- **Thuế theo quan phủ** (Q7): quận ghi mức thuế `CountyEconomy.taxPct`, pha Thế lực đặt mỗi quý (`setTaxRates`). Quận quan phủ giữ: `50 + độ tham` (%); quận cát cứ giữ lệ cũ 100.
  - Thuế đinh = 200 × mức → quan thanh liêm nhất 100 văn, tham nhất 300 văn; trung bình bằng lệ cũ.
  - Thuế điền = 10% × (100 + mức)/200 → 7,5–12,5%; áp cả phần thuế trên tô của nhà cho thuê ruộng.
  - Cùng luật cho người chơi và NPC (`headTax`, `harvestPlayer`). Nhật ký "nộp thuế" ghi số đã nộp.
- **Rủi ro đường** (Q5, Q6): hệ số mỗi đường theo người giữ (`roadRisk`): băng cướp giữ 200%, thương hội giữ 75%, cướp đè thương hội.
  - Rủi ro lộ trình = chặng nguy nhất theo địa hình × người giữ (`routeRiskPct`).
  - Dùng cho mức rủi ro xem trước chuyến đi và rủi ro thân thể mỗi ô đi đường của người chơi.
  - Đường băng cướp giữ ghi `TravelOption.danger` (hợp đồng v6 đã có).
  - Lộ trình vẫn là đường ngắn nhất, không tự né cướp. NPC không đi đường ở tầng L1 nên không chịu phần này.
- **An ninh** (Q10):
  - Sự kiện cướp đường: trọng số × hệ số người giữ đường của chuyến đi (đường cướp ×2, toàn đường thương hội ×0,75).
  - Mất trộm: ở sào huyệt hay quận kề sào huyệt một băng còn sống thì trọng số ×3.
  - Tiền nộp cướp đường vẫn vào quỹ quận như v0.5. Nối sự kiện cũ vào băng cướp thật là việc của S7.
- **Việc làm theo thương hội** (Q10):
  - Thương hội có kho từ mức giữ lại (20 quý phí) trở lên thì quý tới lương làm thuê ở trị sở bằng 125% (`CountyEconomy.wagePct`).
  - Quỹ quận trả lương, phần trả thêm ghi `wageBonus`; đầu quý thương hội hoàn lại cùng phí hội quán. Tiền chuyển chứ không sinh.
  - Quỹ quận không đủ lương 125% thì không có việc (`lock.no_work`), như v0.3.
- **Tin đồn thế lực** (Q10, `factions/news.ts`): so thế lực trước, sau pha quý. Quận kề quận đang đứng có băng cướp mới tụ, bị cướp hay họ lớn chiếm, được quan phủ lấy lại → tin đồn nghe sau một tháng (tin thường).
  - Quan mới nhậm chức: cả vùng nghe, kèm lời đồn tham, thanh liêm hay chưa rõ. Quan đầu tiên lúc dựng vùng không thành tin.
  - Chuyện ở chính quận đang đứng là tin thế sự (F3).
- **Đo:**
  - `world` 10 vùng × 100 năm: PASS. Sổ cái không lệch.
    - NPC chết đói 3,5% (S5: 5,1%); quỹ cạn 2,6%; NPC nắm 20,5–33,4% tổng tiền năm cuối (S5: 20–44%).
    - Quan tham 0,3 người theo cướp/năm, thanh liêm 0,0. Tiễu phỉ 101 trận, thắng 81. Người theo cướp sau đói kém gấp 2,1 lần năm thường.
    - **Một quận ở tsvl-03 đổi người giữ 4 lần trong 10 năm** (đích S8 ≤ 3; S5 nhiều nhất 3). Không thế lực ngoài quan phủ nào giữ quá nửa vùng.
  - Batch 6 × 1.000 đời: tiêu chí PASS. Điều độ 59,67 tuổi, chết đói 1,8%; `family` cưới 71,9%, có con 83,7%.
  - **Thời gian batch vượt trần trong lượt đo này:** điều độ 91,3 s · lao lực 86,0 s · học giả 99,2 s · `family` 92,8 s · lang bạt 77,3 s · lười 35,9 s (S5: 77,2 · 75,0 · 80,6 · 84,3 · 65,4 · 30,4).
    - Máy đo dao động mạnh: cùng buổi, bản v0.5 (commit `90c0aa7`) chạy "lười" 28,7 s rồi 33,1 s.
    - Chạy xen kẽ: S6 34,3 và 36,5 s, v0.5 33,1 s.
    - Profile CPU: mọi hàm mới của S6 cộng lại dưới 1%.
    - Cần đo lại trên máy rảnh trước khi kết luận (S8 đo hiệu năng).
  - Digest pin đổi. Đời 1, 2 giữ tuổi (51, 52). Đời 3 chết đói ở 41 thay vì 42: chỉ nghỉ, sống bằng của để dành, nên thuế theo quan làm cạn lương sớm hơn.

### S7 (2026-10-28): sự kiện thế lực
- **Chín sự kiện mới** (`events/defs/factions.ts`, Q10). Mỗi sự kiện gọi thế lực thật và người thật của nó; tiền, lương đi qua kho thế lực hay túi người ấy, sổ cái giữ.
  - **Bắt phu** (quan phủ giữ quận nhà, đàn ông 18–50, mùa khô tháng 11–2; trọng số × mức thuế): nộp gấp đôi thuế đinh vào kho quan phủ, dúi nửa số ấy cho sai dịch (thành theo độ tham), hay đi phu hai tuần.
  - **Lệ phí nha môn** (chỉ dưới quan tham): nộp 5% túi (30–500 văn) vào kho quan phủ, kêu nghèo (phúc duyên giúp được bớt nửa), hay đóng cửa (có thể ăn đòn).
  - **Phát chẩn** (quận đang đứng đói kém, quan phủ giữ và không tham, nhà sắp hết lương): xếp hàng lĩnh 6 đấu từ kho quận, lót 30 văn cho thư lại lĩnh 15 đấu, hay nhường suất (tiếng tốt).
  - **Người lạ rủ rê** (băng cướp với tới, người nghèo không ruộng đang túng): nhận 10 đấu từ kho băng, chỉ đường (tiếng xấu, dấu `bandit_helper`). Người xảo trá, tham lam nhận rồi báo quan lấy thưởng (lộ thì ăn đòn). Hoặc từ chối.
  - **Cướp về làng** (băng cướp với tới, nhà có thóc): giấu xuống hầm (mất 5%), chống lại (cần võ, hay có họ lớn giữ làng — họ cộng thêm phần thắng), hay mở kho (mất 20%). Thóc mất vào kho băng.
  - **Biết chỗ cướp ẩn:** báo quan; bắt được thì người bị tố rời băng, về nghề cũ, được thưởng 300 văn từ kho quan phủ; có thể bị băng chặn đánh. Hoặc im lặng.
  - **Đoàn buôn tìm người** (trấn có thương hội đủ kho): gánh thuê ba tuần (300 văn) hay áp tải (cần võ, 600 văn, có thể bị phục), tiền từ kho thương hội.
  - **Tranh bờ ruộng** (có từ 2 mẫu ở quận nhà, họ lớn đứng đầu quận nhà):
    - kiện lên phủ: 200 văn vào kho quan phủ; thắng (700 − 4 × độ tham)‰;
    - chuộc lại 500 văn vào túi trưởng họ;
    - hay nhường một mẫu cho trưởng họ.
  - **Họ lớn dạm hỏi** (người chưa vợ/chồng hợp tuổi trong họ đứng đầu quận): lễ ra mắt gấp bốn quà thăm hỏi; quen thân hơn mai mối thường.
- **Sáu sự kiện cũ nối vào thế lực thật:**
  - quan sai đòi thuế: là sai dịch thật; tiền nộp ghi vào thuế quận nên quan phủ lấy phần mình;
  - cướp đường: trên đường băng cướp giữ, kẻ chặn là người của băng; tiền, lương mất vào kho băng;
  - vay nặng lãi: trấn có thương hội đủ kho thì thương hội cho vay; nợ trả về kho hội (`HouseholdState.lender`, mới), hội tan thì về quận nhà;
  - tăng tô: chủ đất là trưởng họ đứng đầu quận có ruộng; quà biếu vào túi người ấy;
  - thương lái: là hội viên thương hội thì kể người của hội;
  - hội làng: họ đứng đầu làng mở hội, trưởng họ thay ông trùm; tiền hội vẫn vào quỹ làng.
- **Chưa làm:** tô vẫn vào kho quận như v0.3 (chưa vào kho trưởng họ). Người chơi chưa theo hẳn băng cướp, chưa làm sai dịch (v0.7).
- **Đo:**
  - Batch 6 × 1.000 đời: PASS.
    - **Sự kiện 2,78/năm** (S6: 2,61; mục tiêu 2–4); mọi sự kiện đều xảy ra.
    - Điều độ 59,83 tuổi, chết đói 1,7%; `family` cưới 71,7%, có con 83,8%.
    - Thời gian lượt này: điều độ 84,6 s · lao lực 93,6 s · học giả 95,5 s · `family` 95,6 s · lang bạt 78,9 s · lười 32,9 s (máy vẫn dao động, xem S6).
  - Số lần mỗi sự kiện mới trong 1.000 đời lang bạt / `family`:

    | Sự kiện | Lang bạt | `family` |
    |---|---:|---:|
    | Bắt phu | 1.024 | 1.349 |
    | Lệ phí nha môn | 255 | 3.501 |
    | Phát chẩn | 282 | 77 |
    | Người lạ rủ rê | 27 | 1 |
    | Cướp về làng | 146 | 322 |
    | Biết chỗ cướp ẩn | 123 | 165 |
    | Đoàn buôn tìm người | 1.313 | 1.894 |
    | Tranh bờ ruộng | 123 | 1.421 |
    | Họ lớn dạm hỏi | 131 | 1 |

    Người lạ rủ rê, họ lớn dạm hỏi hiếm vì cần người chơi nghèo không ruộng gần sào huyệt, hay còn độc thân ở làng có họ lớn.
  - `world` 10 vùng × 100 năm: PASS, kết quả trùng từng số với S6 (sự kiện chỉ chạy trong đời người chơi; thế giới tự chạy không có người chơi).
  - Digest pin: đời mẫu (chọn lựa chọn đầu) gặp lệ phí, bắt phu, phát chẩn; tuổi chết đói 51 → 49, 52 → 53, 41 giữ; cùng nguyên nhân.

### S8 (2026-10-28): tiêu chí bản đồ thế lực, chỉnh, hiệu năng
- **`pnpm sim world` thêm tiêu chí bản đồ thế lực** (mục 6, Q12), vào kết quả PASS/FAIL khi lượt từ 50 năm. Sim ghi chuỗi theo năm (`WorldRunStats.yearly`: số gia tộc, thương hội, băng cướp, có quan phủ, đường thương hội giữ) và số đo chụp ở năm 50 (`at50`).
  - **Sống** (50 năm đầu, từ năm 10): mỗi vùng luôn có quan phủ; gia tộc 2–10 mỗi vùng mọi năm; băng cướp 0–4 mọi năm; thương hội 1–4 ở ≥ 95% vùng-năm.
  - **Đổi:** mỗi vùng có quận đổi người giữ (50 năm). Mỗi vùng có gia tộc lập và tàn; họ đứng đầu đổi ở ≥ 30% số quận — hai mục này đo trên cả lượt.
  - **Không hỗn loạn** (50 năm): mỗi quận đổi người giữ ≤ 3 lần/10 năm; thế lực ngoài quan phủ giữ quá nửa vùng ≤ 10 năm liền.
  - **Có nguyên nhân** (cả lượt): người theo cướp sau đói kém ≥ 1,5 lần năm thường; quan tham nhiều cướp hơn quan thanh liêm; nửa số vùng nhiều cạnh kề có thương hội giữ nhiều đường hơn.
- **Quyết định của chủ dự án (2026-10-28):**
  - **Dựng sẵn dòng họ lúc dựng vùng** (`seedLineage` trong `seedFamilies`).
    - Đo trước: gia tộc suy từ dòng cha nên 17–23 năm đầu không vùng nào có gia tộc (năm 10: 8/10 vùng không có).
    - Mỗi quận, người nam đã ra riêng nhiều ruộng nhất 45–75 tuổi nhận làm con những người lớn chưa có cha, hợp tuổi (cha 20–55 tuổi lúc sinh): tối đa 3 con trai, 2 con gái; con trai mang họ cha, cháu nội theo; cả dòng chung tổ.
    - Chỉ dựng khi dòng đủ người lớn để lập gia tộc. Không thêm người, không đổi tuổi, hôn nhân, của cải.
    - Đã thử trước "người cùng họ cùng quận chung một dòng": không tác dụng, vì mỗi quận ban đầu có 8–10 họ, hiếm họ nào đủ người, đủ của.
  - **Ngưỡng lập gia tộc 4 → 5 người lớn** (`CLAN_MIN_ADULTS`); ngưỡng họ nhỏ 6 → 7 (`CLAN_SMALL_ADULTS`, giữ hai bậc trên ngưỡng lập).
    - Với 4: năm vùng vượt mười gia tộc (83% vùng-năm trong khoảng), họ đứng đầu đổi 21% trong 50 năm.
    - Với 5: 100% vùng-năm trong 2–9, nhưng đổi họ chỉ 6% trong 50 năm.
    - Chủ dự án chọn ngưỡng 5 và đo "đổi họ đứng đầu", "lập và tàn" trên 100 năm, vì dòng họ đổi theo thế hệ.
  - **"Có nguyên nhân" đo trên cả lượt:** 50 năm chỉ có 0,1–0,3 người theo cướp mỗi năm mỗi vùng; tỉ lệ sau đói kém dao động 0,7–2,1 giữa các lượt.
  - **Thương hội lập từ 2 thương nhân** (3 → 2, bằng ngưỡng tan); tiêu chí ≥ 95% vùng-năm. Với 3, có vùng một phần tư số năm không có hội nào.
  - Đã thử, không giữ: nới ngưỡng họ nhỏ 8/10/14 (gần như không đổi gì: hai họ nhỏ cùng quận thông gia rất hiếm); nâng ngưỡng lập lên 5–6 khi chưa dựng sẵn dòng họ (đổi họ còn 1–6%).
- **Batch thêm số đo đường:** tuần đi đường và số lần gặp cướp đường, tách đường băng cướp giữ (`LifeResult.roadWeeks`, `robbed`). Tiêu chí: lang bạt gặp cướp trên đường cướp giữ nhiều hơn đường khác.
- **Hiệu năng:**
  - Tối ưu giữ nguyên kết quả (digest pin, `world` trùng từng số):
    - bước lập gia tộc bỏ trước dòng chưa đủ người;
    - thương hội gom thương nhân theo quận một lần mỗi quý;
    - đời người chơi chỉ tính rủi ro đường khi tuần ấy đi đường;
    - hàm tra thế lực của sự kiện tìm thẳng, không dựng mảng.
  - **Đo xen kẽ với v0.5 (commit `90c0aa7`) trên cùng máy, chiến lược điều độ 1.000 đời:** v0.6 79,6 s và 95,2 s; v0.5 79,1 s và 84,0 s. v0.6 chậm hơn khoảng 1–13% (trung bình 7%).
    - Máy dao động mạnh: v0.5 lúc đóng phiên bản đo 74 s; buổi này 75–85 s.
    - Trước tối ưu, cùng cách đo: v0.6 97–102 s, v0.5 75–85 s. Profile: pha gia tộc khoảng 2,6% CPU (nhiều gia tộc hơn từ khi dựng sẵn dòng họ).
  - Node `world` 192–200 µs/tick trung bình mười vùng (ngân sách 300); vùng 20 quận (tsvl-03) 337 µs/tick.
- **Đo:**
  - `world` 10 vùng × 100 năm: **PASS** (dân số, gia đình, sổ cái, kinh tế, bản đồ thế lực).
    - Gia tộc 2–9 mỗi vùng mọi năm từ năm 10 trong 50 năm đầu; thương hội 97,6% vùng-năm; băng cướp 0–2.
    - Đổi họ đứng đầu 40% quận (100 năm); 10/10 vùng có gia tộc lập và tàn, có quận đổi người giữ.
    - Một quận đổi người giữ nhiều nhất 2 lần/10 năm; không thế lực ngoài quan phủ nào giữ quá nửa vùng.
    - Cướp sau đói kém gấp 1,7 lần năm thường; quan tham 0,26 người theo cướp/năm, thanh liêm 0,02; vùng nhiều cạnh kề thương hội giữ nhiều đường hơn.
    - NPC chết đói 2,9%; NPC nắm 20,8–36,6% tổng tiền năm cuối.
  - Batch 6 × 1.000 đời: **PASS**.
    - Điều độ 59,55 tuổi, chết đói 1,9%; `family` cưới 71,2%, có con 83,2%; sự kiện 2,77/năm.
    - **Lang bạt gặp cướp 75,8‰ tuần trên đường băng cướp giữ, 19,0‰ trên đường khác.**
    - Thời gian lượt này: điều độ 91,8 s · lao lực 88,3 s · học giả 93,8 s · `family` 92,3 s · lang bạt 77,5 s · lười 36,3 s (trước tối ưu, máy dao động).
  - Digest pin: dòng họ dựng sẵn đổi luồng `npc-world`, tên, cha của người lớn ban đầu. Đời 1 chết đói 49 → 51; đời 2, 3 giữ tuổi; cùng nguyên nhân.
- **Còn lại:**
  - Hiệu năng batch chưa đo được sạch trên máy này; cần đo lại khi máy rảnh trước nghiệm thu v0.6.
  - Trình duyệt +1 năm p95 đo ở F5.

### F1 (2026-10-28): lớp "ai kiểm soát" trên bản đồ
- **Nơi xem:** nút "Bản đồ thế lực" ở màn đời mở hộp thoại "Thế cục" (bản đồ vùng có lớp thế lực, dòng "Nơi này do … giữ", lời giải thích màu). Hộp thoại đi đường có ô bật lớp (mặc định tắt). Khóa khi có sự kiện chờ chọn, như các nút khác.
- **Màu theo người giữ quận** (`STATE.control`):
  - quan phủ màu son nhạt (độ đậm 40/255), để quận cát cứ nổi lên;
  - gia tộc cát cứ theo bảng sáu màu mực, gán theo id (110/255);
  - băng cướp đỏ thẫm (120/255);
  - quận chưa ai giữ không tô.
  - Ảnh mỗi ô một điểm ảnh, đặt dưới ranh giới quận.
- **Đường:** đường băng cướp giữ nét đỏ đứt; đường thương hội giữ (không có cướp) nét chấm vàng đất. Vẽ thẳng giữa hai trị sở quận (hợp đồng `FactionView.roads`, ADR 0001).
- **Chú giải** góc dưới bản đồ: người giữ đất (màu, tên, số quận) theo thứ tự quan phủ, gia tộc, băng cướp; hai loại đường nếu có.
- Phần thuần ở `apps/game/src/map/control.ts` (màu, chú giải, đường, điểm ảnh), có test; phần vẽ ở `MapView`.
- **Xem trên trình duyệt (dev):**
  - năm đầu một người giữ (nha môn, 14 quận);
  - năm 13 có đường thương hội giữ, nút bật lớp ở hộp thoại đi đường chạy đúng, không lỗi console.
  - Chưa thấy quận cát cứ, đường cướp trong lượt xem (hiếm trong 13 năm đầu); nét đường cướp kiểm bằng chèn tạm một đoạn vào lớp SVG. Ảnh nghiệm thu hai khổ ở F5.

### F2 (2026-10-28): khối "Thế lực ở {nơi}"
- **Khối ở cột phải màn đời**, dưới chợ. Thế lực đặt chân ở quận đang đứng (`apps/game/src/app/factions.ts`):
  - quan phủ luôn có mặt: giữ đất này, hay đã mất đất này khi quận bị cát cứ;
  - gia tộc đứng đầu quận hay có nhà thờ họ (trị sở) ở đây;
  - thương hội có hội quán ở đây;
  - băng cướp có sào huyệt ở đây, hay giữ đường qua đây (`FactionView.roads`).
  - Thứ tự: quan phủ, gia tộc (họ đứng đầu trước), thương hội, băng cướp; trong loại theo id. Mỗi dòng: triện theo loại, tên, vai với nơi này, loại, dải thế.
- **Xem nhanh** (bấm một dòng): loại, người cầm đầu, thế, số người, trị sở, đất, số đường giữ, thái độ với mình, một câu giới thiệu loại thế lực.
  - Người cầm đầu: tìm trong người ở quận đang đứng rồi người quen; không thấy thì "không ở quanh đây".
  - Gia tộc ghi quận nó đứng đầu, các loại khác ghi số quận giữ.
  - Thái độ v0.6 chưa gửi: "chưa rõ" (v0.7).
- **Người trong quận, người thân ghi thế lực** (`NpcView.faction`): người họ …, hội viên thương hội, sai dịch nha môn, người của đảng cướp — trên dòng và trong thẻ xem nhanh.
- **Xem trên trình duyệt (dev),** đời sinh ở thành Linh Kinh, năm 2:
  - khối có nha môn (giữ đất, nha môn đặt ở đây) và họ Chu (đứng đầu, nhà thờ họ ở đây; có ngay năm đầu nhờ dòng họ dựng sẵn, S8);
  - thẻ xem nhanh họ Chu: trưởng họ Chu Phúc, 6 người;
  - cha của nhân vật ghi "Người họ Chu";
  - không lỗi console, phím Esc đóng thẻ.

### F3 (2026-10-28): tin thế sự trong biên niên, lọc "Thế sự", đường có cướp
- **Tin thế sự ở chính quận đang đứng** (sim, `factionNews` trong `factions/news.ts`): so thế lực trước và sau pha quý; ghi vào biên niên ngay. Tin đồn từ quận kề vẫn như S6.
  - Việc lớn (ngắt tua): băng cướp tụ lại có sào huyệt ở đây; quận bị cướp chiếm, bị họ lớn cát cứ; quan phủ lấy lại.
  - Việc thường: họ lớn, thương hội lập hay tàn ở đây; băng cướp tan; quan phủ tiễu phỉ một băng có sào huyệt ở đây hay quận kề, thắng hay thua.
  - `GovernmentReport.battles` mới: từng trận tiễu phỉ (băng, sào huyệt, thắng hay thua). Không đổi luật: digest pin giữ.
- **Lọc "Thế sự"** trong biên niên, cùng hàng "Tất cả", "Chuyện lớn", "Người quanh mình". Không gập. Gồm:
  - tin thế sự (`log.faction.*`);
  - tin đồn thế lực (cướp tụ, chiếm quận, quan phủ lấy lại, quan mới);
  - kết quả chín sự kiện thế lực (S7).
  - Triện: cướp đỏ 匪, quan phủ mực 官, còn lại vàng đất 勢.
- **Bản đồ di chuyển ghi đường có cướp:**
  - đường băng cướp giữ luôn vẽ nét đỏ đứt, kể cả khi tắt lớp thế lực; nét dày hơn F1;
  - điểm đến có đường đi qua đường cướp giữ (`TravelOption.danger`) mang nhãn "có cướp";
  - xem trước chuyến đi thì ghi đường qua chỗ băng nào chặn.
- **Xem trên trình duyệt (dev),** đời ở Linh Kinh tới năm 13:
  - tab "Thế sự" hiện câu báo trống lúc chưa có gì, rồi tin đồn quan mới (năm 9);
  - hộp thoại đi đường mở bình thường, không lỗi console.
  - Chưa thấy nhãn "có cướp", đường đỏ, tin cướp ở đây trong lượt xem (vùng chưa có băng nào); dữ liệu có test.

### F4 (2026-10-28): "Thế sự một đời" trong tổng kết
- **Sim ghi thế lực đã thấy** (`factions/seen.ts`, snapshot `factionsSeen`).
  - Đầu quý, sau pha Thế lực, thế lực còn sống đặt chân ở quận đang đứng mà chưa thấy thì ghi lại. "Đặt chân" như khối F2: trị sở, đứng đầu, giữ hay cát cứ quận; băng cướp giữ đường qua đây; quan phủ luôn thấy.
  - Thế lực đã thấy được theo tới khi tan, dù người chơi ở đâu.
  - Thước đo thịnh suy: quan phủ theo số quận giữ; gia tộc, thương hội theo thế; băng cướp theo số người. Ghi lúc thấy lần đầu và lần gần nhất còn sống.
- **Số phận** (`LifeSummary.legacy.factions`, hợp đồng v6 đã có):
  - tan thì "tan rã";
  - thước đo lên từ gấp rưỡi thì "thịnh lên";
  - xuống còn hai phần ba trở xuống thì "suy đi";
  - còn lại "vẫn đứng".
- **Màn tổng kết:**
  - tab "Thế sự" (tiêu đề "Thế sự một đời"): mỗi thế lực một dòng — số phận, triện theo loại, tên, loại; xếp tan rã, thịnh lên, suy đi, vẫn đứng; cùng số phận theo thứ tự thấy;
  - bia đời thêm dòng "Thế sự một đời: {n} thế lực, {k} đã tan".
  - Bốn tab chung một hàng: chữ trong nút không ngắt; cột hẹp (dưới khoảng 1.000 px) thì hàng tab xuống dòng.
- Digest pin đổi (snapshot có `factionsSeen`); tuổi, nguyên nhân giữ.
- **Xem trên trình duyệt (dev),** hai đời chết đói lúc 17 và 21 tuổi:
  - tab hiện đúng: Họ Ngô, Thương hội Đan Đô thịnh lên, Nha môn Đan Đô vẫn đứng; đời sau có hai thương hội Lam Đô tan rã rồi lập lại;
  - ở khổ 1280 px bốn tab một hàng.
- **Save dev cũ của v0.6** (trước F4) bị từ chối với lỗi schema ("thiếu factionsSeen"), không phải lời báo save bản cũ. Snapshot đổi hình nhiều lần trong v0.6 mà `SIM_VERSION` vẫn 0.6.0; xử lý ở F5 hay lúc đóng v0.6.

### F5 (2026-10-28): nghiệm thu trên trình duyệt
- **Ảnh nghiệm thu** (`docs/nghiem-thu/v0.6/`, khổ 1280×800 và 1920×1080, Chrome headless, dev server). Đời thật tsvl-01, sinh ở thành Vị Kinh, làm thuê, hái lượm từ 12 tuổi.
  - Màn chính.
  - Khối "Thế lực ở Vị Kinh" (F2): nha môn giữ đất, nha môn đặt ở đây; thương hội có hội quán; cha là hội viên thương hội.
  - Xem nhanh thương hội.
  - Bản đồ thế lực (F1): năm 17 tuổi có băng cướp sào huyệt Đông Thành giữ năm đường, nét đỏ; ba đường thương hội nét chấm.
  - Bản đồ di chuyển bật lớp (F1, F3): Đông Thành mang nhãn "có cướp"; xem trước ghi "Đường đi qua chỗ Đảng cướp Đông Thành chặn", rủi ro cao.
  - Biên niên lọc "Thế sự" (F3).
  - Tổng kết "Thế sự một đời" (F4): thương hội thịnh lên, nha môn vẫn đứng; đời sống 37 năm, chết đói.
  - Console không có lỗi ở cả hai khổ; trang vừa khung (không cuộn ngang).
  - Sửa khi chụp: thẻ xem nhanh của thương hội ghi "Đất: giữ 1 quận" (quận của thương hội trong dữ liệu là quận hội quán) — bỏ dòng "Đất" cho thương hội.
- **Save trình duyệt có thế lực** (`docs/nghiem-thu/v0.6/browser-save.json`, năm 18 của đời trên):
  - nội dung: 6 thế lực (quan phủ, 2 gia tộc, 2 thương hội, 1 băng cướp), 165 NPC;
  - 60 lệnh: 37 `ADVANCE`, 11 `CHOOSE`, 10 `TRADE`, 1 `SET_PLAN`, 1 `NEW_LIFE`.
  - Phát lại bằng `pnpm sim replay --save docs/nghiem-thu/v0.6/browser-save.json`: **PASS**, digest `8870c333c1120400`. Lúc đóng phiên bản (`SIM_VERSION` 0.6.1) xuất lại cùng đời: **PASS**, digest `11ab9fce9b55dc56`.
- **+1 năm trên bản production** (`vite preview`, Chrome headless 1920×1080, tsvl-01 · Phố Kỳ, 57 lần bấm không bị sự kiện ngắt mỗi lượt; đo như v0.5):

  | Lượt | Trung bình | p95 | Chậm nhất |
  |---|---:|---:|---:|
  | 1 | 19,8 ms | 30,3 ms | 37,8 ms |
  | 2 | 30,6 ms | **51,0 ms** | 58,2 ms |
  | 3 | 19,2 ms | 29,0 ms | 29,7 ms |
  | 4 | 29,4 ms | 49,0 ms | 54,5 ms |
  | 5 | 30,1 ms | 49,9 ms | 68,1 ms |

  - Ngân sách: p95 ≤ 50 ms trên production. **Bốn trên năm lượt đạt**; lượt 2 vượt 1 ms.
  - Các lượt chia hai nhóm (trung bình khoảng 19 ms và khoảng 30 ms), như máy dao động đã thấy ở batch (S6, S8).
  - v0.5 (cùng cách đo): trung bình 16,5–24,4 ms, p95 24,1–53,8 ms.
  - Lượt 3 và 5 lần đầu dừng vì lỗi ở script đo (Node thoát trước khi đo, không có lỗi console của game); chạy lại hai lượt ấy, số trong bảng là lần chạy lại.
- **Còn mở:** snapshot đổi hình nhiều lần trong v0.6 mà `SIM_VERSION` vẫn 0.6.0. Save dev trước F4 bị từ chối bằng lỗi schema thay vì lời báo save bản cũ. Save v0.5 vẫn bị từ chối đúng bằng `SAVE_VERSION`. Đề xuất tăng `SIM_VERSION` lúc đóng v0.6.

