# ADR 0018 — Gia đình: cha mẹ, hôn nhân, con cái, thừa kế

- Trạng thái: **ĐÃ DUYỆT** (2026-10-27, chủ dự án đồng ý mọi khuyến nghị Q1–Q13 ở `docs/v0.5-giai-doan-a.md`; liên quan Q2–Q6, Q8). Q3: chủ dự án chọn chỉ ghép nam–nữ.
- Ngày: 2026-10-27
- Liên quan: GDD 1.1, 3.2 C, 3.2 G, 3.2 H, 4.1, 5 (v0.5); ADR 0012, 0013, 0015, 0016

## Bối cảnh
- **GDD 3.2 G:** NPC sinh ra, lớn lên, làm việc, kết hôn, sinh con, già đi, chết khi người chơi không để ý.
- **GDD 3.2 H:** gia đình ràng buộc thời gian; con cái sinh ra, lớn lên trong mô phỏng, người chơi không điều khiển; người chơi chết thì thế giới dừng.
- **Hiện trạng:**
  - cha mẹ người chơi là hộ trừu tượng (ADR 0013): nuôi tới 16 tuổi theo xuất thân và tình hình quận; phần chia lấy từ quỹ, kho quận;
  - trẻ NPC sinh "từ dân nền" theo hạn mức (ADR 0016), chưa có cha mẹ;
  - người mất thì của về quỹ, kho quận nhà ("thừa kế thật ở v0.5").
- **Số đo** (`docs/v0.5-giai-doan-a.md` mục 2):
  - mỗi quận có 3–9 người 18–40 tuổi mỗi giới, có quận 0 người một giới;
  - NPC đã ra riêng có trung vị 8.815 văn, p90 38.446 văn, 6 mẫu ruộng — gấp nhiều lần phần chia bình dân (300 văn).

## Phương án cho sinh con
| | A. Số sinh theo hạn mức, gán cho cặp vợ chồng (khuyến nghị) | B. Sinh do từng cặp quyết định | C. Giữ "từ dân nền" |
|---|---|---|---|
| Cách làm | Số trẻ mỗi quận mỗi năm vẫn theo ADR 0016; mỗi trẻ gán cho một cặp trong quận | Mỗi cặp có xác suất sinh theo tuổi người mẹ; dân số tự điều chỉnh | Không có cha mẹ |
| Ưu | Dân số ổn định như v0.4; trẻ có cha mẹ thật | Gần đời thật nhất | Không tốn gì |
| Nhược | Số sinh không do từng cặp quyết | Dân số dễ sụp hoặc bùng, phải cân bằng lại toàn bộ | Trái GDD 3.2 G, 3.2 H |

## Quyết định (đề xuất)
- **Liên kết ruột thịt trên `NpcState`:** `father`, `mother`, `spouse` (id hoặc null). Con, anh chị em suy ra từ liên kết cha mẹ. Người chơi có cùng các trường.
- **Cha mẹ người chơi (Q2):**
  - lúc sinh, chọn một cặp vợ chồng ở quận sinh cùng xuất thân, người mẹ 18–42 tuổi; không có thì dựng một cặp mới từ dân nền, như sinh NPC;
  - **nuôi con và phần chia lúc lập thân giữ như ADR 0013** (nguồn là quỹ, kho quận), để tuổi thơ không đổi cân bằng;
  - cha mẹ già, ốm, mất như mọi NPC; tin về cha mẹ là tin quan trọng.
- **Hôn nhân NPC (Q3):**
  - đầu năm, ghép người chưa có vợ/chồng 18–35 tuổi, trước trong quận rồi tới quận kề; xác suất theo tuổi;
  - **chỉ ghép một nam với một nữ**, cho cả người chơi và NPC (chủ dự án chọn, 2026-10-27). Trẻ sinh gán cho cặp vợ chồng như phương án A; chưa có luật nhận nuôi;
  - **ở nhà ai:** người ít ruộng hơn chuyển tới quận người kia; bằng nhau thì người trẻ hơn chuyển. Hai người giữ túi, kho riêng;
  - góa: người còn lại có thể ghép lại nếu còn trong tuổi.
- **Sinh con (Q4):** phương án A. Trẻ ở quận cha mẹ; dưới 16 vẫn ăn theo luật hộ trừu tượng (ADR 0013), trừ con của người chơi (Q8). Rủi ro sinh khó cho người mẹ khoảng 1% mỗi lần sinh (chủ dự án quyết có giữ hay không).
- **Thừa kế (Q5):**
  - người mất: tiền, lương, ruộng về vợ/chồng; không có thì chia đều cho các con còn sống; không có ai thì về quỹ, kho quận như v0.4;
  - áp cho cả người chơi (nhận khi cha mẹ mất). Người chơi chết thì thế giới dừng, không chia của người chơi;
  - sổ cái chỉ chuyển giữa các túi, không tạo tiền;
  - **trước khi bật:** tìm hiểu vì sao NPC tích nhiều của (Bước 0), đo batch trước và sau. Nếu người chơi giàu lên quá mức thì chỉnh nguồn gốc của cải, không cắt luật.
- **Người thân giúp khi đói (Q6):** cùng luật cho mọi người. Mỗi tháng, người đang đói được vợ/chồng, cha mẹ, con đã lớn ở cùng quận cho tối đa 4 tuần ăn, nếu người cho còn dư trên một năm ăn.
- **Gia đình người chơi (Q8):**
  - cưới bằng hành động cưới hỏi (ADR 0017): sính lễ theo xuất thân, chuyển sang nhà bên kia hoặc bên kia chuyển tới theo luật ở trên; tiếng tăm hai bên quận ảnh hưởng việc nhận lời;
  - vợ/chồng là NPC giữ túi riêng, vẫn làm theo bộ não nhu cầu;
  - **con dưới 16 sống cùng ăn vào kho người chơi** (nửa khẩu phần); không đủ thì con đói theo luật đói — miệng ăn thật. Từ Bước 0, luật này áp cho **mọi người** (xem dưới);
  - cha mẹ già ốm, tang lễ người thân là sự kiện tốn ô và tiền;
  - người chơi không điều khiển con; con lập thân lúc 16 như mọi NPC.

## Hệ quả
- Dân số vẫn theo hạn mức nên tiêu chí v0.4 giữ được; thêm tiêu chí: tỉ lệ có cha mẹ thật, tỉ lệ có vợ/chồng, số con mỗi người mẹ.
- Tương đương L0/L1 phải đo lại: người thân giúp khi đói và thừa kế chạy ở cả hai tầng, cùng nhịp tháng.
- Thừa kế có thể đổi mạnh cân bằng người chơi; là rủi ro lớn nhất của v0.5.
- Snapshot thêm ba id mỗi người: không đáng kể.

## Ghi chú Bước 0: vì sao NPC tích nhiều của (2026-10-27)
Chỉ đo, chưa đổi luật. Đời mẫu làm ruộng, sinh ở làng, tsvl-01 và tsvl-03, đọc snapshot mỗi năm.

| | Năm 0 | Năm 10 | Năm 20 | Năm 30 | Năm 40 |
|---|---:|---:|---:|---:|---:|
| Phần tiền NPC nắm trong tổng tiền vùng, tsvl-01 | 0,4% | 3,7% | 6,4% | 8,5% | 9,4% |
| Như trên, tsvl-03 | 0,5% | 6,2% | 10,1% | 12,3% | 13,9% |
| Trung vị tiền nông dân NPC, tsvl-01 (văn) | 300 | 5.556 | 11.710 | 15.311 | 16.233 |
| Như trên, tsvl-03 | 300 | 10.327 | 18.494 | 22.737 | 26.169 |

- **Nguồn:** nông dân chiếm đa số NPC, làm ruộng cỡ một hộ (trung vị 6 mẫu) nhưng chỉ nuôi một miệng ăn; phần lúa thừa trên hai năm ăn bị bán đi mỗi năm (bộ não: bán trên 72 đấu). Làm thuê, thợ săn, thương nhân tích chậm hơn nhiều.
- **Không có chỗ tiêu:** ngoài ăn và thuế đinh, NPC không tiêu gì. Tiền dồn dần từ quỹ quận sang túi NPC, tăng đều theo năm, chưa thấy dừng.
- **Hệ quả cho v0.5:**
  - thừa kế thật (Q5) sẽ chuyển những khoản này sang người thừa kế, kể cả người chơi;
  - hướng sửa đúng tinh thần GDD là **có miệng ăn**: con dưới 16 ăn vào kho cha mẹ cho **mọi người**, không riêng người chơi. ADR này (theo Q8) hiện chỉ áp cho con người chơi; đổi cho mọi NPC là quyết định của chủ dự án, cần chốt trước S2–S3.

## Quyết định thêm sau Bước 0 (chủ dự án, 2026-10-27)
- **Con dưới 16 ăn vào kho cha mẹ cho mọi người**, không riêng con người chơi: con NPC có cha mẹ thật ăn nửa khẩu phần vào kho cha mẹ (người mẹ trước, rồi người cha); trẻ không có cha mẹ thật, hoặc cha mẹ đã mất, vẫn ăn theo hộ trừu tượng (ADR 0013). Đây là chỗ tiêu tự nhiên cho lúa thừa của nông dân NPC (ghi chú Bước 0).
- **Tuổi thơ của chính người chơi vẫn theo Q2:** hộ trừu tượng nuôi, phần chia lấy từ quỹ, kho quận, như ADR 0013.
- Làm ở S2 (khi trẻ có cha mẹ) và đo lại ở S3 cùng thừa kế.

## Ghi chú triển khai S1 (2026-10-27)
- **Liên kết ruột thịt:** `CharacterState.kin { father, mother, spouse }` (id NPC hoặc null), cho cả người chơi và NPC. Con, anh chị em suy ra từ liên kết cha mẹ (`kinRole`).
- **Kho quan hệ** (`social/bonds.ts`, ADR 0017):
  - `LifeSnapshot.bonds`: mảng thưa sắp theo id; mỗi mục có `closeness`, `trust`, `hostility` (0..100) và `owed` (−100..100);
  - dải hiển thị: thân thiết 20/50/80, tin cậy 30/70, thù hận 30/70, nợ ơn ±20.
- **Cha mẹ người chơi** (`npc/family.ts`, `assignPlayerParents`, gọi trong `Life.create` sau dân số ban đầu, luồng `npc-world`):
  - chọn trong người lớn ở quận sinh, đang ở quận ấy, đã ra riêng, chưa có vợ/chồng, **cùng xuất thân**; mẹ 18–42, cha 20–55 tuổi;
  - không có ai hợp thì dựng thêm một người ở quận ấy (giới, xuất thân, tuổi định sẵn), trừ dân nền một miệng ăn, phần chia và kho dành dụm lấy từ quỹ, kho quận như dân số ban đầu;
  - hai người thành vợ chồng; người chơi mang họ cha;
  - quan hệ với cha mẹ khởi đầu thân thiết 80, tin cậy 70.
- **Tỉ lệ phải dựng thêm** (60 đời mỗi vùng): tsvl-01 34%, tsvl-03 39% số cha mẹ. Phần lớn ở nhà khá giả, giàu (ít người cùng xuất thân). Mỗi đời thêm trung bình 0,7 người ở quận sinh, dưới trần 130% hạn mức.
- **`spawnNpc`** tách từ `seedPopulation` (dựng một người có tên), thêm tùy chọn giới, xuất thân, tuổi định sẵn; `createCharacter` nhận `gender`, `background` định sẵn và khi đó không rút RNG cho hai trường này. Thế giới tự chạy ra đúng từng số như v0.4.
- **Người chơi thấy:**
  - `STATE.circle`: người thân rồi người có quan hệ ở mọi quận, còn sống;
  - `people` và `circle` mang `kin`, `bond`.
- **Tin:** người thân mất ở bất cứ quận nào có tin quan trọng `log.kin.death` ("Mẹ … mất năm … tuổi, vì …").
- **Chưa làm ở S1:** hôn nhân NPC, trẻ có cha mẹ (S2); con ăn vào kho cha mẹ (S2); thừa kế (S3). Vai "Vợ/chồng" trong tin mất cần tách theo giới khi có hôn nhân (S2, S5).
- **Batch v0.3 có NPC** (5 × 1.000 đời, 15 luồng, 4 phút 59 giây): PASS. Tuổi trung bình gần như không đổi so với v0.4: điều độ 59,76 (v0.4 59,68), lao lực 56,76 (56,85), học giả 57,66 (57,70), lang bạt 48,27 (48,25); lệch tuổi NPC lang bạt/điều độ 0,03 năm.
- **Digest pin đổi;** tuổi và nguyên nhân chết của ba đời mẫu giữ nguyên.

## Ghi chú triển khai S2 (2026-10-28)
- **Hôn nhân NPC** (`lifecycle.ts`, đầu năm, RNG riêng theo (đời, năm)):
  - người chưa có vợ/chồng hoặc góa, đã ra riêng, 18–35 tuổi; chỉ ghép một nam với một nữ; chồng hơn vợ từ −3 tới 12 tuổi;
  - xác suất mỗi năm theo tuổi người nữ: dưới 26 tuổi 45%, 26–35 tuổi 25%;
  - tìm trong quận trước, rồi quận kề; người ít ruộng hơn chuyển tới (bằng nhau thì người trẻ hơn), mang theo con còn ở nhà; không chuyển vào quận đã chạm trần 130% (tính cả người đi kèm), khi ấy người kia chuyển;
  - người chuyển làm lại nghề theo nơi mới; nghề đặc biệt xét lại đầu năm.
- **Dân số ban đầu có sẵn gia đình** (`seedFamilies`): người nữ đã ra riêng có chồng theo tuổi (dưới 20: 30%, 20–24: 65%, từ 25: 85%); trẻ dưới 16 được gán cho cặp cùng quận, cùng xuất thân, mẹ 18–42 tuổi lúc trẻ sinh.
- **Trẻ sinh** (số trẻ vẫn theo hạn mức, ADR 0016): gán cho một cặp trong quận, mẹ 18–42 tuổi, không sinh trong vòng một năm trước, nhà đang nuôi dưới 5 con và **còn đủ ăn 26 tuần cho cả nhà sau khi thêm miệng ăn**; ưu tiên nhà ít con. Trẻ mang họ cha, xuất thân theo cha. Không có cặp hợp thì sinh "từ dân nền". Rủi ro sinh khó 1% (ghi là bệnh, `illness.childbirth`).
- **Cha mẹ người chơi** ưu tiên một cặp sẵn có (cha 20–55, mẹ 18–42 tuổi); không có mới ghép hai người chưa có vợ/chồng, rồi mới dựng thêm.
- **Con ăn vào kho cha mẹ** (chủ dự án chốt sau Bước 0, rồi chọn thêm "làng xóm cưu mang" sau khi đo ở S2):
  - trẻ dưới 16 có cha mẹ thật ăn kho mình trước (12–15 tuổi có đi làm), rồi **phần trên một năm ăn** của mẹ, của cha; thiếu thì mua bằng túi mình, rồi **phần tiền trên 300 văn** của mẹ, của cha;
  - vẫn thiếu thì **họ hàng, làng xóm cưu mang** như hộ trừu tượng (ADR 0013): năm thường đủ ăn, năm đói kém có thể bị bỏ đói;
  - trẻ mồ côi, trẻ không có cha mẹ thật: hộ trừu tượng như v0.4.
- **Bộ não tính theo miệng ăn cả nhà** (`BrainInput.need`): giữ một năm ăn, bán phần trên hai năm ăn, "túng" dưới 12 tuần — tính bằng tuần ăn của mình cộng phần con đang nuôi (mỗi cha mẹ một nửa). Người chơi máy giữ khẩu phần một người như cũ.
- **Người thân giúp khi đói** (Q6, cùng luật người chơi và NPC): đầu tháng, người đã ra riêng đang đói được vợ/chồng, cha mẹ, con đã ra riêng **ở cùng quận** chia phần trên một năm ăn của họ, tối đa 4 tuần ăn. Người chơi được giúp thì có tin `log.kin.help`.
- **Các bước thử trước khi chốt** (`pnpm sim world`, 10 vùng × 100 năm):

  | Cách làm | Chết đói | Năm thường | Dân số mỗi quận |
  |---|---:|---:|---:|
  | v0.4 | 7,9% | 4,5% | 83–130% |
  | Con ăn vào kho mẹ | 47,3% | 24,3% | 58–150% |
  | + kho mẹ rồi cha, bộ não tính cả nhà, tối đa 5 con | 29,0% | 10,8% | 60–165% |
  | + con tự ăn trước, sinh khi đủ ăn, không chuyển vào quận đầy | 22,2% | 7,9% | 70–135% |
  | + làng xóm cưu mang | 17,5% | 7,1% | 83–141% |
  | + cha mẹ chỉ chia phần trên một năm ăn | 14,5% | 7,6% | 83–141% |
  | + tính cả người đi kèm khi xét quận đầy, người thân giúp khi đói (**bản chốt**) | **12,1%** | **5,7%** | **83–130%** |

- **Kết quả bản chốt:**
  - trẻ sinh có cha mẹ thật 89,0%; người 25–50 tuổi có vợ/chồng 82,1%;
  - phụ nữ sinh trong lúc chạy đã qua 45 tuổi: 1,96 con (riêng người có chồng 2,12);
  - tuổi trung bình lúc mất 58,3; dân số 83–130%; kinh tế v0.3 giữ (đói kém 9,7 năm/lần, quỹ cạn 2,2%); sổ cái giữ;
  - **chết đói 12,1% — chưa đạt ≤ 10%.** Người chết đói phần lớn là người già 45+ ở trấn (làm thuê, thầy đồ, thầy thuốc): của dư cả đời nay đã nuôi con, về già không còn kho dày như v0.4. Bản thử thừa kế cho vợ/chồng (chưa bật, S3) kéo xuống 10,6% (năm thường 5,0%).
  - **số con mỗi phụ nữ 1,96 — sát dưới ngưỡng 2** đã đề xuất: số sinh giữ theo hạn mức nên bình quân xoay quanh mức thay thế; 18% phụ nữ không lấy chồng kéo bình quân xuống.
- **Tương đương L0/L1** (test trong bộ) vẫn đạt; chết đói năm thường toàn L0 (tsvl-01, 5 × 30 năm) ≤ 5% vẫn đạt.
- **Batch v0.3** PASS (điều độ 59,59; "lười" 23,91 tuổi, trước 17,95 — được cha mẹ giúp khi đói, vẫn 96% chết đói). Thời gian **6 phút 8 giây, vượt ngân sách** khoảng 5 phút 21 giây; `world` 175 µs/tick (trước 150). Tối ưu ở S8 (Q12).
- **Digest pin đổi:** ba đời mẫu chỉ nghỉ nay sống 31–43 tuổi thay vì 21, vì cha mẹ mang gạo sang khi đói.

## Ghi chú triển khai S3 (2026-10-28)
- **Thừa kế** (`die`, `heirsOf`, `bequeath` trong `npc/lifecycle.ts`):
  - người thừa kế: vợ/chồng còn sống; không có thì các con còn sống (cả người chơi, nếu người mất là cha hoặc mẹ), người lớn tuổi trước; không có ai thì tiền, lương về quỹ, kho quận nhà như v0.4, ruộng về dân nền;
  - chia đều tiền, lương, ruộng, phần lẻ cho người đầu (con cả); tá điền nhận ruộng thành tự canh;
  - người chưa ra riêng giữ ruộng tới lúc lập thân: `becomeIndependent` cộng phần chia vào ruộng đã có (đường cũ không đổi vì trước đó luôn là 0);
  - phần người chơi nhận giữ trong snapshot (`bequests`) và báo tin `log.kin.inherit` đúng tuần người ấy mất, sau tin mất (NPC tầng L1 tính trước cả tháng).
- **Phí thầy thuốc vào túi thầy thuốc:** chữa bệnh (người chơi và NPC, L0 và L1) trả cho thầy thuốc NPC còn sống đang ở quận (id nhỏ nhất); không có thì quỹ quận như v0.3. Sự kiện "thầy thuốc qua làng" có người thật thì phí vào túi người ấy.
- **Đo batch trước và sau khi bật** (Q5; 5 × 1.000 đời):

  | Chiến lược | Tuổi TB trước → sau | Được thừa kế | Trung vị phần nhận | Của cải trung vị lúc chết trước → sau |
  |---|---:|---:|---:|---:|
  | Lười | 23,91 → 24,38 | 7,3% đời | 54.577 văn | 0 → 0 |
  | Điều độ | 59,59 → 59,68 | 84,5% | 20.065 | 35.134 → 50.973 |
  | Lao lực | 56,85 → 56,89 | 82,7% | 20.092 | 75.399 → 89.777 |
  | Học giả | 57,66 → 58,27 | 81,6% | 21.271 | 1.724 → 12.463 |
  | Lang bạt | 48,57 → 49,04 | 62,9% | 25.119 | 660 → 2.938 |

  Batch PASS cả hai lần. Phần thừa kế trung vị gấp khoảng 67 lần phần chia bình dân lúc lập thân (300 văn): **người chơi giàu lên quá mức** theo đúng điều Q5 dặn.
- **Thế giới tự chạy** (10 vùng × 100 năm): chết đói **8,0%** (năm thường 3,4%; trước S3 12,1%), tháng-quận quỹ cạn 4,2% (trước 2,2%); riêng tsvl-03 6,3%.
- **Tiền dồn vào túi NPC không dừng** (đo mỗi 20 năm): NPC nắm 0,4–0,6% tổng tiền lúc đầu → 15% / 11% (năm 20) → 40% (năm 60) → 45% / 60% (năm 100); p90 một túi 230 nghìn văn; tháng quỹ cạn trong 20 năm cuối 8,7% / 11,9%. Không có chỗ tiêu ngoài ăn và thuế đinh; trước S3, của người mất quay về quỹ quận nên dòng tiền tự cân.
- **Chỗ tiêu tiền — thử 6 phương án** (`pnpm sim world` 10 × 100 năm; "NPC nắm" là phần tiền NPC giữ năm 100, tsvl-01 / tsvl-03):

  | Phương án | Chết đói (năm thường) | NPC nắm | Quỹ cạn |
  |---|---:|---:|---:|
  | Không có (chỉ thừa kế) | 8,0% (3,4%) | 45% / 60% | 4,2% |
  | Tang lễ 30% tiền người mất vào quỹ quận | 9,0% (3,7%) | 48% / 41% | 3,0% |
  | Tang lễ 20% + chi dùng 3%/năm trên 1.000 văn | 11,0% (4,8%) | 17% / 21% | 2,0% |
  | Chi dùng 5%/năm trên 1.000 văn | 12,1% (6,2%) | 22% / 16% | 1,8% |
  | Chi dùng 10%/năm trên 1.000 văn | 18,1% (8,8%) | 11% / 8% | 1,4% |
  | Chi dùng 5%/năm trên 5.000 văn | 10,1% (4,3%) | 17% / 15% | 1,8% |
  | Chi dùng 10%/năm trên 5.000 văn | 12,3% (5,8%) | 8% / 12% | 1,6% |

  Chi dùng hằng năm chặn được tiền dồn nhưng làm mỏng khoản dự phòng nên năm đói kém chết đói nhiều hơn; tang lễ gần như không chặn được.
- **Quyết định (chủ dự án, 2026-10-28): chi dùng trên 5.000 văn**, cùng luật cho người chơi và NPC (`yearlySpending`, `economy/income.ts`): đầu năm, sau thuế đinh, người đã ra riêng tiêu một phần số tiền vượt 5.000 văn vào quỹ quận đang ở. Theo khuyến nghị đã duyệt, chỉnh nhẹ từ 5% xuống **4%/năm** để chết đói không quá 10%. Người chơi có tin `log.spend`.
- **Kết quả bản chốt:**
  - `pnpm sim world`: **PASS** — chết đói 10,0% (năm thường 4,6%); tuổi TB lúc mất 58,3; dân số 83–130%; trẻ có cha mẹ thật 87,8%; có vợ/chồng 81,5%; phụ nữ có chồng đã qua 45: 2,10 con; đói kém 9,7 năm/lần; quỹ cạn 2,0%; sổ cái giữ.
  - Tiền NPC nắm dừng quanh 16–22% (năm 40–100), không còn tăng mãi.
  - Batch 5 × 1.000 đời: **PASS**, 5 phút 9 giây. Tuổi TB: điều độ 59,64, lao lực 56,91, học giả 58,05, lang bạt 48,95, lười 24,27. Được thừa kế 64–85% đời, trung vị khoảng 10,5–12,9 nghìn văn (trước khi có chi dùng: 20–25 nghìn). Của cải trung vị lúc chết: điều độ 19.856 văn (trước S3: 35.134 — chi dùng áp cả cho người chơi).
- **Rà soát độc lập** (workflow: 4 góc nhìn, mỗi phát hiện 2 phản biện): 15 phát hiện, 11 bị bác (phần lớn là cách tính gộp của tầng L1, đúng thiết kế), 3 lỗi nhỏ được xác nhận và đã sửa: tin lập thân đếm trùng ruộng thừa kế (`becomeIndependent` nay trả đúng phần chia); thống kê thừa kế trong batch đếm thiếu (nay đếm theo thăng và cả phần còn chờ báo tin); test lưu/tải chưa đi qua trạng thái "phần chia đang chờ" (nay ép người mẹ mất đúng tuần thứ ba của tháng, so cả nhật ký).
- **Digest pin đổi:** đời mẫu chỉ nghỉ sống bằng của thừa kế, 31–43 → 42–53 tuổi.

## Ghi chú triển khai S5: gia đình người chơi (2026-10-28)
- **Người chơi trong luật gia đình:** id `n0` (`PLAYER_ID`) trong liên kết ruột thịt của NPC (vợ/chồng, cha mẹ của con người chơi); NPC cấp id từ `n1` nên không trùng. Luật gia đình nhận người chơi qua `playerStandIn` — cùng một đường với NPC:
  - vợ/chồng của người chơi luôn coi là đã có gia đình (không bị ghép lại đầu năm);
  - người chơi có vợ/chồng là một cặp nhận con như mọi cặp (hạn mức, mẹ 18–42, không sinh trong vòng một năm, dưới 5 con, đủ ăn 26 tuần), xét sau mọi cặp NPC;
  - con ăn vào kho người chơi như con NPC ăn vào kho cha mẹ: phần lương trên một năm ăn, rồi phần tiền trên 300 văn, rồi làng xóm cưu mang;
  - người thân giúp khi đói theo hai chiều: người chơi đói được vợ/chồng, cha mẹ, con đã ra riêng cùng quận giúp; vợ/chồng, con của người chơi đói được người chơi giúp từ phần trên một năm ăn;
  - người chơi là mẹ thì cũng chịu rủi ro sinh khó 1%: cái chết ghi cho đời người chơi (`illness.childbirth`), không qua `die` của NPC.
- **Cưới hỏi** (`action.propose`, nhóm xã giao, một ô, thể lực 30):
  - khóa: `lock.dependent` (chưa ra riêng), `lock.married` (có vợ/chồng còn sống), `lock.no_match` (cùng giới, người thân, người kia đã có gia đình hay chưa ra riêng, ngoài 18–35 tuổi, chồng không hơn vợ từ −3 tới 12 tuổi — cùng luật ghép đôi NPC), `lock.not_close` (người kia chưa coi mình là "bạn", thân thiết dưới 50), `lock.person_away`;
  - nhận lời (ppm) = thân thiết × 8.000 + tin cậy × 4.000 − thù hận × 10.000, rút một lần trên luồng `social`; từ chối thì thân thiết −5, có tin;
  - nhận lời: nên vợ chồng hai phía; thân thiết, tin cậy +10; khác quận nhà thì người ít ruộng hơn chuyển (bằng nhau thì người trẻ hơn), NPC không chuyển vào quận đã đầy. Người chơi chuyển thì đổi quận nhà nhưng vẫn đứng nơi đang đứng (tự đi về); NPC chuyển thì dọn về ngay, mang theo con nhỏ.
- **Sính lễ** (`payBridePrice`, cùng luật người chơi và NPC): theo xuất thân nhà trai 100 / 300 / 1.000 / 3.000 văn (gấp mười quà thăm hỏi), từ túi chồng sang túi vợ; nhà trai giữ lại 1.000 văn, chỉ đưa phần trên mức ấy.

  | Nhà trai giữ lại | Chết đói NPC (năm thường) | `pnpm sim world` |
  |---|---:|---|
  | (trước S5, chưa có sính lễ) | 10,0% (4,6%) | PASS |
  | 0 — đưa hết số đang có | 10,2% (4,3%) | FAIL |
  | 300 văn | 10,1% (4,2%) | FAIL |
  | **1.000 văn (bản chốt)** | **9,8% (4,2%)** | **PASS** |

  Chàng trai nghèo mới ra riêng mà đưa hết tiền thì rơi vào đói. Ngưỡng 10% đang nằm sát mức dao động của số đo (±0,2 điểm).
- **Góa:** vợ/chồng mất thì người chơi nhận hết của (thừa kế S3), tin ghi "Vợ"/"Chồng" theo giới; cưới lại được nếu còn trong tuổi.
- **Cha mẹ già ốm** (`event.parent_ill`): cha hoặc mẹ từ 50 tuổi đang ốm, ở cùng quận, mình đã ra riêng. Chăm nom (2 ô, thể lực; bệnh bớt 3 tuần, sức khỏe +100; thân thiết +10, tin cậy +5), mời thầy thuốc (100 văn vào túi thầy thuốc trong quận, không có thì quỹ quận; dứt bệnh; thân thiết, tin cậy +5), hoặc để người nhà lo (thân thiết −10).
- **Tang người thân** (`event.kin_funeral`): cha, mẹ, vợ/chồng, con mất trong vòng 6 tuần ở nơi mình đang đứng. Làm chu đáo (gấp mười quà thăm hỏi theo xuất thân mình, 1 ô), đơn sơ (bằng quà thăm hỏi), hoặc nhờ làng xóm. Tiền vào quỹ quận. Tiếng tăm của việc lo tang có ở S6.
- **Người chơi thấy:** tin con chào đời (`log.kin.birth`, quan trọng, ở mọi quận); `CharacterView.spouse`; danh sách người thân có vợ/chồng, con trai, con gái; tổng kết đời có vợ/chồng và con (`legacy.spouse`, `legacy.children`).
- **Chưa làm ở S5:**
  - người chơi máy biết cưới hỏi (S8): batch chưa có đời nào lấy vợ/chồng, có con;
  - tiếng tăm ảnh hưởng nhận lời (S6);
  - tổng kết đời chỉ kể người còn trong danh sách: vợ/chồng, con mất quá một năm đã bị dọn nên không còn tên (cần giữ tên người thân đã mất, đề xuất làm ở S8 cùng màn tổng kết);
  - giao diện chọn người cho ô xã giao (nhánh FE).
- **Kết quả bản chốt:**
  - `pnpm sim world` 10 vùng × 100 năm: **PASS** — chết đói 9,8% (năm thường 4,2%); trẻ có cha mẹ thật 88,2%; có vợ/chồng 81,6%; phụ nữ có chồng đã qua 45: 2,06 con; quỹ cạn 2,0%; sổ cái giữ;
  - `pnpm sim batch` (1.000 đời điều độ): **PASS** — tuổi TB 59,66 (S4: 59,64); sự kiện 2,81/năm (S4: 2,74), đủ 28 loại, có cả hai sự kiện gia đình; được thừa kế 85,3% đời.
- **Digest pin đổi:** đời mẫu chỉ nghỉ sống 49/53/42 → 52/53/42 tuổi (sính lễ NPC đổi của cải cha mẹ và phần thừa kế; thêm hai sự kiện gia đình).

## Ghi chú S8: người chơi máy `family`, chết đói, nghiệm thu (2026-10-28)
- **Chết đói của người chơi máy điều độ trên 5%** (S7: 5,1%/1.000 đời; đo 3.000 đời: 5,5%). Batch ghi hoàn cảnh từng đời chết đói (`LifeResult.starved`, có trong `--out`). 165 đời chết đói / 3.000:
  - dưới 20 tuổi 57 đời: trẻ nhà bần cùng trong năm đói kém (tuổi thơ do hộ trừu tượng nuôi, Q2);
  - từ 50 tuổi 103 đời: người già đã ra riêng, túi gần cạn (94% dưới 100 văn), 58% không ruộng, người thân gần như không giúp (người chơi máy không vợ con, cha mẹ đã mất).
  - Nguyên nhân chính: **chi dùng 4%/năm trên 5.000 văn** (S3) làm mỏng của dưỡng già. Số đo 1.000 đời ở S3: chết đói khoảng 2,6% trước khi bật chi dùng, 4,9% sau khi bật; bình dân 1% → 3%, khá giả 0% → 2%.
- **Các phương án đã đo** (world 10 vùng × 100 năm; batch điều độ 3.000 đời; "NPC nắm" là phần tiền NPC giữ năm cuối, nay `pnpm sim world` in sẵn):

  | Phương án | Batch chết đói | NPC chết đói | NPC nắm năm cuối |
  |---|---:|---:|---:|
  | 4%/năm trên 5.000 văn, mọi tuổi (S3) | 5,5% | 9,8% | 12–30% |
  | như trên, thôi chi dùng từ 50 tuổi | 4,3% | 9,2% | 19–53% |
  | như trên, thôi chi dùng từ 60 tuổi | — | 9,4% | 13–40% |
  | **4%/năm trên 15.000 văn, mọi tuổi** | **3,3%** | **8,6%** | **15–31,5%** |

  **Chủ dự án duyệt (2026-10-28): ngưỡng 15.000 văn**, cùng luật người chơi và NPC. Thôi chi dùng khi về già thì NPC già tích của, tiền lại dồn (vấn đề S3 đã chặn).
- **Người chơi máy `family`** (Q13): như điều độ; ô cuối tháng (ô nghỉ của điều độ) dành cho xã giao:
  - của trong nhà đủ ăn dưới 8 tuần: nhờ cậy (người thân trước, rồi người thân thiết hơn);
  - có người nhận lời được: cưới hỏi;
  - không thì sang thăm người hợp đôi thân nhất; nhà đủ ăn từ một năm thì thăm cả ô thứ hai.
  - Chỉ đọc view và khóa sim công bố: `Life.socialLock(slot)` trả khóa của một ô xã giao như khi ô ấy chạy (cũng dùng cho bảng chọn người F2). Người chơi máy không đoán ai đã có gia đình.
  - Đã thử cho `family` giữ dự phòng theo miệng ăn cả nhà như NPC: chết đói tăng (3.000 đời: 3,6% → 5,7%), bỏ.
- **Tiêu chí "quan hệ tác động tới kết cục"** (mục 6), chủ dự án thay một tiêu chí:
  - giữ: ≥ 70% đời `family` sống tới 30 tuổi đã cưới trước 30; ≥ 60% trong số đó có con;
  - **bỏ** "bần cùng của `family` chết đói ít hơn điều độ ít nhất 25%", **thay bằng** "`family` chết đói ≤ 5%" (cùng ngưỡng điều độ). Lý do (3.000 đời mỗi chiến lược, mọi xuất thân):

    | Chết đói theo tuổi | dưới 16 | 16–49 | từ 50 | tổng |
    |---|---:|---:|---:|---:|
    | điều độ | 55 | 5 | 40 | 100 |
    | `family` | 55 | 19 | 33 | 107 |

    Hơn nửa số chết đói ở tuổi thơ, chưa có lựa chọn nào của người chơi; có con thì lúc già được giúp (40 → 33) nhưng tuổi 16–49 nuôi con tốn lương thật (Q8), dự phòng mỏng (5 → 19).
- **Sự kiện hiếm trong batch** còn bốn (kẻ thù, đòi nợ ơn, người quen mang gạo, người quen gặp khó): cần kẻ thù, món nợ ơn, người quen thân ngoài người thân mà chưa chiến lược nào tạo ra. `family` gặp con ốm, vợ chồng lục đục nên hai sự kiện này đã bỏ khỏi danh sách miễn.
- **Hiệu năng (Q12):**
  - Node: `pnpm sim world` 154 µs/tick (ngân sách 300);
  - batch: ngân sách gấp 3 lần v0.3 trên mỗi chiến lược (v0.3: 107 giây / 5 chiến lược → khoảng 64 giây). Đã tối ưu:
    - việc giao cho luồng 20 → 5 đời (đời dài cuối cùng không giữ cả batch chờ);
    - hàm trọng số của các sự kiện quan hệ, gia đình xét điều kiện rẻ trước khi quét người trong quận (bà mối từng tốn 5% thời gian chạy đời);
    - `family` tính khóa cưới hỏi mỗi người một lần mỗi tuần.

    Chạy riêng: điều độ 79,7 → 70,8 giây, `family` 86,7 → 80,2 giây. Batch đủ sáu chiến lược sau tối ưu: 6 phút 41 giây (trước 7 phút 13 giây) — lười 29,6, điều độ 74,5, lao lực 71,6, học giả 75,5, lang bạt 61,9, `family` 78,7 giây: **bốn chiến lược vượt ngân sách 12–23%**, tổng vượt 4% (401 so với 385 giây). Phần còn lại là chi phí luật trải đều trên vài trăm NPC mỗi tuần (pha NPC 83% thời gian chạy đời, tầng L1 63%), không còn điểm nóng riêng;
  - trình duyệt +1 năm: thuộc nhánh FE (F5), chưa đo lại.
- **Đổi nhỏ ngoài ý:** sự kiện "cha mẹ già ốm" nay xét cha trước rồi mẹ, đúng như ghi chú của nó (trước đây chọn người có id nhỏ hơn); batch điều độ chỉ đổi số kỹ năng trung bình ở chữ số cuối.
- **Digest pin đổi** (ngưỡng chi dùng); tuổi, nguyên nhân chết của ba đời mẫu giữ nguyên (51/52/42).
- **Kết quả nghiệm thu sim:**
  - `pnpm typecheck`, `pnpm test`: PASS (sim 275, shared 83, worldgen 29, headless 6, game 40);
  - `pnpm sim world --seeds 10 --years 100`: PASS — chết đói 8,6% (năm thường 3,8%), dân số 83–130%, trẻ có cha mẹ thật 90,3%, có vợ/chồng 81,1%, 2,15 con mỗi phụ nữ có chồng, quỹ cạn 2,2%, sổ cái giữ, NPC nắm 15–31,5% tổng tiền, 154 µs/tick;
  - `pnpm sim batch --policy all`: PASS mọi tiêu chí — điều độ 59,64 tuổi, chết đói 2,9%; `family` 59,16 tuổi, chết đói 3,1%, cưới trước 30 tuổi 72,6%, có con 85,3%; 2,59 sự kiện/năm; NPC lệch 0,03 năm. **Thời gian vượt ngân sách Q12** như trên.
- **Quyết định (chủ dự án, 2026-10-28):** nhận thời gian batch hiện tại cho v0.5. **Nợ kỹ thuật v0.6:** tối ưu pha NPC tầng L1 (63% thời gian chạy đời) để mỗi chiến lược về ≤ 64 giây, kết quả batch, world, digest giữ nguyên.
