# ADR 0009 — Di chuyển và đồ thị vùng

- Trạng thái: **ĐÃ DUYỆT** (2026-10-26, chủ dự án đồng ý mọi khuyến nghị Q1–Q8 ở `docs/v0.2-giai-doan-a.md`)
- Ngày: 2026-10-26
- Liên quan: GDD 3.2 D ("đi từ A đến B mất bao lâu, nguy hiểm thế nào, ai kiểm soát"), 10.4, 10.7; ADR 0007, 0008

## Bối cảnh
### Lỗi phát hiện khi phân tích: vùng chơi không liên thông
Đo 30 seed (`tsvl-001..030`) bằng đồ thị kề quận hiện có (`RegionLogic.adjacency`):
- **20/30 seed** có quận không đi tới được từ kinh đô; 1–3 quận lẻ mỗi seed (diện tích 30–120 ô).
- Ở cả 20 seed, **ít nhất một làng nơi sinh nằm trong phần bị cô lập**.

Nguyên nhân (`packages/worldgen/src/region/buildRegion.ts`):
1. Vùng = các quận cùng nước có **trị sở** trong bán kính 150 km, không yêu cầu liền nhau → lấy cả quận bị ngăn bởi quận nước khác, hồ hoặc vịnh.
2. Kề nhau chỉ xét 4 hướng trên lưới ô → hai quận chạm góc bị coi là không kề.

v0.1 không cần di chuyển nên không lộ ra. v0.2 thì có: sinh ở làng cô lập là không đi đâu được.

### Số đo khoảng cách (5 seed)
- Trị sở hai quận kề nhau cách **54–117 km** (trung vị ~70 km).
- Kinh đô tới quận xa nhất 150–213 km; đường kính vùng 243–334 km.
- Đường bộ lớn (`map.roads`) chỉ 2–11 tuyến cắt qua vùng — quá thưa để làm mạng đường.

## Phương án
**Sửa liên thông:**
1. **Chỉ giữ thành phần liên thông chứa kinh đô** (kề 8 hướng) khi chọn quận. Đơn giản; vùng nhỏ đi chút ở seed bị ảnh hưởng.
2. Giữ quận lẻ, thêm cạnh "đò/thuyền" qua nước. Phải biết nước nào nối được — cần thêm dữ liệu thủy văn.
3. Thêm quận nước khác nằm giữa để nối. Phá ý "vùng = một nước".

**Thời gian đi:**
- a. Một ô cho mọi bước sang quận kề.
- b. **Tính theo ngày rồi làm tròn lên ô**: `ngày = ceil(km / tốc độ)`, tốc độ 30 km/ngày đường bằng, nhân hệ số địa hình (đồi núi, qua sông lớn) lấy từ ô dọc đường thẳng giữa hai trị sở; `ô = ceil(tổng ngày / 10)`.

## Quyết định (đề xuất)
- **Liên thông: phương án 1**, kề **8 hướng**; nếu sau khi lọc còn dưới 5 làng thì cơ chế "làng phụ" sẵn có bù vào. Test: 100 seed, đồ thị liên thông, mọi nơi sinh tới được kinh đô.
  - **Hệ quả:** cùng seed sẽ ra vùng khác v0.1 ở ~2/3 seed (digest vùng pin đổi, digest đời mẫu đổi). Save v0.1 vẫn chứa bản đồ cũ nhưng bị từ chối vì đổi version (ADR 0004).
- **Thời gian đi: phương án b**, đi theo đường ngắn nhất trên đồ thị quận (Dijkstra, số nguyên km). Với số đo trên: sang quận kề 2–4 ngày → **1 ô**; xuyên vùng 8–11 ngày → **1–2 ô**. Đi xong ô đó mới tới nơi; ô kế tiếp mới làm việc ở chỗ mới.
- **Nơi ở:** nhân vật có `location` (chỉ số quận) và `home` (quận sinh). Mỗi quận có một khu dân cư loại làng/trấn/thành (trị sở; quận không phải nơi sinh coi là làng) — **mở rộng `RegionLogic`** thêm `settlementKind` theo quận.
- **Nguy hiểm đường (v0.2 tối thiểu):** mỗi ô di chuyển có xác suất tai nạn = tai nạn tuần (ADR 0005) × hệ số địa hình (núi ×2, qua sông lớn ×1,5) × hệ số thể lực thấp. Dùng luồng RNG `travel` riêng.
- **"Ai kiểm soát":** hoãn tới v0.6 (thế lực). Ghi trong ADR, không giả lập.
- **Bản đồ (FE):** màn đời người có nút mở bản đồ vùng (dùng lại `MapView`), hiện nơi đang ở, bấm chọn đích → sim trả thời gian và rủi ro dự kiến (FE không tính).

## Hệ quả
- Sửa `worldgen/region` (code dự án, không đụng bản chụp upstream). Digest vùng pin cập nhật có ghi chú.
- Đường thẳng giữa trị sở chỉ là xấp xỉ; mạng đường thật để v0.6 (thế lực kiểm soát đường) hoặc khi cần.
- Đi lại trong cùng một quận (làng ↔ ruộng) không tốn ô riêng: đã nằm trong hành động.
