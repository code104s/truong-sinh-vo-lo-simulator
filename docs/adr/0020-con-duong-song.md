# ADR 0020 — Con đường sống: thân phận nghề của người chơi

- Trạng thái: **ĐÃ DUYỆT** (2026-10-29, chủ dự án đồng ý mọi khuyến nghị Q1–Q12 ở `docs/v0.7-giai-doan-a.md`).
- Ngày: 2026-10-29
- Liên quan: GDD 1.1, 3.2 E, F, I, K, 5 (v0.7); ADR 0001, 0014, 0017, 0019

## Bối cảnh
- **GDD 3.2 K:** người chơi có thể sống bằng nhiều nghề (nông dân, thợ thủ công, thợ săn, thương nhân, thầy thuốc học việc, lính/võ sinh, tán nhân lưu lạc, ẩn dật); chuyển nghề tốn thời gian và quan hệ; mỗi nghề có tuổi thọ trung bình riêng.
- **GDD 5 (v0.7):** "6+ con đường sống khác biệt rõ", khoảng 100 sự kiện.
- **Hiện trạng** (`docs/v0.7-giai-doan-a.md` mục 2):
  - người chơi chỉ có "việc hay làm" (làm ruộng, làm thuê, săn, buôn bán nhỏ…), không có thân phận;
  - NPC đã có nghề (`occupation`) từ v0.4, thêm `bandit`, `official` ở v0.6;
  - thế lực v0.6 đã có kho, người, đất, nhưng chưa có thái độ với người chơi.

## Phương án
| | A. Thân phận nghề có bậc (khuyến nghị) | B. Nghề suy ra từ việc hay làm | C. Cây kỹ năng mở khóa nghề |
|---|---|---|---|
| Cách làm | Trạng thái `career` (nghề, bậc, từ khi nào, nơi nhận); vào bằng hành động hay sự kiện; lên bậc theo kỹ năng và số năm | Mỗi năm xem việc nào làm nhiều nhất thì gọi là nghề | Đủ điểm kỹ năng thì "mở" nghề, không cần ai nhận |
| Ưu | Rời nghề có giá thật (mất bậc, mất thầy); gắn được thế lực (thương hội, nha môn, băng cướp); NPC và người chơi dùng chung bảng nghề | Rẻ, không thêm trạng thái | Dễ hiểu, dễ cân bằng |
| Nhược | Thêm trạng thái, hành động, sự kiện | Không có thầy, hội, nơi nhận; đổi nghề không tốn gì, trái GDD 3.2 K | Mùi "game hóa", trái giọng thế giới; không cần quan hệ |

## Quyết định: phương án A
- **Chín nghề** (Q3): `farmer`, `artisan`, `hunter`, `merchant`, `physician`, `soldier` (sai dịch nha môn), `drifter`, `recluse`, `outlaw` (theo cướp, Q8). Thầy đồ để v0.8.
- **Bậc** (Q1): `apprentice` → `journeyman` → `master` (học việc → làm được → có tiếng). Mỗi lúc một nghề. Không vào nghề nào thì sống bằng việc tự do như v0.6.
- **Rời, đổi nghề** (Q1): mất bậc và quan hệ với thầy, hội; quay lại phải học việc lại.
- **Kỹ năng y thuật** (`medicine`, Q6) cho thầy thuốc.
- **Thái độ thế lực với người chơi** (Q9): một trục mỗi thế lực, gửi theo dải `ATTITUDE_BANDS`.
- **Đo "6+ con đường"** (Q2): batch nghề riêng `--policy paths`, 500 đời mỗi nghề; hai nghề bất kỳ khác nhau ở ít nhất 2 trong 5 mặt (tuổi thọ, nguyên nhân chết, của cải, kỹ năng chính, sự kiện riêng); không nghề nào trội hẳn.
- Tuổi thọ theo nghề **nảy ra** từ rủi ro, thu nhập, sức lao động; không đặt tay.
- **Phiên bản** (Q12): `PROTOCOL_VERSION` 7, `SAVE_VERSION` 7, `SIM_VERSION` 0.7.0; save v0.6 bị từ chối.

## Hệ quả
- Snapshot thêm `career` của người chơi (vài chục byte); kỹ năng thêm một mục.
- Mọi chỗ duyệt `SKILLS` thấy thêm `medicine`; kỹ năng mới bằng 0 nên hành vi v0.6 không đổi tới khi có việc dùng y thuật (S5).
- Thêm chín người chơi máy: batch nghề tách riêng để batch v0.6 giữ trong 90 s mỗi chiến lược (Q10).

## Ghi chép thực hiện

### Bước 0 (2026-10-29)
- Hợp đồng v7 ở `packages/shared` (chi tiết ở ADR 0001 mục "v0.7 Bước 0"): `careers.ts` mới; `CharacterView.career`; `LifeSummary.legacy.careers`.
- **Khác bản nháp** (Giai đoạn A mục 4): kiểu bản ghi nghề trong tổng kết đặt tên `CareerRecord` và để ở `careers.ts`. Hành động nghề (`action.*`) và gửi `FactionView.attitude` chưa làm ở Bước 0, để S1 và S7 vì cần luật.
- Sim: `career` trong snapshot luôn `null`; `view().career` luôn `null`; `legacy.careers` luôn rỗng; kỹ năng `medicine` bằng 0, không việc nào dùng.
- Nội dung: `career.<nghề>`, `career.rank.<bậc>`, `skill.medicine`.
- Hành vi không đổi: ba đời mẫu trong digest pin giữ tuổi và nguyên nhân chết, chỉ digest đổi vì snapshot đổi hình.

### S1 — khung nghề (2026-10-29)
- **Bảng nghề chung** (`sim/src/life/career.ts`, `CAREER_DEFS`): mỗi nghề có nghề NPC tương ứng, kỹ năng chính, việc tính là làm nghề, cách vào nghề.
  - NPC ↔ người chơi: `farmer` ↔ nông dân, `laborer` (làm thuê ở trấn, thành) ↔ thợ thủ công, `hunter` ↔ thợ săn, `merchant` ↔ thương nhân, `physician` ↔ thầy thuốc, `official` ↔ sai dịch, `bandit` ↔ theo cướp. Thầy đồ (`teacher`) chưa có nghề người chơi (v0.8).
  - Cách vào: **qua thầy** (nông, thợ, săn, buôn, thuốc — S1), **qua thế lực** (sai dịch S4, theo cướp S6), **tự vào** (lưu lạc, ẩn dật S6).
- **Xin học việc** (`action.apprentice`, nhóm xã giao, nhắm vào một người):
  - thầy là NPC cùng quận, nghề học qua thầy, từ 25 tuổi; người lạ phải quen biết (thân thiết từ 20), người thân thì không;
  - lần xin: nhận với xác suất 20% + thân thiết × 0,6% + tin cậy × 0,4% − thù hận × 0,8% + tiếng tăm × 0,3% (+30% nếu là người thân); nhận thì nộp lễ nhập môn (ba lần quà thăm hỏi) vào túi thầy — người thân dạy con cháu thì không lấy lễ (thử trên giao diện: đứa trẻ 14 tuổi chưa có tiền không theo cha học nghề được); bị từ chối thì thân thiết −2;
  - đã là thầy mình thì mỗi ô là một buổi học: kỹ năng chính lên gấp đôi ô làm thường, thầy trò thân thiết, tin cậy +1.
- **Năm làm nghề, lên bậc** (đầu năm, không rút RNG): năm có từ 12 ô làm việc của nghề hoặc học việc thì tính một năm. Làm được: 3 năm và kỹ năng "Thạo" (1.000); có tiếng: 10 năm và "Giỏi" (4.000). Nghề không có kỹ năng chính chỉ xét năm.
- **Rời, đổi nghề** (Q1):
  - lệnh `LEAVE_CAREER` (không tốn ô): mất bậc, thầy cũ thân thiết, tin cậy −20; nghề đã rời ghi vào tổng kết đời;
  - xin học thầy nghề khác: rời nghề cũ như trên rồi vào nghề mới ở bậc học việc; đổi thầy cùng nghề thì giữ bậc, thầy cũ −10;
  - hai năm liền không làm nghề thì coi như bỏ nghề.
- **Việc riêng của nghề:** S1 chỉ định việc nào tính là làm nghề (ruộng, làm thuê, săn và hái lượm, buôn bán nhỏ). Việc chỉ người trong nghề làm được thêm theo từng nghề ở S2–S6. Thầy thuốc chưa có việc hành nghề tới S5: tới đó chỉ học việc mới tính năm làm nghề.
- **Hệ quả đo được:** người chơi máy chưa ai xin học việc nên batch, `world` trùng Bước 0; digest đổi vì snapshot thêm `careers`.

### S2 — nông dân, thợ thủ công, thợ săn (2026-10-29)
- **Việc riêng của nghề:** `ActionDef.career`, `minRank`; người không đủ bậc thấy việc ấy trong bảng chọn với khóa `lock.career`. Bậc tính theo `rankStep`: học việc 0, làm được 1, có tiếng 2. NPC chưa có thân phận nghề nên mọi hệ số giữ nguyên (batch, `world` không đổi).
- **Nông dân:**
  - gặt +10% (làm được), +20% (có tiếng);
  - **thuê ruộng:** việc làm quá phần ruộng nhà vẫn là ruộng thuê như v0.3, nhưng lão nông có bậc thuê được tô nhẹ hơn: 45%, 40% (người khác 50%);
  - **mua ruộng** (`action.buy_land`, ai cũng làm được): ở làng quê nhà, người đã ra riêng; mua của dân nền, 1.000 văn một mẫu (giá thước đo uy thế gia tộc v0.6), tiền vào quỹ quận; mỗi quận mỗi năm dân nền bán tối đa 3 mẫu; năm đói kém bán tháo, giá 60%. Tá điền mua được ruộng thành chủ ruộng; từ 20 mẫu thành địa chủ (ruộng không tự làm cho tá điền cấy, thu tô như nhà giàu v0.3).
- **Thợ thủ công:**
  - làm thuê lương ×110%, ×120% theo bậc;
  - **việc xưởng** (`action.craft`, ở trấn, thành, từ bậc làm được): bỏ 40 văn vật liệu trước; có đơn (70%, có tiếng 85%) thì quỹ quận trả 180 văn theo kỹ năng; không có đơn thì mất vật liệu — lời hơn làm thuê nhưng có ô trắng tay;
  - **học trò:** thợ có tiếng có học trò phụ việc: công ×130%, mỗi ô nuôi học trò 2 thăng (vào kho chợ). **Khác kế hoạch:** học trò là phần trừu tượng của xưởng, chưa phải NPC thật; NPC học nghề người chơi cần NPC có thân phận nghề — để khi làm nghề cho NPC.
- **Thợ săn:**
  - thịt, da ×115%, ×130% theo bậc ("chỗ bán da" là giá da theo bậc: người có tiếng bán được giá); rủi ro săn ×85%, ×70%;
  - **đặt bẫy** (`action.trap`, ở làng, thợ săn mọi bậc): tốn ít sức (60), ít rủi ro; được (40% + kỹ năng săn, tới 80%) thì 6 thăng thịt, 10 văn da theo kỹ năng và bậc.
- Ba đường khác nhau về rủi ro: nông dân chịu thời tiết, thợ chịu đơn hàng (tiền), thợ săn chịu nạn thân thể.

### S3 — thương nhân (2026-10-29)
- **Buôn tự do — đi buôn chuyến** (`action.haul`, nhóm `travel`, nhắm vào một quận như di chuyển; thương nhân mọi bậc; `sim/src/life/merchant.ts`):
  - chuyến đi về: số ô gấp đôi đường đi, xong chuyến vẫn ở quận cũ; tính trọn lúc khởi hành (các ô sau là đường đi, tốn tiền trọ, có rủi ro thân thể như đi đường, có sự kiện đường xá);
  - mua lương ở quận đang đứng theo giá niêm yết, trả phí chở (công thức lái buôn của chợ, ADR 0012) cho quận ấy, bán ở quận đích theo giá niêm yết — lương đi đúng dòng từ kho quận rẻ sang kho quận đắt; lời mỗi đấu = giá nơi bán − nơi mua − phí chở;
  - vốn mỗi chuyến theo bậc: 1.000 / 3.000 / 10.000 văn; mỗi chuyến mua tối đa 5% kho quận nguồn, không quá quỹ quận đích;
  - chỉ khởi hành khi đủ 200 văn và chuyến có lời (khóa tạm `lock.no_profit`, giá đổi thì mở);
  - **rủi ro vốn** (rút một lần mỗi chuyến): đường xấu 3% nhân hệ số đường (địa hình, người giữ), hỏng nửa hàng; chặng có băng cướp giữ 25%, mất cả hàng vào kho băng cướp.
- **Hội viên thương hội** (`action.join_guild`, nhóm xã giao, nhắm vào một hội viên NPC cùng quận để bảo lãnh):
  - thương nhân từ bậc làm được; người lạ phải quen biết; góp 1.000 văn vào kho hội như NPC (v0.6 S3); nhận hay không theo quan hệ như xin học việc;
  - chia lãi theo quý như hội viên NPC; hội tan thì nhận phần chia, thân phận nghề không còn hội (`log.guild.ended`); người chơi không tính vào số hội viên để lập, tan hội (luật v0.6 chỉ đếm thương nhân NPC);
  - theo đoàn buôn: rủi ro vốn một nửa, nộp 25% phần lời mỗi chuyến vào kho hội — hội viên lời đều hơn, buôn tự do lời to hơn nhưng dễ mất vốn (Q4).
- Rời nghề (lệnh `LEAVE_CAREER`) là rời cả hội.
- **Giao diện chưa xếp được chuyến buôn:** bảng chọn hiện chỉ dựng ô đích cho di chuyển; chọn quận đích cho chuyến buôn để F-task. Xin vào thương hội đã có trong bảng chọn người. F3b (2026-10-29) đã thêm: ô "Đi buôn chuyến" trong nhóm đi lại mở bảng chọn quận đích và hàng chở (`STATE.hauls`).

### S4 — lính: sai dịch nha môn, võ đường (2026-10-29)
- **Vào nha môn** (`action.enlist`, ở trị sở quan phủ, 18–45 tuổi; `sim/src/life/soldier.ts`), cùng luật tuyển sai dịch NPC (v0.6 S5):
  - còn chỗ trong định biên (một người cho trị sở cộng một mỗi 3 quận giữ, tối đa 6) và kho đủ bốn quý lương thì nhận;
  - **thay người kém** (chủ dự án chọn, 2026-10-29): đủ người thì ứng viên hơn sai dịch kém nhất từ 500 điểm chữ + võ thay người ấy, người bị thay về nghề cũ. Áp cho cả NPC: mỗi quý ứng viên NPC giỏi nhất chưa được tuyển cũng thay được người kém, kể cả người chơi (`log.soldier.replaced`). Lý do: đo `world` thì kho quan phủ luôn dư (70.000–240.000 văn), sai dịch chỉ nghỉ khi chết hay thua trận — chờ chỗ trống mất 10–15 năm;
  - kho cạn: người kém nhất nghỉ trước (trước đây là người tuyển sau cùng; đổi cho khớp luật thay người kém, kẻo người vừa nghỉ lại thay ngay người kém hơn); người chơi bằng điểm thì nghỉ trước (`log.soldier.dismissed`);
  - vào nghề lính bậc học việc, nơi nhận là quan phủ; đang làm nghề khác thì rời.
- **Lương** 900 văn mỗi quý từ kho quan phủ như sai dịch NPC; người chơi theo bậc 100 / 120 / 150%.
- **Nợ lương** (Q5), cho mọi sai dịch: quan tham (độ tham từ 67) giữ lại (độ tham − 50)% lương mỗi quý, ghi nợ từng người (`FactionState.owed`, trường tùy chọn, chỉ quan phủ); quan không tham trả hết nợ cũ cùng lương quý; thôi việc thì mất phần nợ, tiền ở lại kho.
- **Theo trận tiễu phỉ**: người chơi là sai dịch theo mọi trận của quan phủ, góp thế (2.000 + võ nghệ). **Thương vong cho mọi người tham chiến hai bên** (cùng luật): bị thương 5% bên thắng, 20% bên thua, nhân theo võ nghệ; bị thương thì có thể chết ngay như tai nạn (`accident.battle`); bên thua bị gãy xương. NPC chết trận thì mất, của để lại cho người thừa kế như mọi người.
- **Đi tuần** (`action.patrol`): việc của nghề lính, tính năm làm nghề, lên võ; không thêm tiền (đã có lương). Hai năm không đi tuần thì mất nghề như mọi nghề.
- **Võ đường** (`action.dojo`, trấn, thành): học phí 40 văn mỗi ô vào quỹ quận, võ lên gấp đôi tự luyện, rủi ro một nửa — đường của võ sinh vào nha môn.

### S5 — thầy thuốc (2026-10-29)
- **Học việc:** xin học việc với thầy thuốc NPC (luật S1: lễ nhập môn vào túi thầy, mỗi ô học việc là một buổi giúp việc không công, y thuật lên gấp đôi). Lên "làm được" sau 3 năm và y thuật "Thạo" (1.000).
- **Hành nghề y** (`action.practice`, mọi nơi, thầy thuốc từ bậc làm được; tính năm làm nghề, lên y thuật):
  - mỗi ô 80% có khách (rút một lần trên luồng `actions`); có khách thì quỹ quận trả phí thay người bệnh trong dân nền, như đơn hàng của việc xưởng: 100 văn × y thuật (tới +60%) × bậc (có tiếng ×130%);
  - mỗi ca dùng nửa phần thảo dược (S3b): lấy trong túi, thiếu thì mua phần thiếu ở chợ đang đứng; không có thuốc thì phí còn một nửa — thuốc thành vật tiêu hao, có thêm cầu cho chợ thuốc;
  - **mùa dịch** (quận đang có dịch): phí gấp đôi, nhưng mỗi ô lây bệnh 6% (ngày thường 0,5%), cộng vào khởi phát bệnh của tuần; rút trên luồng `illness` khi đang không bệnh. Đã đóng cửa phòng dịch cũng không tránh được lây khi hành nghề.
  - kỳ vọng mỗi ô (làm được, y thuật Thạo, có thuốc): khoảng 85 văn, trừ thuốc khoảng 9 văn — hơn làm thuê, kém việc xưởng của thợ có tiếng; mùa dịch gần gấp đôi.
- **Người bệnh NPC** (Q6): người chơi là thầy thuốc từ bậc làm được thì người bệnh NPC chữa bệnh ở quận người chơi đang đứng trả phí (luật phí v0.5) cho người chơi, không cho thầy thuốc NPC quận ấy. Pha NPC nhận "người chơi hành nghề ở đâu" từ đời người chơi mỗi tick (`PlayerDoctor`), không lưu.
- **Khác Q6:** "có tiếng thì được mời đi xa" chưa làm — hợp với sự kiện nghề (mỗi nghề 5–7 sự kiện, Q3), để task sự kiện.
- **NPC thầy thuốc** vẫn làm thuê ngày thường và nhận phí chữa bệnh như v0.5; việc hành nghề y chỉ người chơi có thân phận nghề (như việc xưởng, đặt bẫy, đi tuần ở S2–S4). Vì vậy `world`, batch không đổi.

### S6 — lưu lạc, ẩn dật, theo cướp (2026-10-29)
Mã ở `sim/src/life/wayward.ts`; luật thu nhập ở `economy/income.ts`, nhịp sự kiện ở `events/engine.ts`, băng cướp ở `factions/bandits.ts`, tiễu phỉ ở `factions/government.ts`.
- **Lưu lạc** (Q7):
  - vào nghề bằng việc **bỏ quê** (`action.drift`, một ô): người đã ra riêng, không ruộng (`lock.has_land`); đang làm nghề khác thì rời;
  - không nộp thuế đinh nơi nào;
  - đi đường thì kiếm ăn dọc đường như hái lượm; từng trải thì rủi ro đi đường ×85% (làm được), ×70% (có tiếng);
  - sự kiện đường xá và cơ duyên gấp đôi; quan hệ phai gấp đôi mỗi năm (ít quan hệ bền);
  - việc tính là làm nghề: đi đường, làm thuê, săn, hái lượm; không có kỹ năng chính nên lên bậc chỉ theo năm.
- **Ẩn dật** (Q7):
  - vào nghề bằng việc **dựng lều** (`action.build_hut`, một ô, tốn sức): ở quận có đường núi (cùng ngưỡng địa hình với sào huyệt cướp; `lock.no_mountain`); quận ấy thành quê; đang ẩn dật thì chỉ dời lều;
  - không nộp thuế đinh;
  - hái lượm quanh lều được ×150 / 170 / 200% theo bậc (nương rẫy, vườn rau); xa lều thì như mọi người;
  - cơ duyên gấp đôi, chuyện thường ngày và chợ búa còn một nửa;
  - việc tính là làm nghề: hái lượm, săn, làm ruộng; kỹ năng chính săn bắt.
- **Theo cướp** (Q8):
  - vào băng qua sự kiện **người lạ rủ rê** (`event.bandit_lure`, v0.6): thêm lựa chọn "Theo họ lên núi" — vào nghề theo cướp, nơi nhận là băng thật; tiếng tăm −20 ở quận đang đứng; người thân xa lánh (thân thiết, tin cậy −15); người rủ thân hơn. Lựa chọn đặt sau "nhận gạo" nên người chơi máy (chọn giá nhẹ nhất, bằng nhau lấy lựa chọn trước) không đổi hành vi;
  - **chia của** mỗi quý như một người trong đảng (lương, nửa tiền), góp thế vào đảng; không tính vào số người để lập, tan đảng (như hội viên thương hội, S3); đảng tan thì nhận phần chia và về làm dân (`log.outlaw.disband`);
  - **bị truy:** quan phủ tiễu băng mình thì người chơi theo trận bên cướp (thương vong như S4); quan phủ thắng thì bị bắt với xác suất 50% (như nửa đảng bị bắt): mất nghề, tịch thu nửa túi vào kho quan phủ, tiếng tăm quận nhà −10;
  - **ra băng khó:** lệnh rời nghề khi đang theo cướp — đủ 1.000 văn thì chuộc tội (vào kho quan phủ, tiếng tăm quận nhà +10); không đủ thì trốn: người trong băng thù (+40). Không rút RNG;
  - việc tính là làm nghề: hái lượm, săn, luyện võ; kỹ năng chính võ nghệ.
- **Khác Q8, để sau:** "bị bắt theo" (bị cướp bắt lên núi) và "khi đói ở gần sào huyệt" chưa có sự kiện riêng — sự kiện người lạ rủ rê đã chỉ đến với người túng đói, không ruộng ở nơi băng với tới; sự kiện riêng của nghề để S8. Đường băng mình giữ chưa miễn rủi ro cướp cho người chơi.
- **Hệ quả đo được:** người chơi máy chưa ai bỏ quê, dựng lều hay theo cướp nên `world`, batch không đổi; batch theo nghề ở S9.
- **Sửa ở F5 (2026-10-29):** dựng lều dời quê nhà nhưng kiểm save lúc tải (`life/region.ts`) còn đòi quê nhà là quận nơi sinh, nên save ẩn dật ở quận khác bị từ chối (`BAD_SAVE`). Bỏ điều kiện ấy (vẫn kiểm quê nhà trong vùng); test hồi quy ở `host.test.ts`.

### S7 — thái độ thế lực với người chơi (2026-10-29)
Mã ở `sim/src/factions/attitude.ts`.
- **Trục:** mỗi thế lực một số −100..100 (`FactionState.playerAttitude`, trường tùy chọn: không có là 0, nên thế giới không người chơi không ghi gì và `world` không đổi). Dải gửi cho giao diện (`FactionView.attitude`, từ S7 luôn gửi): ghét từ −40, dè chừng −39..−10, thường −9..29, thân từ 30. Không gộp với tiếng tăm theo quận.
- **Đổi theo sự kiện thế lực** (bảng `attitude` theo kết quả trong định nghĩa sự kiện, thế lực thật lấy qua `factions`):
  - quan phủ: nộp tiền miễn phu, đi phu, nộp sách nhiễu, xếp hàng phát chẩn (+); lót tay hỏng, cãi sách nhiễu, lót tay thư lại (−);
  - băng cướp: nhận gạo chỉ đường (+15, quan phủ −5), nộp của khi cướp về (+5); báo quan, đánh lại cướp (−20 … −40);
  - báo quan bắt cướp: quan phủ +5 … +15, băng −20 … −30;
  - thương hội: theo đoàn làm phu, áp tải (+); từ chối (−2);
  - họ lớn: kiện ruộng (−10, −20), chịu nhường, dàn xếp (+); dạm hỏi thông gia: đi xem mặt (+10).
- **Đổi theo nghề:** vào nha môn, vào hội +20; theo cướp: băng +30, quan phủ −30; mỗi quý ở trong thế lực +2 (tới 60); theo cướp thì quan phủ −2 mỗi quý (tới −80); bỏ nha môn, bỏ hội −10; chuộc tội ra băng: quan phủ +20, băng −20; trốn băng: băng −40.
- **Ảnh hưởng:**
  - **vào nghề:** thế lực ghét thì không nhận (`lock.hostile`): nha môn, thương hội, băng cướp;
  - **lương:** sai dịch nhận lương × (100 + thái độ / 5)%, trong khoảng ±10%;
  - **giá:** phần lời nộp hội khi theo đoàn buôn: hội thân 20%, hội dè chừng hay ghét 30% (thường 25%);
  - **trọng số sự kiện thế lực:** chuyện có lợi (phát chẩn, rủ rê, theo đoàn, dạm hỏi, báo quan) × 50 / 75 / 100 / 150% theo dải ghét → thân; chuyện gây khó (bắt phu, sách nhiễu, cướp về làng, kiện ruộng) × 200 / 150 / 100 / 50%.
- Người chơi máy chọn trong sự kiện thế lực nên thái độ đổi theo, nhịp sự kiện thế lực của họ đổi. Đo (batch 500 đời × 6 chiến lược, 10 thế giới, so với sau S6): chết đói trừ "lười" 265 → 267, tuổi trung bình lệch dưới 0,1 năm mọi chiến lược, sự kiện 2,77/năm giữ. `world` 100 năm trùng hệt (không người chơi).

### S8 — sự kiện (2026-10-29)
Mã ở `sim/src/events/defs/careers.ts` (sự kiện nghề) và `defs/seasons.ts` (sự kiện chung); văn bản ở `content/src/strings/events.careers.vi.ts`, giọng E (`docs/van-phong.md`).
- **51 sự kiện mới, tổng 100:**
  - **năm sự kiện mỗi nghề** (45), chỉ đến với người đang làm nghề ấy (theo bậc, việc đang làm, nơi đứng, mùa):
    - nông dân: đổi giống đầu vụ, tranh lượt nước, lúa được giá, lão nông chỉ việc, trâu ốm;
    - thợ thủ công: đơn hàng lớn, gãy đồ nghề, phường thợ thu lệ, có người xin học nghề, món đồ khéo;
    - thợ săn: dấu hổ, tấm da quý, rừng cấm, bẫy dính người, thợ săn già;
    - thương nhân: tin đồn giá, tiền giả, người rủ hùn vốn, trạm thu thuế chợ, ngựa thồ gục;
    - thầy thuốc: gọi cửa nửa đêm, làng dịch cầu thầy, **được mời đi xa** (thầy có tiếng; phần Q6 để lại từ S5), mùa hái thuốc, người bệnh không qua;
    - lính: có người dúi tiền, áp tải thuế, ẩu đả ở chợ, thao luyện, nợ lương;
    - lưu lạc: việc vặt dọc đường, ngủ nhờ chùa hoang, người cùng đường, tấm bản đồ lạ, nhớ quê;
    - ẩn dật: thú rừng quanh lều, người lên núi tìm, gặp ẩn sĩ, lở đất mùa mưa, thung lũng thuốc;
    - theo cướp: **bị bắt lên núi** (phần Q8 để lại từ S6: đi qua chặng băng giữ thì có thể bị bắt theo, chuộc mạng hay bỏ chạy; đến với mọi người, không cần nghề), đêm đi cướp, chia của bất công, tin nhà, lệnh chiêu an (ra hàng thì rời băng không phải chuộc tội);
  - **sáu sự kiện chung:** chợ phiên, lễ cơm mới, chuột phá ruộng, quan tuần du, đò ngang, góp làm cầu.
- Sự kiện nối vào luật v0.7: hàng trong túi (thảo dược chữa trâu, gửi thuốc; da, đồ thủ công cất vào gánh), thái độ thế lực (bảng `attitude`, S7), tuần công mùa (`farmWeeks`: chờ lượt nước, trâu chết, chuột phá), sáu sự kiện gọi người thật (lão nông, đứa trẻ xin học, người sập bẫy, thương nhân rủ hùn, người nhà).
- Mỗi lựa chọn có giá; lựa chọn chỉ đổi thái độ thế lực (từ chối nộp lệ, chối bẫy, xé bảng chiêu an) khai thêm giá "mất cơ hội" để bài kiểm "mỗi lựa chọn có giá thật" thấy được.
- Batch: người chơi máy chưa theo nghề nên sự kiện nghề nằm trong danh sách "hiếm" của batch (`RARE_EVENTS`) tới batch theo nghề ở S9.
- Đo (batch 500 đời × 6 chiến lược, 10 thế giới, so với sau S7): sự kiện 2,77 → 2,97 mỗi năm sau 12 tuổi (mục tiêu 2–4); chết đói trừ "lười" 267 → 253; tuổi trung bình lệch dưới 0,5 năm mọi chiến lược; mọi sự kiện không thuộc nghề đều xảy ra. "Bị bắt lên núi" 0,8% mỗi tuần trên chặng băng giữ thì chưa ai gặp (cướp đường đến trước), nâng 2% thì gặp. `world` trùng hệt (không người chơi).

### S9 — người chơi máy theo nghề, cân bằng (2026-10-29)
- **Batch theo nghề** (`pnpm sim batch --policy paths`, mỗi nghề 500 đời; `tools/headless/src/paths.ts`): mỗi nghề một người chơi máy, chỉ đọc view và khóa sim công bố. Sống còn trước (bộ não nhu cầu chung với NPC); từ 15 tuổi tìm đường vào nghề:
  - nghề qua thầy: xin học việc với thầy cùng quận, người lạ thì sang thăm cho quen, không có thầy thì đi nơi khác (thợ, buôn, thuốc lên trấn; nông, săn về làng);
  - lính: tới trị sở, chưa có chỗ thì luyện võ (võ đường nếu có tiền) cho hơn người đang làm;
  - lưu lạc: bỏ quê khi không có ruộng; ẩn dật: tìm quận có đường núi dựng lều; theo cướp: đi đường băng cướp giữ, nhận lời khi được rủ hay bị bắt;
  - vào rồi thì làm việc của nghề; sự kiện riêng của nghề mình chọn làm đúng việc nghề (lựa chọn đầu đang mở); sự kiện khác như người điều độ. Thương nhân buôn nhỏ khi vốn từ 4.000 văn như thương nhân NPC; nông dân lúc nông nhàn hái lượm, không đi săn.
- **Tiêu chí** (mục 6, Q2): một đời "trọn đời trong nghề" khi đã vào nghề và số năm làm nghề từ hai phần ba quãng từ lúc vào tới lúc chết. Không đòi còn nghề lúc chết: về già không làm nổi thì bỏ nghề (hai năm không làm) như mọi người. Nghề đạt khi ít nhất nửa số đời trọn đời trong nghề. Năm mặt khác biệt: tuổi thọ lệch ≥ 3 năm; nguyên nhân chết chính khác hay một nguyên nhân lệch ≥ 10 điểm; của cải trung vị lệch ≥ 1,5 lần; kỹ năng trung bình cao nhất khác; cả hai nghề có ≥ 30% sự kiện là sự kiện riêng.
- **Cân bằng (chủ dự án chọn hướng A, 2026-10-29):** lượt đầu sáu nghề đạt "trọn đời" nhưng ba cặp (nông – săn, thợ – lính, buôn – lính) chỉ khác một mặt: nghề nào cũng chết quanh 58–60 tuổi, phần lớn vì bệnh. Đổi chỉ cho người chơi có nghề (NPC, `world`, batch v0.6 không đổi):
  - **thợ săn có bậc vào rừng sâu:** rủi ro săn, bẫy ×160% (làm được), ×220% (có tiếng); S2 là 85, 70% — thợ săn lành nghề an toàn hơn người thường nên sống, chết như nông dân đi săn mùa nông nhàn;
  - **lính:** đi tuần rủi ro 2.500 ppm (S4: 400); lương sai dịch của người chơi theo bậc 85 / 95 / 110% lương lệ (S4: 100 / 120 / 150%).
  - Thử trước khi chọn: lính đi tuần 1.500 ppm, lương giữ thì chưa đủ khác thợ, buôn; lương 80 / 90 / 100% thì lại sát thợ săn về của cải (1,45 lần).
- **Kết quả** (batch theo nghề 500 đời mỗi nghề, sau hướng A): PASS — sáu nghề sống trọn đời trong nghề (nông, thợ, săn, buôn, thuốc, lính), 15 cặp đều khác ít nhất hai mặt, không nghề nào trội hẳn; 54–61 s mỗi nghề. Lưu lạc, ẩn dật, theo cướp ít người vào (27%, 20%, 0,2% số đời): ngã rẽ hiếm theo luật vào nghề (không ruộng; quận núi rừng; chỉ qua sự kiện).
- **Sự kiện:** "mùa hái thuốc" bỏ điều kiện ở làng (thầy thuốc người chơi máy ở trấn chưa bao giờ gặp). Sự kiện riêng của nghề ghi `career`, bộ rút sự kiện bỏ qua sớm với người không làm nghề ấy.
- **Tối ưu** (đo xen kẽ với v0.6, ADR không đổi luật): bảng chọn gọi thẳng khóa ứng tuyển, bỏ quê, dựng lều thay vì dựng cả bộ móc xã giao; bộ móc xã giao dựng một lần mỗi tick; NPC không có hàng thì không gọi hàm bán. Batch điều độ 105,6 → 99,6 s, gia đình 127,4 → 104,5 s (v0.6: 81,8 / 90,1 s). Chủ dự án nhận mức mới (2026-10-29): ngân sách batch v0.6 nâng 90 → 110 s mỗi chiến lược. Báo cáo đầy đủ: `docs/v0.7-bao-cao-sim.md`.
