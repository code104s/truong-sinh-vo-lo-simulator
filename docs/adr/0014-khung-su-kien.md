# ADR 0014 — Khung sự kiện có lựa chọn

- Trạng thái: **ĐÃ DUYỆT** (2026-10-27, chủ dự án đồng ý mọi khuyến nghị Q1–Q11 ở `docs/v0.3-giai-doan-a.md`; liên quan Q4, Q5, Q7)
- Ngày: 2026-10-27
- Liên quan: GDD 1.1, 2 (sự kiện quan trọng ngắt tua), 3.2 J, 3.2 N, 4.2 (mod/công cụ sự kiện hoãn); ADR 0003, 0005, 0008, 0011

## Bối cảnh
- **Hiện có:** pha "Sự kiện" (pha 4 trong tick) chỉ chạy bệnh và tai nạn. Đây là hệ quả hệ thống, không có lựa chọn.
- **GDD 3.2 J:**
  - Sự kiện sinh ra từ trạng thái thế giới + nhân vật, không phải danh sách ngẫu nhiên thuần.
  - Cấu trúc: điều kiện → mô tả → lựa chọn có giá → hậu quả.
  - Không ép tuyến cố định.
- **v0.3:** cần khoảng 30 sự kiện chạy được. v1.0 cần 120–200, nên khung phải chịu được quy mô đó.
- **Tính cách** (12 loại) chưa có tác động nào; v0.2 Q7 đã hoãn sang v0.3.
- **Hai ràng buộc từ các ADR trước:**
  - Batch không có người bấm (ADR 0011): cần cách chọn tự động.
  - Phát lại theo nhật ký lệnh phải cho cùng digest.

## Phương án
| | A. Định nghĩa bằng TypeScript, có kiểu (khuyến nghị) | B. Dữ liệu JSON + DSL điều kiện |
|---|---|---|
| Cách làm | `EventDef` là object TS trong `sim`. Điều kiện và hậu quả là hàm thuần dùng helper có kiểu. Văn bản ở `content`. | Định nghĩa JSON, điều kiện dạng biểu thức, có trình thông dịch |
| Ưu | Typecheck bắt lỗi. Không phải viết parser. Test dễ. | Gần "mod" (GDD 4.2) |
| Nhược | Người viết nội dung phải sửa TS | Thêm parser và validator. Lỗi muộn. Mod đã hoãn sau v1.0. |

## Quyết định (phương án A)

### Định nghĩa
```ts
interface EventDef {
  id: string;                         // "event.harvest_bad"
  category: 'daily' | 'economy' | 'disaster' | 'health' | 'opportunity';
  scope: 'player' | 'county';         // county: tác động cả quận (thiên tai), người chơi chỉ là người chứng kiến/chịu
  when: (ctx: EventContext) => number; // trọng số ppm theo trạng thái; 0 = không xảy ra
  cooldownTicks: number;              // tối thiểu giữa hai lần
  oncePerLife?: boolean;
  variant?: (ctx) => string;          // biến thể theo ngữ cảnh (mùa, xuất thân, nơi ở) → chọn khóa văn bản
  choices?: ChoiceDef[];              // không có = sự kiện tường thuật, áp hậu quả ngay
  apply?: (ctx, rng) => Outcome;      // cho sự kiện không lựa chọn
}
interface ChoiceDef {
  id: string;
  costs: CostTag[];                   // 'money' | 'grain' | 'health' | 'stamina' | 'time' | 'risk' | 'opportunity' — bắt buộc ≥ 1
  available?: (ctx) => string | null; // null = được chọn; chuỗi = khóa lý do (thiếu tiền, tính cách không cho...)
  apply: (ctx, rng) => Outcome;       // đổi trạng thái + trả khóa nhật ký kết quả
}
```
- **`EventContext`** chỉ đọc. Gồm:
  - nhân vật, hộ (ADR 0013), chợ quận đang đứng và quận nhà (ADR 0012);
  - lịch, kế hoạch đang chạy, cờ sự kiện đã xảy ra.
- **`Outcome`** chỉ được đổi trạng thái qua các hàm có sổ cái (`pay`, `receive`, `takeGrain`, `damage`, `occupySlots`…). Nhờ đó luật bảo toàn tiền của ADR 0012 vẫn đúng.
- **Lựa chọn tốn thời gian** (đi phu 2 tuần, ở lại chăm người bệnh) chiếm ô kế hoạch, dùng cùng cơ chế `active` của ADR 0008.

### Kích hoạt
- Chạy ở pha 4, sau bệnh và tai nạn. Thứ tự duyệt: sắp theo `id`, để phép tính tất định.
- Mỗi tuần, với mỗi định nghĩa hết cooldown, tính trọng số `when(ctx)`. Sau đó rút **tối đa một** sự kiện người chơi trên luồng RNG mới `events`.
- **Sự kiện quận** (thiên tai) rút riêng ở pha Thế giới, theo tháng.
- **Giới hạn nhịp:**
  - tối đa 1 sự kiện có lựa chọn mỗi tháng;
  - mục tiêu trung bình 2–4 sự kiện có lựa chọn mỗi năm sau 12 tuổi (v0.3; ban đầu 4–8, hạ sau S6 — xem ghi chú S6). Nâng lại khi tuyển tập có thêm sự kiện.
- Cờ đã xảy ra, cooldown và bộ đếm instance nằm trong snapshot, nên save và digest có đủ.

### Chờ lựa chọn
- **Khi rút trúng sự kiện có lựa chọn:**
  - sim đặt `pendingEvent`;
  - `advance` dừng với trạng thái mới `{ status: 'event', pending }`.
- **Khi đang có `pendingEvent`:**
  - `ADVANCE` bị từ chối với lỗi `event.pending`;
  - thời gian không trôi.
- **Lệnh mới `CHOOSE { commandId, instance, choice }`:**
  - kiểm `instance` khớp và lựa chọn đang được phép;
  - áp hậu quả, ghi nhật ký `major`;
  - ghi vào nhật ký lệnh (ADR 0011), nên phát lại cho cùng digest.
- **Luôn có lối ra:**
  - Mỗi sự kiện có ít nhất một lựa chọn không bao giờ bị khóa (cam chịu hoặc từ chối). Lựa chọn này vẫn có giá.
  - Test kiểm điều này.
- **Batch:** `Policy` thêm `choose(view, pending) → choiceId`.
  - Mặc định chọn lựa chọn đầu tiên được phép.
  - Mỗi chiến lược có thể có thiên hướng riêng: "lười" luôn từ chối, "học giả" ưu tiên lựa chọn học.

### Tính cách, ngộ tính, phúc duyên
- **Tính cách** tác động theo hai cách:
  - Mở hoặc khóa lựa chọn. Ví dụ: `greedy` mới có lựa chọn ăn chặn; `timid` không có lựa chọn liều; `righteous` không thể làm ngơ khi thấy cướp.
  - Đổi trọng số một số sự kiện. Ví dụ: `hot_tempered` dễ dính ẩu đả ở chợ.
- **Ngộ tính và phúc duyên** đổi xác suất thành công trong hậu quả có rủi ro.
- Mọi tác động đều nằm trong định nghĩa sự kiện, có test.

### Văn bản và nhân vật vô danh
- **Khóa văn bản:**
  - `event.<id>.title`, `event.<id>.body[.<variant>]`;
  - `event.<id>.choice.<cid>`, `event.<id>.result.<rid>`;
  - tham số được nội suy.
- **Test phủ:** mọi khóa mà định nghĩa có thể sinh ra đều có trong `vi.ts`.
- **Người xuất hiện trong sự kiện v0.3** là **người vô danh** ("một thương lái", "quan sai"). Không phải NPC lâu dài; v0.4 mới có NPC thật.
- **Chân dung trên thẻ sự kiện:**
  - Giao diện chọn từ kho `portraits-npc` theo vai (giới, tuổi, tầng lớp), lấy instance làm seed.
  - Chỉ là trình bày, không đi vào sim.

### Tuyển tập v0.3 (~30)
Danh mục dự kiến, chi tiết điều kiện và lựa chọn viết ở S6.

| Nhóm | Sự kiện |
|---|---|
| Kinh tế (8) | được mùa · mất mùa · giá gạo vọt · thương lái ép giá lúc bán · quan sai đòi thuế (khi thiếu tiền) · vay nặng lãi · mất trộm kho · chủ đất tăng tô (tá điền) |
| Tai họa — quận (6) | lũ lụt · hạn hán · châu chấu · dịch trong vùng · cháy nhà · rét đậm thiếu củi |
| Đường xá, rừng (3) | cướp đường khi di chuyển · thú dữ khi săn · lạc đường trong núi |
| Đời thường (7) | lập thân 16 tuổi · hội làng (góp tiền) · người ăn xin xin ăn · hàng xóm nhờ gặt · ẩu đả ở chợ · đám tang trong làng · thầy đồ khen/chê (khi học) |
| Sức khỏe (3) | lang băm bán thuốc · ăn phải đồ hỏng khi đói · thầy thuốc giỏi qua quận |
| Cơ duyên phàm nhân (3) | nhặt được dược thảo quý · sách cũ ở chợ · ông lão kể chuyện tiên nhân (chỉ là tin đồn; không mở cửa tu tiên) |

## Hệ quả
- **Mã mới:**
  - `sim/src/events/`: kiểu, máy kích hoạt, hàm hậu quả có sổ cái, tuyển tập;
  - luồng RNG `events`;
  - protocol thêm `CHOOSE` và `STATE.pending`;
  - `AdvanceResult` thêm `event`.
- **Test bắt buộc:**
  - mỗi lựa chọn có ≥ 1 giá, và áp lên trạng thái mẫu thì thật sự làm giảm ít nhất một tài nguyên hoặc tiêu một lần rút rủi ro;
  - mỗi sự kiện có lối ra không khóa;
  - mỗi sự kiện xảy ra ít nhất một lần trong batch 1.000 đời (trừ sự kiện hiếm có ghi chú);
  - phát lại có `CHOOSE` cho cùng digest;
  - lưu khi đang có sự kiện chờ, tải lại vẫn thấy sự kiện đó.
- **Sự kiện quan hệ và tu tiên:** GDD 3.2 J có hai nhóm này, nhưng v0.3 chưa có. Quan hệ cần NPC (v0.4–v0.5); tu tiên mở ở v0.8.
- **Công cụ soạn sự kiện / mod:** hoãn (GDD 4.2).

## Ghi chú triển khai S5 (2026-10-27)
- **Mã:** `packages/sim/src/events/` gồm `engine.ts` (kích hoạt, chờ, chọn), `effects.ts` (hậu quả có sổ cái), `catalog.ts` (tuyển tập).
- **Định nghĩa:** `EventDef` đúng như bản nháp, với hai chỗ chốt thêm:
  - **2–4 lựa chọn** (chủ dự án duyệt 2026-10-27). Một lựa chọn thì viết thành sự kiện không lựa chọn (chưa cần ở S5).
  - **Lựa chọn cuối là lối ra**, không có điều kiện khóa. `checkCatalog` kiểm khi chạy test.
- **Kích hoạt:**
  - Tuyển tập sắp theo id.
  - Chỉ rút RNG khi có ứng viên, để tuần yên ổn không làm đổi luồng.
  - Tổng trọng số vượt 1 triệu ppm thì co lại, mỗi tuần tối đa một sự kiện.
  - Mỗi tháng tối đa một sự kiện có lựa chọn.
  - Có thời gian chờ theo từng sự kiện và cờ chỉ-một-lần.
- **Khóa văn bản** dùng thẳng id sự kiện: `event.beggar.title`, `event.beggar.choice.give`, `event.beggar.result.give`. Bản đầu ghép nhầm thành `event.event.…`; đã có test phủ khóa duyệt mọi lựa chọn và mọi nhánh kết quả.
- **Chờ và chọn:**
  - `Life.advance` trả `{ status: 'event', pending }`.
  - Host gửi tin `EVENT`, kèm `STATE.pending`.
  - `ADVANCE` khi đang chờ trả lỗi `EVENT_PENDING` và không vào nhật ký lệnh.
  - `CHOOSE` vào nhật ký lệnh và bộ đệm chống trùng; phát lại cho cùng digest, kể cả save lưu khi đang chờ.
- **Thời gian chiếm bởi lựa chọn** (đi phu) dùng hành động ẩn `action.corvee` (2 ô) qua cơ chế hành động dài của ADR 0008. Hành động ẩn không có trong bảng chọn và không xếp vào kế hoạch được.
- **Ba sự kiện mẫu:**

  | Sự kiện | Xảy ra khi | Lựa chọn |
  |---|---|---|
  | Người xin ăn | túi có lương thực | cho một đấu / nấu cơm giữ qua đêm (chỉ người hiền hậu, chính trực) / đóng cửa (rủi ro bị trộm) |
  | Thầy thuốc qua làng | đang bệnh, ở làng | trả 150 văn dứt bệnh / tự hái lá thuốc (hên xui) |
  | Quan sai đòi thuế | đã ra riêng, còn nợ thuế đinh | nộp đủ / đi phu hai tuần / trốn (phúc duyên cao thì ít bị bắt) |

- **Đo tần suất** (tsvl-01, 60 đời, làm ruộng + hái lượm, 2.892 năm sau 12 tuổi): 0,29 sự kiện/năm. Còn xa mục tiêu 4–8 vì mới có ba sự kiện; S6 viết đủ khoảng 30.
- **Người chơi máy:** mặc định chọn lựa chọn đầu tiên đang mở; "lười" luôn chọn lối ra. `Life.runToDeath` và `pnpm sim life` cũng tự chọn như mặc định.
- **Giao diện (F3):**
  - Thẻ sự kiện có chân dung người vô danh lấy từ kho `portraits-npc` theo giới, lứa tuổi, tầng lớp (thiếu thì nới dần), cùng số thứ tự sự kiện thì cùng gương mặt.
  - Lựa chọn có chip giá; lựa chọn bị khóa vẫn hiện kèm lý do; phím 1–4 để chọn nhanh.
  - Thẻ không có nút đóng.
  - Dải "Có biến" vẫn dùng cho tin lớn không cần chọn.

## Ghi chú triển khai S6 (2026-10-27)

- **Giọng văn E** (`docs/van-phong.md`, đã duyệt): ngôi ba ngầm, không "bạn/hắn/nàng"; Hán-Việt chỉ cho thiết chế; lựa chọn ≤ 10 chữ, mở bằng động từ; kết quả 1–2 câu. Các câu nhật ký cũ đã sửa theo mục 5. Test văn phong chặn từ cấm và lựa chọn quá dài.
- **Văn bản** nằm riêng ở `packages/content/src/strings/events.vi.ts`, gộp vào `VI`.
- **Tuyển tập 29 sự kiện**, mỗi nhóm một tệp trong `packages/sim/src/events/defs/`:

  | Nhóm | Sự kiện |
  |---|---|
  | Thường ngày | lập thân, người xin ăn, hội làng, gặt giúp hàng xóm, ẩu đả ở chợ, đám ma trong làng, lời thầy đồ |
  | Kinh tế | được mùa, lái lúa, gạo lên giá, quan sai đòi thuế, chủ nợ, trộm kho thóc, địa chủ tăng tô |
  | Tai họa | hạn, lũ, châu chấu, dịch, cháy nhà, rét đậm |
  | Đường sá (nhóm mới `road`) | cướp đường, thú dữ, lạc trong núi |
  | Sức khỏe | thầy thuốc qua làng, lang băm, đồ ăn ôi |
  | Cơ duyên | chuyện người tiên (một lần trong đời), cây thuốc quý, sách cũ |

- **G2 — lập thân:** viết đủ ba lựa chọn (ở lại / lên trấn / ra riêng) nhưng `COMING_OF_AGE_LIVE = false` nên chưa xảy ra trong đời thật tới S7 (S7 đã bật, xem ghi chú S7 ở ADR 0013; người chơi máy chọn theo giá ở `policyChoose`). "Ở lại" giữ người ở nhà tới hai mươi tuổi: mỗi đầu năm nộp nửa túi về quận nhà, rồi ra riêng với phần chia lớn hơn (`STAY_SHARE_PCT = 150`).
- **G3 — tai họa theo quận:**
  - Đầu năm, sau khi gieo thời tiết, `labelDisasters` gọi tên năm xấu (thời tiết ≤ 85%): hạn, lũ hoặc châu chấu, kèm tháng phát đúng mùa. Hàm này không đổi thời tiết, nên kinh tế quận giữ nguyên.
  - Dịch gieo riêng theo quận, kéo dài 9 tuần, làm dễ mắc bệnh gấp ba.
  - Ai ở quận cũng nhận tin trong nhật ký. Người chơi chỉ được hỏi chọn khi có ruộng mùa này ở quận đó (dịch thì hỏi khi đang ở quận và chưa phòng).
- **Hiệu ứng mới:**
  - Cứu phần thiệt mùa: `reliefPct`, ví dụ gánh nước, đắp bờ.
  - Tô tăng: `rentHikePct`. Cả hai hết sau mùa gặt.
  - Nợ vay: `loan` / `loanDue`. Tới hạn thì trả tiền trước, rồi lấy thóc theo giá mua; còn thiếu thì khất năm sau, lãi 36%. Tiền vay lấy từ quỹ quận, nên sổ cái không thủng.
  - `shieldUntil`: đã phòng dịch.
  - Hành động ẩn `action.toil` (lao lực một hoặc hai ô) và `action.shelter` (đóng cửa tránh dịch).
- **Giá thật:** test toàn tuyển tập kiểm mỗi lựa chọn hoặc đổi trạng thái, hoặc rút RNG, hoặc khai giá `opportunity` (bỏ lỡ cơ hội).
- **Đo tần suất** (tsvl-01, 90 đời, làng làm ruộng + hái lượm/săn, trấn làm thuê + học, 4.437 năm sau 12 tuổi): **2,48 sự kiện/năm**, trong mục tiêu mới 2–4.
  - Nhiều nhất: lái lúa 0,37 · người xin ăn 0,31 · đám ma 0,21 · rét đậm 0,20 · thú dữ 0,19.
  - Sự kiện có điều kiện (tai họa, dịch, chuyện người tiên) chỉ khoảng 0,01–0,04 mỗi năm.
  - Giới hạn chính là thời gian chờ: 29 sự kiện mà muốn 4–8 lần một năm thì mỗi sự kiện phải lặp lại sau khoảng 4–7 năm, người chơi thấy lặp nhiều.
  - **Quyết định (chủ dự án duyệt 2026-10-27):** giữ khoảng 2,5 sự kiện/năm; mục tiêu v0.3 hạ từ 4–8 xuống 2–4 mỗi năm. Nâng lại khi có thêm sự kiện (v0.4 trở đi), để mỗi sự kiện vẫn ít lặp.
- **Cân bằng sau S6:**
  - Batch 1000 đời × 5 chính sách đều PASS: 84–91% chết trong khoảng 40–80 tuổi.
  - Economy 10 seed PASS: đói kém 1 lần mỗi 11,9 năm mỗi quận; quỹ cạn 1,0%.
  - Digest pin đổi vì đời mẫu nay gặp sự kiện.

