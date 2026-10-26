# ADR 0003 — RNG và tất định

- Trạng thái: **ĐÃ DUYỆT** (2026-10-25, chủ dự án đồng ý mọi khuyến nghị Q1–Q13 ở `docs/v0.1-giai-doan-a.md`)
- Ngày: 2026-10-25
- Liên quan: CLAUDE.md (Tất định), GDD 3.2 B, 10.1, 10.2

## Bối cảnh
CLAUDE.md bắt buộc: không `Math.random`/`Date.now`/`new Date()`/`performance.now`, không số thực làm nguồn kết quả, trạng thái RNG lưu được, cùng seed + cùng lệnh ⇒ cùng digest.

Đề bài yêu cầu đánh giá dùng lại `packages/worldgen/src/core/rng.ts`. **File này không tồn tại.** RNG hiện có là `packages/worldgen/src/cartographer/gen/rng.ts` (bản chụp upstream).

### Đánh giá `cartographer/gen/rng.ts`
| | Đánh giá |
|---|---|
| Thuật toán | sfc32, khởi tạo bằng splitmix32 từ seed 32 bit; `hashString` là FNV-1a + trộn kiểu murmur. Chất lượng tốt, nhanh, chỉ dùng phép 32 bit. |
| Đầu ra | `next()` trả **số thực** `[0,1)`; `int()` = `floor(lo + (hi-lo+1)*next())` → số thực làm trung gian. `normal()` dùng `log`, `cos` (qua `dmath`). Vi phạm quy tắc "không số thực làm nguồn kết quả" của sim. |
| Lưu trạng thái | Bốn trường `a,b,c,d` là `private`, không có hàm xuất/nhập. Không lưu vào save được. |
| Tách luồng | `fork()` lấy seed con từ `next()` (số thực × 2³²), thứ tự fork phụ thuộc thứ tự gọi → thêm một lần gọi ở đâu đó làm lệch mọi luồng sau. |
| Vị trí | Bản chụp upstream; CLAUDE.md: chỉ sửa khi cần và ghi `UPSTREAM.md`. |

**Kết luận:** giữ nguyên cho `worldgen` (bản đồ được lưu vào save nên không cần tái lập ở sim). **Không dùng cho sim.**

## Phương án
1. Sửa RNG upstream thêm API số nguyên và xuất trạng thái. Đụng bản chụp, khó cập nhật upstream.
2. **RNG mới trong `packages/sim/src/core/rng.ts`**, cùng họ thuật toán sfc32 (viết lại, không copy), API thuần số nguyên.
3. PCG32 hoặc xoshiro128\*\*. Tương đương; sfc32 đã được dùng trong dự án nên chọn để dễ đối chiếu.

## Quyết định (đề xuất)
**Phương án 2.**

### RNG
```ts
// packages/sim/src/core/rng.ts
export type RngState = readonly [number, number, number, number]; // 4 × u32
export class Rng {
  static fromSeed(seed: number): Rng;      // splitmix32 → 4 từ, bỏ 12 đầu ra đầu
  static fromState(s: RngState): Rng;
  state(): RngState;
  u32(): number;                           // [0, 2^32)
  int(lo: number, hi: number): number;     // đều, không lệch (loại bỏ theo ngưỡng), lo..hi gồm cả hai đầu
  chance(ppm: number): boolean;            // xác suất tính bằng phần triệu, số nguyên
  weighted(weights: readonly number[]): number; // trọng số nguyên ≥ 0
  pick<T>(arr: readonly T[]): T;
}
```

### Luồng có tên
- Gốc: `root = hash32(worldSeed) ⊕ hash32("life|" + birthplaceId) ⊕ lifeSeed` (cách ghép chốt khi duyệt Q5).
- Mỗi hệ thống một luồng: `stream(name) = Rng.fromSeed(hash32(root, name))`. Danh sách v0.1: `character`, `names`, `health`, `illness`, `accident`.
- Luồng tạo một lần khi bắt đầu đời, lưu trong snapshot dạng bản ghi **đã sắp xếp theo tên**. Thêm luồng mới không làm lệch luồng cũ.
- Mỗi luồng chỉ do một hệ thống dùng. Thêm một lần rút ngẫu nhiên ở hệ thống bệnh không đổi kết quả tai nạn.

### Toán số nguyên
- Sức khỏe, thọ nguyên, xác suất: số nguyên. Xác suất theo **ppm** (phần triệu). Tỉ lệ dạng permille (‰) khi cần.
- Chia: helper `idiv(a, b)` (chia lấy phần nguyên, kiểm tra `b ≠ 0`, kết quả an toàn trong `±2^53`).
- Phân phối "chuông" (thọ nguyên): tổng của k số nguyên đều (Irwin–Hall), không dùng Box–Muller.

### Digest
- Hàm băm thuần TS trong sim (không dùng `node:crypto`, vì phải chạy giống hệt trong worker trình duyệt): hai luồng 32 bit kiểu murmur3 trên chuỗi chuẩn hóa → 16 ký tự hex.
- Chuỗi chuẩn hóa: JSON của snapshot sim với **khóa sắp xếp**, chỉ số nguyên và chuỗi. Gặp số không nguyên → ném lỗi (bắt lỗi rò số thực).
- Digest **không** gồm `RegionMapData` (số thực). Digest vùng riêng theo ADR 0007.

### Chặn API cấm
Repo chưa có ESLint. Đề xuất **không thêm package**: một test Vitest trong `packages/sim` đọc mọi file `src/**/*.ts` và trượt nếu gặp:
- `Math.random`, `Date.now`, `new Date(`, `performance.now`, `crypto.`
- `Math.` ngoài danh sách cho phép: `imul`, `clz32`, `min`, `max`, `abs`, `trunc`, `floor`, `sign`
- `import` từ `react`, `preact`, DOM, `node:`.
Lặp `Map`/`Set`/`Object.keys` có ảnh hưởng thứ tự: dùng helper `sortedEntries`; kiểm tra bằng review vì regex không bắt chắc được.

Nếu chủ dự án muốn ESLint thật (như demo Thiên Mệnh): thêm `eslint` + `typescript-eslint` + luật `no-restricted-properties`. Cần duyệt package (Q8).

### Test tất định (nghiệm thu)
- 10 seed × 2 lần chạy → cùng digest.
- Chạy tới giữa đời → lưu → tải → chạy tiếp → digest bằng lần chạy liền mạch.
- Digest pin cho 3 seed (bắt trôi do sửa code vô tình; khi cố ý đổi luật thì cập nhật pin kèm ghi chú).

## Hệ quả
- Sim không phụ thuộc RNG của worldgen; worldgen giữ nguyên bản chụp.
- Hai RNG cùng thuật toán nhưng khác mã; chấp nhận vì mục đích khác nhau.
- Kiểm tra API cấm bằng test là "lint nghèo", có thể lọt các trường hợp gián tiếp (vd. `const M = Math; M.random()`); review bù.
