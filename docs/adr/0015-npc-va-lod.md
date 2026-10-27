# ADR 0015 — NPC và mức chi tiết mô phỏng (LOD)

- Trạng thái: **ĐÃ DUYỆT** (2026-10-27, chủ dự án đồng ý mọi khuyến nghị Q1–Q11 ở `docs/v0.4-giai-doan-a.md`; liên quan Q2, Q3, Q9)
- Ngày: 2026-10-27
- Liên quan: GDD 1.1, 3.2 B, 3.2 G, 10.4; ADR 0003, 0005, 0008, 0012, 0013, 0014

## Bối cảnh
- GDD 3.2 G: NPC sinh ra, lớn lên, làm việc, già đi, chết **khi người chơi không để ý**. GDD 1.1: NPC và người chơi dùng **cùng luật**.
- GDD 3.2 B, 10.4: NPC gần người chơi mô phỏng đầy đủ, NPC xa rút gọn. Rủi ro đã ghi: NPC đi qua ranh giới LOD không được đổi kết cục có hệ thống.
- Hiện trạng (đo 2026-10-27, Node, tsvl-01):
  - Đời người chơi tốn **30 µs/tick**.
  - Chạy luật tuần (bệnh, tai nạn, ăn, hồi sức, hậu quả) cho N nhân vật: **≈ 1 µs/người/tuần**. 150 người: 183 µs/tick; 400 người: 371 µs/tick.
  - Một `CharacterState` ≈ 806 byte JSON.
  - Batch v0.3 (5 × 1.000 đời) chạy ≈ 107 s.
- Hệ quả của số đo:
  - Chơi trên trình duyệt **không** cần LOD: +1 năm với 400 NPC tuần đầy đủ chỉ ≈ 14 ms.
  - Batch cân bằng thì cần: không có LOD, batch chậm 6–12 lần (hơn 10 phút). LOD trước hết để giữ công cụ cân bằng dùng được.

## Phương án
| | A. Nhân vật đầy đủ, hai tầng (khuyến nghị) | B. Bản ghi rút gọn theo bảng sống | C. Mọi NPC tuần đầy đủ |
|---|---|---|---|
| Cách làm | NPC là `CharacterState` như người chơi. **L0** (cùng quận với người chơi): mỗi tuần, đúng luật người chơi. **L1** (quận khác): đầu mỗi tháng gộp ba tuần, cùng hàm luật, xác suất quy ra ba tuần | NPC chỉ có tuổi, nghề, dải sức khỏe; chết theo bảng tỉ lệ tử theo tuổi | Không có tầng |
| Ưu | Cùng luật; người chơi tới gần thì NPC "thật" ngay, không phải sinh chi tiết | Rẻ nhất | Đơn giản, đúng luật tuyệt đối |
| Nhược | Phải chứng minh L1 tương đương L0 bằng thống kê | Trái "cùng luật"; NPC gần người chơi trông giả; đổi tầng phải bịa trạng thái | Batch chậm 6–12 lần; trái GDD "LOD ngay từ v0.4" |

## Quyết định (phương án A)

### Trạng thái
- `NpcState`:
  - `id` ổn định (`n1`, `n2`… theo thứ tự sinh, không dùng lại);
  - `character: CharacterState` (dùng lại nguyên kiểu của người chơi);
  - `occupation` (ADR 0016);
  - `tier: 'L0' | 'L1'`;
  - `rng: RngState` riêng;
  - `diedTick` (null khi còn sống).
- NPC chết ở lại trong danh sách thêm một năm (cho sự kiện đám ma, tin tức), rồi bị dọn khỏi snapshot.
- Snapshot sắp NPC theo `id`; mọi vòng lặp duyệt theo `id`. Không lặp `Map`, `Set` không sắp (luật tất định).

### RNG
- Mỗi NPC một luồng riêng, seed = `hash32(lifeRoot, 'npc', id)`. Lưu trạng thái trong `NpcState.rng`.
- Hệ quả:
  - thêm, bớt NPC, hay người chơi làm gì, đều không làm lệch số ngẫu nhiên của NPC khác;
  - hai NPC chỉ ảnh hưởng nhau qua trạng thái chung: chợ, quỹ quận, sự kiện.
- Luồng của người chơi (ADR 0003) không đổi.

### Thứ tự trong tick (GDD 3.2 B)
- Thế giới (thời tiết, chợ tháng) → *thế lực: chưa có* → **NPC** → sự kiện → người chơi → hậu quả của người chơi.
- NPC chạy trước người chơi, theo `id`. Ăn uống, hậu quả của NPC nằm trong lượt của NPC.

### Tầng L0 — mỗi tuần, đúng luật người chơi
- Một ô hành động theo kế hoạch tháng do **bộ não nhu cầu** của NPC xếp (ADR 0016):
  - cùng `ACTIONS`;
  - cùng giá thể lực, rủi ro, tiền;
  - cùng thu nhập từ quỹ quận.
- Sau đó: bệnh, tai nạn (`eventsPhase`), ăn (`feedPhase`, mua ở chợ quận đang đứng), hồi sức, hậu quả (`consequencesPhase`), lão hóa đầu năm.
- NPC **không** nhận sự kiện có lựa chọn: lựa chọn là của người chơi. Sự kiện của người chơi có thể nhắc tới, hay tác động lên, NPC (ADR 0016).

### Tầng L1 — đầu mỗi tháng, gộp ba tuần
- Thu nhập, chi phí của ba ô theo kế hoạch tháng, tính một lần.
- Bệnh, tai nạn: một lần rút với xác suất quy ra ba tuần, `1 − (1 − p)³` tính bằng số nguyên. Ngày phát nằm trong tháng.
- Ăn ba khẩu phần; bộ đếm đói cập nhật như ba tuần liền.
- Hồi sức, hồi sức khỏe, mất sức khỏe vì đói: ba tuần.
- Hàm luật dùng chung với L0. Chỉ thêm tham số "số tuần" cho các hàm có xác suất hoặc cộng dồn, không viết luật thứ hai.

### Đổi tầng
- Chỉ ở **đầu tháng**, theo quận người chơi đang đứng lúc đó. Quận đó lên L0, mọi quận khác về L1.
- Người chơi tới quận mới giữa tháng: NPC ở đó vẫn L1 tới hết tháng, vì kết quả tháng đã tính. Giao diện vẫn hiện họ, theo trạng thái đầu tháng.
- Đổi tầng không sinh, không xóa dữ liệu: cả hai tầng dùng cùng `CharacterState`.

### Tương đương (bắt buộc, test)
- Một đoàn 2.000 NPC giống hệt nhau chạy 100 năm hai lần, một lần toàn L0, một lần toàn L1. Phải đạt:
  - tuổi thọ trung bình lệch ≤ 1 năm;
  - tỉ lệ từng nguyên nhân chết lệch ≤ 3 điểm phần trăm;
  - chết đói lệch ≤ 2 điểm.
- Một đoàn chạy với người chơi máy "lang bạt" (đổi quận liên tục, NPC đổi tầng nhiều lần) so với "điều độ" (ít đổi tầng): tuổi thọ trung bình NPC lệch ≤ 1 năm.

### Hiệu năng (Q9)
- Đo trong Node, cùng máy với số đo ở trên:
  - trung bình ≤ ~~100~~ **300 µs/tick** khi đủ hạn mức NPC, tức khoảng 1 µs mỗi NPC mỗi tuần (nới ở S7, xem ghi chú S7);
  - batch 5 × 1.000 đời ≤ 3 lần thời gian v0.3 (≈ 5 phút).
- Trình duyệt: +1 năm ≤ 50 ms.
- `pnpm sim life` in thêm µs/tick tách người chơi và NPC.

## Hệ quả
- Snapshot thêm ≈ 0,8 KB mỗi NPC (≈ 110–240 KB với 130–300 NPC). Save vẫn dưới 400 KB. Digest phủ cả NPC.
- `SIM_VERSION` 0.4.0. Save v0.3 bị từ chối, không chuyển đổi (như v0.3 Q9).
- Hàm luật có xác suất phải nhận "số tuần" (1 hoặc 3). Có test L0 = L1 khi số tuần là 1.
- Người chơi tới quận khác thấy NPC "thật" ngay, vì đó vẫn là một người đã sống từng tháng, không phải người được sinh lại.
- Mở đường cho v0.5 (quan hệ gắn vào `id`) và v0.6 (thế lực chạy giữa "thế giới" và "NPC").

## Ghi chú triển khai Bước 0 (2026-10-27)
- **Mã:**
  - `packages/sim/src/npc/state.ts`: `NpcState`, `NpcWorldState`, `OCCUPATIONS`, `NPC_TIERS`, cấp id (`allocateNpc`), seed luồng riêng (`npcSeed`), `npcViews` (rỗng tới S1).
  - `npc/phase.ts`: `npcPhase`, gọi trong tick ngay sau pha Thế giới, trước pha Sự kiện.
  - `npc/world.ts`: `simulateWorld`.
- **Pha Thế giới đầu năm** tách thành `worldYearStart` (thời tiết, rồi gọi tên tai họa). Đời người chơi và thế giới tự chạy dùng chung, thứ tự rút RNG không đổi.
- **Lệnh `pnpm sim world --seeds N --years Y`:** thế giới tự chạy không người chơi. Bước 0 chỉ kiểm sổ cái và đo µs/tick; tiêu chí dân số thêm ở S7.
- **Số đo nền** để so ở S7 (Node, cùng máy):
  - đời người chơi tsvl-01: 26,8–29,2 µs/tick (3 lần chạy);
  - thế giới tự chạy, chưa có NPC: 2,6 µs/tick trung bình trên 3 vùng × 100 năm;
  - batch 5 × 1.000 đời: 66 s lần này, 107 s lúc nghiệm thu v0.3. Máy dao động nhiều, nên S7 đo lại cả hai bản trên cùng một lần chạy.
- **Batch v0.3 sau Bước 0:** ra đúng số cũ (lười 17,93 · điều độ 59,70 · lao lực 56,78 · học giả 57,82 · lang bạt 47,87; PASS). `pnpm sim economy` PASS.

## Ghi chú triển khai S2 (2026-10-27)
- **Bộ não nhu cầu** `packages/sim/src/npc/brain.ts`:
  - đầu vào tối thiểu `BrainInput` (tuổi, sức khỏe, có bệnh, túi, kho, tháng, hành động làm được, chợ);
  - các hàm `foodWeeks`, `workChoice`, `earnPlan`, `weakPlan`, `tradeDecision`, `needsPlan`.
- **Người chơi máy** (`tools/headless/src/policies.ts`) gọi lại lõi này. Batch trước khi có luật NPC ra **đúng từng số** như S1, chứng tỏ chuyển lõi không đổi hành vi.
- **Tầng L0** (`npc/phase.ts`, `stepL0`). Mỗi tuần, đúng thứ tự của người chơi:
  1. thuế đinh đầu năm;
  2. gặt đầu tháng Chín;
  3. đầu tháng: mua bán lương (cùng `tradeGrain` của lệnh TRADE), rồi xếp kế hoạch;
  4. bệnh, tai nạn;
  5. một ô hành động (`playerPhase`, nhận nguồn RNG một luồng cho mọi tên);
  6. ăn, mua ở chợ đang đứng;
  7. lão hóa đầu năm;
  8. hậu quả.

  NPC không nhận sự kiện có lựa chọn.
- **Nghề → việc chính:**
  - nông: làm ruộng;
  - thợ săn: săn;
  - làm thuê: làm thuê;
  - thương nhân: buôn bán nhỏ khi đủ vốn;
  - thầy đồ, thầy thuốc: tạm làm thuê, vì chưa có hành động nghề riêng (v0.7).

  Việc nghề không làm được lúc này thì theo lõi chung: ruộng, rồi việc kiếm ăn ngay.
- **Hai chỉnh để NPC không chết đói vì vị thế ban đầu** (đo bằng `pnpm sim world --all-l0`, 10 vùng × 30 năm):
  - **Kho dành dụm theo tuổi:** người lớn lúc bắt đầu có 360 thăng + 30 thăng mỗi năm đã tự lo, tối đa 1.080 (ba năm ăn), lấy từ kho quận nhà. Chỉ có phần chia lúc 16 tuổi thì người 50 tuổi đói ngay.
  - **NPC túng thì làm cả ô thứ ba** (`needsPlan`); người chơi máy "điều độ" vẫn hai ô. Dân trấn, thành làm thuê hai ô không đủ ăn ở giá thành.
  - Chết đói giảm 22,6% → 11,3% → **8,6%**. Trong đó **năm thường 3,7%** (quận nhà không đói kém, khan hiếm trong 12 tháng trước). 100 năm: 4,6% tổng, 2,0% năm thường.
- **Mất:**
  - ghi `death` (tick, nguyên nhân, chi tiết);
  - túi, kho về quỹ, kho quận nhà (sổ cái);
  - sức khỏe chặn dưới 0. **Lỗi tìm ra:** chết già đúng tuần sức khỏe cạn thì `consequencesPhase` trả về trước khi chặn, save bị từ chối. Có test hồi quy; đã xác nhận test hỏng khi bỏ cách sửa. Người chơi cũng có lỗi này nhưng không lộ, vì người chết không còn được lưu; không sửa ở người chơi để tránh đổi digest vô cớ.
- **Tầng L1 đứng yên tới S3.** Thế giới tự chạy mặc định để mọi NPC ở L1, nên dùng `--all-l0` để đo luật tuần.
- **Batch v0.3 có NPC L0:** PASS, số gần như không đổi (điều độ 59,66, lao lực 56,76, học giả 57,84, lang bạt 47,79). `pnpm sim economy` PASS.
- **Chi phí:**
  - batch 255 s, so với 66 s ở Bước 0 trên cùng máy (3,9 lần) và 107 s lúc nghiệm thu v0.3 (2,4 lần);
  - đời mẫu tsvl-01 (12 NPC ở L0): 118–125 µs/tick, gồm khởi động JIT của một đời ngắn;
  - thế giới tự chạy, mọi NPC ở L0: khoảng 0,9–1,7 µs mỗi NPC mỗi tuần.

  Profile: pha NPC chiếm khoảng 75% thời gian một đời (hành động 35%, bệnh 20%, xếp kế hoạch 14% của pha NPC). Đã bỏ closure tạo mỗi tuần và gộp đầu vào bộ não khi xếp kế hoạch: digest không đổi, nhanh hơn khoảng 3%. Ngân sách Q9 xét lại ở S7, sau khi có L1.

## Ghi chú triển khai S3 (2026-10-27)
- **Đổi tầng** (`npcPhase`): ở tuần đầu mỗi tháng, NPC ở quận người chơi đang đứng lên L0, quận khác về L1. Thế giới tự chạy không người chơi thì mọi NPC ở L1, trừ khi `allL0`.
- **Tầng L1** (`stepL1`, chạy ở tuần đầu tháng cho cả tháng). Thứ tự:
  1. thuế đinh đầu năm, mùa gặt, mua bán và kế hoạch tháng (như L0);
  2. bệnh, tai nạn: xác suất tính một lần cho cả tháng, `compoundPpm(p, 3)` = 1 − (1 − p)³ bằng số nguyên, và rút một lần. Nếu xảy ra, khởi phát rơi vào một tuần ngẫu nhiên trong tháng và chỉ có tác dụng từ tuần đó;
  3. ba tuần chạy xen như L0: ô hành động (`slotEffects` rồi `slotMishap`, không qua lớp kế hoạch dở `playerPhase`), ăn, hậu quả;
  4. luồng RNG của NPC dựng một lần mỗi tháng.
- **Tách hàm, giữ nguyên người chơi:**
  - `perform` tách thành `slotEffects` (phần kinh tế, kỹ năng, thể lực) và `slotMishap` (rút rủi ro). Digest đời mẫu không đổi.
  - `eventsPhase` tách thành `illnessPpm`, `pickIllness`, `accidentPpm`, `pickInjury`, `accidentFatalPpm`, `startCondition`. So với bản cũ lấy từ git trên 4.000 ca (2.605 lần khởi phát): cùng kết quả, cùng trạng thái RNG.
- **Hai bản thử trước, bị bỏ:**
  1. **Bệnh, tai nạn khởi phát luôn ở tuần đầu tháng, ba ô hành động chạy trước rồi mới ăn, hậu quả.** Lệch có hệ thống: người mắc bệnh làm trọn tháng theo kế hoạch đã xếp khi còn khỏe. So với L0: chết vì bệnh 54,0% so với 49,8% (lệch 4,3 điểm), chết già 32,5% so với 36,9% (4,4 điểm), vượt ngưỡng 3 điểm. Chỉ rẻ hơn L0 27%.
  2. **Bệnh rút từng tuần trong vòng lặp.** Đạt tương đương, nhưng chỉ rẻ hơn L0 9%.
- **Tương đương** (bản cuối; `pnpm sim world --seeds 10 --years 100`, cùng đoàn 1.668 NPC):

  | | L1 | L0 | Lệch | Ngưỡng |
  |---|---|---|---|---|
  | Tuổi trung bình lúc mất | 63,1 | 63,6 | 0,5 năm | ≤ 1 |
  | Chết vì bệnh | 48,7% | 49,8% | 1,0 điểm | ≤ 3 |
  | Chết già | 37,1% | 36,9% | 0,2 điểm | ≤ 3 |
  | Tai nạn | 10,4% | 8,8% | 1,6 điểm | ≤ 3 |
  | Chết đói | 3,7% | 4,6% | 0,9 điểm | ≤ 2 |

  Test trong bộ (`npc.test.ts`) chạy 15 lượt × 100 năm trên tsvl-01, khoảng 2.000 NPC, kiểm đúng các ngưỡng này.
- **Chi phí — phát hiện quan trọng:**
  - Tầng L1 chỉ rẻ hơn L0 khoảng **22%** (89 so với 114 µs/tick khi mọi NPC cùng một tầng).
  - Phần đắt là ăn, hậu quả và ba ô hành động. Chính các phần này quyết định đói, chết đói, chữa bệnh, nên không gộp được mà không lệch (bản thử 1).
  - Giả định của ADR rằng "L1 tháng rẻ hơn hẳn" không đúng với luật hiện tại.
  - Hệ quả: khi mọi NPC trong vùng đều sống, batch v0.3 chậm hơn nhiều (số đo ở dưới). Ngân sách Q9 phải xử lý ở S7 bằng hai cách không đổi kết quả:
    - **chạy batch song song nhiều luồng:** các đời độc lập nhau, nên tất định giữ nguyên;
    - **bỏ việc tính lại cùng một giá trị nhiều lần trong một tuần:** `staminaMax`, `fatiguePct` được gọi 4–5 lần mỗi NPC mỗi tuần; luồng RNG dựng lại mỗi tuần ở L0.
- **Batch v0.3 khi mọi NPC đều sống** (`pnpm sim batch --seeds 1000 --policy all`): PASS, số gần như không đổi (điều độ 59,74, lao lực 56,77, học giả 57,78, lang bạt 47,94).
  - Thời gian: **1.645 s, khoảng 27 phút**. Gấp 25 lần Bước 0 (66 s) và 15 lần lúc nghiệm thu v0.3 (107 s).
  - Vượt xa ngân sách Q9 (≤ 3 lần). Phải xử lý trước khi các bước sau dùng batch.
- `pnpm sim economy` PASS. `pnpm sim world --seeds 10 --years 100` PASS, sổ cái giữ nguyên, 89 µs/tick.

## Ghi chú: tăng tốc batch trước S4 (2026-10-27, chủ dự án chọn làm ngay sau S3)
Mọi thay đổi dưới đây giữ nguyên kết quả: digest các đời mẫu và số liệu thế giới tự chạy không đổi; batch ra đúng số của S3.
- **Batch chạy song song nhiều luồng** (`tools/headless`):
  - tách một đời thành hàm thuần `runLife(vùng, chiến lược, i)`, tách phần gộp thành `aggregate`;
  - `--threads K` chia đời thành từng đoạn 20 đời cho K luồng, rồi xếp kết quả lại theo chỉ số đời trước khi gộp;
  - `--threads 1` chạy tuần tự.
  - **Kiểm chứng:** 100 đời × 5 chiến lược, báo cáo JSON chạy tuần tự và 8 luồng giống hệt từng byte, trừ trường thời gian. Test `batch.test.ts` kiểm một đời chạy lẻ, chạy ngược thứ tự, với bộ đệm riêng, và qua structured clone: cùng kết quả, cùng báo cáo.
- **Bỏ tính lặp trên đường nóng của NPC** (mã `sim`; người chơi dùng chung, digest không đổi):
  - **`staminaMax` nhớ giá trị gần nhất.** Khóa gồm người, tick, tuổi sinh, thọ nguyên, thể chất, võ, nên kết quả y như tính lại. Mỗi người hỏi 5–6 lần mỗi tuần; chỉ nhanh hơn khoảng 2%.
  - **Bảng tra theo id** cho hành động, thiên phú, bệnh, thương tật, thay `find` tuyến tính. **Hàm vòng lặp** `hasCondition`, `hasSeverity` thay `conditions.some(closure)`; `traitProduct` thay `reduce(closure)`.
  - **Bỏ `buyGrain.bind(…)` dựng mỗi tuần.** Profile cho thấy một hàm dựng sẵn (tên hiển thị "set TextDecoder") chiếm khoảng 12%, gọi thẳng từ `stepL1`. Thay bằng một đối tượng mua lương dựng một lần mỗi tháng, tầng L1 nhanh hơn 22%.
  - **Tổng cộng** (thế giới tự chạy 4 vùng × 60 năm): L1 155 → 114 µs/tick (−26%); L0 204 → 185 µs/tick (−9%).
- **Batch 5 × 1.000 đời, 8 luồng, cùng máy:**
  - phần chạy đời 1.645 s → **249 s** (nhanh 6,6 lần);
  - cả lệnh, gồm sinh vùng, 4 phút 23 giây: bằng **2,3 lần** lúc nghiệm thu v0.3 (107 s). Đạt ngân sách Q9 (≤ 3 lần);
  - so với Bước 0 trên cùng máy (66 s, chưa có NPC, chạy tuần tự) là 3,8 lần.
- **Chưa làm:** dựng luồng RNG của NPC mỗi tuần (L0) hay mỗi tháng (L1); giữ đối tượng RNG giữa các tuần sẽ cần đồng bộ trạng thái mỗi khi chụp snapshot. Để lại cho S7 nếu cần.

## Ghi chú S7: hiệu năng và nghiệm thu mô phỏng (2026-10-27)
- **Tối ưu giữ nguyên kết quả** (digest pin, `pnpm sim world`, batch ra đúng số của S6):
  - `feedPhase` nhận thẳng chợ quận thay cho hàm mua lương. Lớp `GrainBuyer` dựng một hàm mỗi tuần; khi chạy qua tsx (esbuild giữ tên hàm), mỗi lần dựng tốn thêm một lần `defineProperty`. Riêng chỗ này chiếm khoảng 13% thời gian một đời.
  - `Rng.fromState` kiểm bốn phần tử trực tiếp, không dựng iterator.
  - `idiv`, `mulDiv` chỉ gọi hàm báo lỗi khi số không an toàn; cùng phép kiểm, cùng lỗi.
  - Bộ nhớ `staminaMax` ghi đè tại chỗ, không cấp phát.
  - Tin sinh, mất của NPC xét điều kiện rẻ trước.
  - Batch tính tuổi lúc mất trực tiếp, không gọi `summary()` (dựng snapshot và digest).
- **Số đo** (Node, tsx, i5-13400F):

  | Chỉ số | Trước S7 | Sau S7 | Ngân sách Q9 |
  |---|---|---|---|
  | Đời "điều độ" trên 3 vùng (chỉ phần chạy đời) | 202 µs/tick | 178 µs/tick | ≤ 100 |
  | +1 năm, tsvl-01 (134 NPC) | — | 6,3 ms (175 µs/tick), chậm nhất 8,8 ms | trình duyệt ≤ 50 ms |
  | +1 năm, tsvl-02 (154 NPC) | — | 5,3 ms (146 µs/tick) | |
  | +1 năm, tsvl-03 (282 NPC) | — | 9,3 ms (259 µs/tick), chậm nhất 11,2 ms | |
  | `pnpm sim world` 10 × 100 năm | 195 µs/tick | 152 µs/tick | |
  | Batch 5 × 1.000 đời, 15 luồng, cả lệnh | 6 phút 34 giây | **4 phút 59 giây** (2,8 lần v0.3) | ≤ 3 lần v0.3 |

- **Profile sau tối ưu** (chỉ phần chạy đời): pha NPC 88%, trong đó tầng L1 71%. Chi phí trải đều trên luật dùng chung: hành động của ô (15%), xếp kế hoạch (14%), xác suất bệnh (9%), hậu quả (9%), sức bền (6%), khóa hành động (6%). Không còn chỗ nóng riêng nào để cắt mà không đổi luật.
- **Ngân sách µs/tick ban đầu không đạt.** Chi phí khoảng 1 µs mỗi NPC mỗi tuần, cả L0 lẫn L1 (S3 đã chỉ ra L1 chỉ rẻ hơn L0 khoảng 22%). Ngân sách 100 µs/tick dựa trên giả định L1 rẻ hơn hẳn, không còn đúng.
- **Quyết định (chủ dự án, 2026-10-27): nới ngân sách Node thành ≤ 300 µs/tick**, khoảng 1 µs mỗi NPC mỗi tuần với hạn mức lớn nhất hiện có (282 NPC). Giữ nguyên hai ngân sách còn lại: batch ≤ 3 lần v0.3, trình duyệt +1 năm ≤ 50 ms.
  - Phương án bị gác: làm L1 rẻ hơn bằng cách gộp ăn, hậu quả theo tháng. Bản thử ở S3 cho thấy gộp như vậy làm lệch so với L0; phải đo lại toàn bộ tương đương LOD.
  - Theo ngân sách mới, S7 **đạt cả ba**: Node 146–259 µs/tick, batch 2,8 lần v0.3, +1 năm trên Node chậm nhất 11,2 ms. Số đo trên trình duyệt làm ở bước FE.
  - Hệ quả: vùng có hạn mức NPC lớn hơn (thêm quận, thêm loại nơi) phải đo lại ngân sách; vượt 300 NPC là vượt ngân sách.

## Ghi chú F5: đo trên trình duyệt (2026-10-27)
- **+1 năm trên trình duyệt** (Chrome headless, dev server, khổ 1920×1080, đời thật tsvl-01 sinh ở Phố Kỳ, 52 lần bấm "+1 năm" không bị sự kiện hay biến cố ngắt). Đo từ lúc bấm tới khi ngày trên thanh trạng thái đổi và nút mở lại, gồm cả worker, gửi tin và vẽ lại:

  | Trung bình | Trung vị | p95 | Chậm nhất | Ngân sách Q9 |
  |---|---|---|---|---|
  | 28 ms | 25 ms | 46 ms | 47,5 ms | ≤ 50 ms |

  Đạt nhưng sát ngân sách ở đuôi; vùng đông NPC hơn hoặc máy yếu hơn có thể vượt. Bản dựng production (không có HMR, mã đã gộp) thường nhanh hơn dev server.
- **Save trình duyệt có NPC** (`docs/nghiem-thu/v0.4/browser-save.json`, 159 NPC, đã gặp 1 người qua sự kiện, 6 `CHOOSE`) phát lại bằng `pnpm sim replay --save docs/nghiem-thu/v0.4/browser-save.json`: **PASS**, digest `d04615ff9303282e`.

