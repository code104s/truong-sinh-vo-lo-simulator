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
  - mục tiêu trung bình 4–8 sự kiện có lựa chọn mỗi năm sau 12 tuổi.
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
