# ADR 0021 — Kho đồ: hàng hóa trong túi người, chợ hàng mỗi quận

- Trạng thái: **ĐÃ DUYỆT** (2026-10-29, chủ dự án đồng ý mọi khuyến nghị Q13–Q20; phụ lục S3b ở `docs/v0.7-giai-doan-a.md` mục 9, Q13–Q20).
- Ngày: 2026-10-29
- Liên quan: GDD 1.1, 3.2 F, K; ADR 0012 (kinh tế phàm nhân), 0013 (hộ), 0018 (thừa kế), 0019 (thế lực), 0020 (nghề)

## Bối cảnh
- Chủ dự án muốn người chơi có **kho đồ** (2026-10-29), và về sau có kho thế lực khi mình cầm đầu.
- **Hiện trạng:** sim chưa có khái niệm "món đồ". Mọi thứ làm ra đổi ngay thành tiền hay lương:
  - săn: thịt cộng vào `grain`, da trả tiền ngay từ quỹ quận (`HUNT_HIDE` 20 văn, bẫy 10 văn, `income.ts`);
  - việc xưởng: bỏ 40 văn vật liệu, có đơn thì quỹ quận trả 180 văn, không có đơn thì mất trắng (S2);
  - hái lượm: chỉ ra lương;
  - chuyến buôn S3 chỉ chở lương (`merchant.ts`).
- Hàng ngoài lương thực đang là **kênh trừu tượng**: `MONEY_FLOW_PERMILLE` (50‰ mỗi tháng) san tiền giữa các quận kề, đứng thay cho vải, đồ thủ công, chi tiêu. Bỏ kênh này thì quận phải mua lương bị rút cạn tiền (đo v0.3).
- Ràng buộc:
  - không tạo tài nguyên từ hư không: món đồ phải có người làm ra, có người dùng hết;
  - NPC và người chơi cùng luật;
  - mỗi thứ thêm vào phải có tác động thật (GDD 3.2 A);
  - ngân sách: Node ≤ 300 µs/tick, batch ≤ 90 s (đang sát trần).
- v0.7 đã chốt **không** cho người chơi lập hay cầm đầu thế lực (`v0.7-giai-doan-a.md` mục 1).

## Phương án
| | A. Ba món hàng có chợ riêng (khuyến nghị) | B. Túi đồ tự do nhiều món | C. Chỉ đổi tên, vẫn quy ra tiền |
|---|---|---|---|
| Cách làm | Ba món gắn với nghề sẵn có (da, đồ thủ công, thảo dược); mỗi quận một kho và giá theo tồn như lương; người chơi giữ, bán khi muốn, chở đi buôn | Danh mục mở (vải, muối, nông cụ, vũ khí…), mỗi món một ô trong túi | Hiện "da thú" trong nhật ký nhưng vẫn trả tiền ngay |
| Ưu | Mỗi món có người làm ra, người dùng; tạo dòng buôn hai chiều (làng → trấn: da, thuốc; trấn → làng: đồ thủ công); giữ hàng chờ giá là một lựa chọn có giá | Giàu, quen thuộc với người chơi game | Không tốn gì |
| Nhược | Thêm một lớp chợ, lệnh mới, giao diện kho | Món không ai làm ra thì phải sinh từ hư không; mỗi món một nguồn, một cầu; phình phạm vi; vũ khí, trang bị trái GDD 4.1 | Không có kho đồ thật; không đáp ứng yêu cầu |

## Quyết định: phương án A

### Danh mục (Q13)
| Món (`GoodId`) | Ai làm ra | Ai dùng | Giá gốc (văn/phần) | Hư hao/tháng |
|---|---|---|---:|---:|
| `hide` da thú | săn, bẫy (người chơi, NPC); dân nền làng | dân nền trấn, thành nhiều, làng ít | 20 | 1% |
| `wares` đồ thủ công | việc xưởng; dân nền trấn, thành | dân nền mọi nơi (nông cụ, nồi niêu) | 60 | 0 |
| `herb` thảo dược | hái lượm (có cơ hội); dân nền làng | dân nền mọi nơi, gấp ba khi có dịch; thầy thuốc (S5) | 15 | 3% |

- Đơn vị "phần", số nguyên. Giá gốc chọn để bán ở làng gần bằng tiền trả ngay hiện nay (da 20 văn) — thu nhập thợ săn không tụt khi chưa đi bán xa.
- Không thêm vải, muối: chưa có nghề nào làm ra. Không có vũ khí, trang bị (GDD 4.1).

### Chợ hàng mỗi quận (Q14)
- `CountyEconomy.goods: { stock: number; price: number; prevPrice: number }[]`, mảng dày theo thứ tự `GOODS`.
- Mỗi tháng, cùng pha với lương (`economyMonth`):
  - dân nền làm ra và dùng hết theo số miệng ăn và loại trị sở (hằng số chốt khi đo ở S3b, mục tiêu: lúc đầu đủ 4 tháng dự trữ như lương; làng dư da, thuốc; trấn, thành dư đồ thủ công);
  - hư hao theo bảng;
  - lái buôn quận kề chở 2% kho quận rẻ sang quận đắt khi chênh giá vượt phí chở — **cùng hàm với lương**, lời ghi vào `tradeMargin` nên thương hội vẫn ăn phần trên đường nó giữ;
  - giá theo số tháng tồn, **dùng lại `PRICE_BY_STOCK`**; mua 115%, bán 85% như lương.
- **Giữ nguyên `MONEY_FLOW_PERMILLE`.** Lớp hàng mỏng đi song song; thay kênh tiền bằng hàng thật là đổi cân bằng nền tảng, không làm ở v0.7.
- Sổ cái: mua bán hàng chỉ chuyển tiền giữa túi và quỹ quận. Hàng (như lương) có nguồn và chỗ tiêu, không nằm trong sổ cái tiền.

### Ai giữ đồ (Q15)
- **Người chơi:** `HouseholdState.goods: number[]` (dày, theo `GOODS`). Gánh tối đa 100 phần tổng (Q17); đầy thì việc làm ra hàng bị khóa tạm `lock.goods_full`.
- **NPC:** cùng trường, cùng hàm chợ. Bộ não NPC bán hết ở chợ quận đang đứng cuối mỗi lượt chạy (L0 cuối tuần, L1 cuối tháng) — NPC không đầu cơ, giữ chi phí pha NPC gần như không đổi.
- **Thế lực:** không có kho đồ ở v0.7 (Q20).
- **Thừa kế:** `bequeath` chia thêm `goods` như tiền, lương (ADR 0018).

### Đổi luật việc làm (Q16)
- Săn, bẫy: da vào kho đồ thay vì trả tiền ngay (thịt vẫn vào lương).
- Việc xưởng: có đơn như S2 (quỹ quận trả công); **không có đơn thì được 1 phần đồ thủ công** thay vì mất trắng vật liệu — hàng tồn, bán được nhưng có thể lỗ.
- Hái lượm: thêm cơ hội ra thảo dược theo mùa (xuân, hạ nhiều), không giảm phần lương.
- Đây là **đổi cân bằng**: thợ săn, thợ thủ công phải được đo lại trên 3.000 đời (mục 6 v0.7).

### Lệnh và chuyến buôn (Q18)
- Lệnh mới `TRADE_GOODS { good; qty }` (mua > 0, bán < 0, ở chợ đang đứng), song song với `TRADE` (lương). Không đủ tiền, hàng, quỹ quận hay sức gánh thì từ chối cả lệnh.
- Chuyến buôn S3 chọn hàng: `PlanSlot.cargo?: 'grain' | GoodId` (mặc định lương, giữ hành vi S3). Hàng mua ở chợ quận nguồn, bán ở quận đích, cùng công thức phí chở, vốn, rủi ro.
- **Bị cướp:** mất hàng; băng bán tháo ở chợ quận sào huyệt, quỹ quận trả 50% giá vào kho băng (tiền chuyển, sổ cái giữ); quỹ không đủ thì hàng vào kho quận, băng nhận phần quỹ trả được.

### Hợp đồng (Q19)
- Bổ sung trong hợp đồng v7 (chưa phát hành, không tăng số; ghi ADR 0001):
  - `GOODS`, `GoodId`, khóa nội dung `good.<id>`;
  - `HouseholdView.goods: { id; qty }[]` (chỉ món đang có);
  - `MarketView.goods: { id; buyPrice; sellPrice; supply; trend; maxBuy; maxSell }[]`;
  - lệnh `TRADE_GOODS`; `PlanSlot.cargo`.
- Snapshot đổi dạng (hộ, chợ quận): save dev cũ hỏng như sau S1, S2. Tăng `SIM_VERSION` lúc đóng phiên bản.

### Ghi chú khi làm (S3b, 2026-10-29)
- **Đơn vị:** hàng đếm bằng **phân**, 10 phân = 1 phần (`GOOD_UNITS_PER_PART`), như thăng và đấu của lương. Giá vẫn văn/phần, sức gánh vẫn 100 phần (1.000 phân). Cần đơn vị nhỏ hơn phần vì bẫy ra nửa tấm da và bậc nghề nhân 115–130%; đếm nguyên phần thì mất phần lẻ.
- **Sản lượng:** săn 1 phần da (10 phân) nhân kỹ năng và bậc như trước; bẫy nửa phần; việc xưởng không đơn 1 phần đồ thủ công.
- **Thảo dược khi hái lượm:** lấy đúng **kỳ vọng**, không rút thêm RNG: xuân, hạ 3 phân, thu 1, đông 0, nhân kỹ năng. Nhờ vậy luồng `actions` của mọi người hái lượm (cả người theo cướp) không lệch, và phép đo so được với trước S3b.
- **Dân nền:** dùng mỗi tháng theo miệng ăn và loại trị sở; làm ra theo tỉ lệ của loại trị sở nhân hệ số theo kho. Kho đầy thì làm ít đi, kho cạn thì làm nhiều lên (`GOOD_MAKE_BY_STOCK`). Không có hệ số này thì đồ thủ công (không hư hao) ở trấn tồn mãi, giá kẹt đáy.
- **Da ở làng:** dân nền làng làm ra 90% số da mình dùng, phần thiếu do thợ săn bán vào. Bản đầu cho làng dư da (120%) thì giá bán da ở chợ làng chỉ 15,5 văn/phần, thợ săn mất gần một phần tư tiền da, NPC chết đói tăng (2,7% → 3,3% ở `world` 100 năm). Đo 4 vùng × 60 năm: 120% → 15,5 văn; 100% → 17,8; **90% → 20,8**; 80% → 30,1. Giữ giá gốc 20 văn đã duyệt; chỉ chỉnh hằng số dân nền, đúng phần mục Q14 để S3b chốt khi đo. Làng không còn "dư da" từ dân nền; dòng da làng → trấn là do thợ săn.
- **Dải cung của hàng:** suy từ giá theo cùng mốc với lương (giá đơn điệu theo số tháng tồn), nên không phải lưu thêm số dùng mỗi tháng.
- **Người không có người thừa kế:** hàng vào kho chợ quận nhà, như tiền và lương.
- **`HouseholdView.goodsCap`:** thêm ngoài mục Q19 để giao diện vẽ được sức gánh mà không phải giữ số cân bằng.
- **Người chơi máy trong batch:** bán hết hàng đầu tháng, như NPC.

## Hệ quả
- Thợ săn có lý do đi trấn bán da; thợ thủ công có lý do mang đồ về làng; thương nhân có thêm ba dòng hàng, không chỉ lương. Giữ hàng chờ giá là một ván cược (hư hao, giá rớt khi chợ đầy).
- Chi phí chạy: thêm 3 món × (quận + cạnh) mỗi tháng, NPC bán hàng cuối lượt. Đo ở S3b; vượt ngân sách thì tối ưu, không cắt luật.
- Nối về sau:
  - S5 thầy thuốc dùng thảo dược làm vật tiêu hao khi chữa bệnh;
  - v0.9 chợ tài nguyên tu luyện (GDD 3.2 L2) có thể dùng lại khung `GOODS` với chợ tách riêng;
  - kho đồ thế lực và quyền cầm đầu (Q20): xét ở phân tích sau v0.7, cần đường lên làm đầu theo cùng luật NPC và lớp lệnh quản lý kho.
- Rủi ro:
  - hàng làm người chơi giàu quá nhanh (đầu cơ): giới hạn gánh, hư hao, giá theo tồn, lái buôn san giá;
  - kinh tế lệch vì có hai kênh hàng (trừu tượng và thật): đo `pnpm sim world` 100 năm, tiêu chí kinh tế v0.6 phải giữ.

- **Giao diện (F3b, 2026-10-29):** khối "Hành trang" ở hồ sơ (món, số phần, sức gánh); khối chợ thêm giá ba món; hộp mua bán có thẻ chọn món (lệnh `TRADE_GOODS`, bước một phần, "Hết mức" lấy đúng số phân); ô "Đi buôn chuyến" mở bảng chọn quận đích và hàng chở (`STATE.hauls`, ADR 0001).
