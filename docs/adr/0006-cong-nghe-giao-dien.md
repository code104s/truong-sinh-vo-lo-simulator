# ADR 0006 — Công nghệ giao diện

- Trạng thái: **ĐÃ DUYỆT** (2026-10-25, chủ dự án đồng ý mọi khuyến nghị Q1–Q13 ở `docs/v0.1-giai-doan-a.md`)
- Ngày: 2026-10-25
- Liên quan: GDD 8.2, 8.3, 10.5, 10.6 (mục 3 "việc còn lại"); ADR 0001

## Bối cảnh
- `apps/game` hiện chỉ có Vite + TypeScript thuần: `main.ts` sinh thế giới 256×192 trong worker, vẽ bằng `renderAtlas` ra **một canvas bitmap**, kéo/phóng bằng CSS transform. Phóng to bị vỡ nét (GDD 10.6).
- Đã có sẵn trong bản chụp renderer: `buildAtlasVector(world, …) → DisplayList` và `AtlasViewer` (ô vector, nét ở mọi mức phóng, đã xử lý thu phóng nhãn). Chưa được dùng.
- v0.1 có 4 màn (chính, chọn nơi sinh, đời người, tổng kết). Từ v0.3 sẽ có thẻ sự kiện, nhiều bảng, danh sách NPC → giao diện nặng về văn bản và trạng thái.
- GDD 10.5 ghi "Vite + PixiJS cho bản đồ" — đã lỗi thời từ khi chuyển sang Cartographer (renderer Canvas 2D). PixiJS không cần.

## Phương án

### A. Khung giao diện
| | Ưu | Nhược |
|---|---|---|
| DOM thuần | 0 package, đủ cho 4 màn | Từ v0.3 tự viết lại cơ chế cập nhật trạng thái; dễ rối |
| **Preact** (~4 KB) | API giống React, JSX chạy bằng Vite không cần plugin (`jsxImportSource`), nhẹ | Thêm 1 package |
| React | Hệ sinh thái lớn, demo Thiên Mệnh dùng | ~45 KB, nặng hơn mức cần |
| Solid / Svelte | Hiệu năng tốt | Thêm trình biên dịch/plugin, khác mô hình quen thuộc |

### B. Bản đồ chọn nơi sinh
| | Ưu | Nhược |
|---|---|---|
| Giữ canvas bitmap | Đã chạy | Vỡ nét khi phóng to; vùng cắt nhỏ (~60–90 ô) nên phải vẽ hệ số lớn |
| **`AtlasViewer` vector** | Nét mọi mức, có sẵn trong bản chụp, đúng hướng GDD 10.6 | Chưa ai nối; phải dựng `World` giả từ `RegionMapData` |

## Quyết định (đề xuất)
- **A: Preact** (thêm package `preact`, Q7). Không router: một máy trạng thái màn (`main` → `birthplace` → `life` → `summary`).
- **B: `AtlasViewer`**, giới hạn thời gian 1 ngày. Không xong thì quay về canvas bitmap vẽ vùng cắt ở hệ số cao (vùng nhỏ nên ảnh ~1.500 px là đủ cho v0.1), ghi rủi ro và làm lại ở v0.2.
- Đánh dấu nơi sinh, hover, chọn: **lớp SVG riêng** chồng lên bản đồ, toạ độ lấy từ `Birthplace.cell` và biến đổi khung nhìn của viewer. Không vẽ điểm nơi sinh vào renderer (tách lớp vẽ khỏi lớp tương tác).
- Toàn bộ chuỗi trên màn hình lấy từ `packages/content` (khóa–giá trị), kể cả tên tháng, mùa, nguyên nhân chết, câu nhật ký.
- Font: dùng font hệ thống có dấu tiếng Việt cho v0.1; chọn web font phong cách Hán-Việt ở v0.2+.
- Kích thước: bố cục lưới co giãn, kiểm tra ở 1280 px và 1920 px (nghiệm thu).

### Worker trong `apps/game`
- `src/worker/fake.worker.ts` (nhánh FE): trả dữ liệu đúng hợp đồng. Để có bản đồ thật, dùng `generateWorld` 256×192 + cắt hộp cố định quanh kinh đô đầu tiên + 6–8 nơi sinh tại trị sở quận. Đời người giả: tuổi tăng theo tick, chết ngẫu nhiên-tất định ở 60 tuổi. Bị xóa ở mốc ghép.
- `src/worker/sim.worker.ts` (mốc ghép): chỉ là dây nối `self.onmessage` → `parseCommand` → `SimHost` (trong `packages/sim`) → `postMessage`. Không có luật game.
- UI chọn worker qua `?worker=fake` trong giai đoạn song song.

### Kiểm thử FE
- Logic không phụ thuộc DOM (máy trạng thái màn, định dạng lịch/tuổi, ánh xạ khóa nội dung): Vitest trong `apps/game`.
- Màn hình: chụp ảnh bằng trình duyệt ở 1280 và 1920 px. Chưa thêm Playwright/happy-dom (Q7).

## Hệ quả
- Thêm `preact` (và `vitest` cho `apps/game` — đã có ở gốc).
- GDD 10.5 cần sửa dòng "PixiJS".
- Phần renderer bản chụp có thể cần sửa nhỏ để nhận `World` dựng từ vùng cắt; mọi chỉnh sửa ghi vào `UPSTREAM.md` (phần renderer nằm ở `apps/game/src/cartographer/`).

## Ghi chú triển khai (2026-10-25)
- **Không làm worker giả.** Nhánh Sim tới mốc ghép (S1–S8) trước khi FE bắt đầu, nên FE nối thẳng `SimHost` qua `apps/game/src/worker/sim.worker.ts`; viết worker giả rồi bỏ ngay là việc thừa.
- `AtlasViewer` dùng được trong giới hạn 1 ngày, không cần quay về canvas bitmap. Bản đồ vẽ ở `S = 8` điểm ảnh/ô, theme `ink`, `furniture: false`, `riverWidth: 0.4`. Lưu lượng sông nhân `(W/1024)²` để ngưỡng sông của renderer khớp thế giới gốc. Chỉnh renderer ghi ở `UPSTREAM.md`.
- Lớp SVG chồng lên: mặt nạ làm mờ ngoài vùng, viền vùng, ranh quận, điểm nơi sinh (thành vuông đỏ, trấn tròn vàng, làng tròn trắng), chú thích khi rê chuột.
- Kho IndexedDB `tsvl`: ô `slots/current` (đời đang sống) và `lives` (tóm tắt đời đã khép). Thao tác kho xếp hàng tuần tự để lần lưu dở không ghi đè sau khi đã xóa ô vì chết.

## Phong cách thủy mặc (2026-10-26)
Thử bộ pixel "UI assets pack 2" rồi **bỏ** theo yêu cầu chủ dự án: không hợp không khí tu tiên. Thay bằng phong cách thủy mặc tham khảo cảm giác giao diện Quỷ Cốc Bát Hoang (Tale of Immortal): **chỉ học phong cách, không dùng tài sản của game đó**; mọi thứ vẽ bằng CSS/SVG trong `apps/game/src/ui/ink.tsx` và `apps/game/src/styles.css`.
- Nền: núi thủy mặc nhiều lớp, nhạt dần về chân như sương (đường cong Catmull-Rom, dáng cố định).
- Cuộn giấy: trục gỗ hai bên, giấy xuyến chỉ (nhiễu SVG), viền trong mảnh. Hộp thoại nhỏ (thiết lập, chờ) và cuộn rộng (chọn nơi sinh, đời người, tổng kết) có nút đóng tròn viền vàng.
- Nhãn và nút: dải nét cọ mực (mặt nạ SVG mép xơ); nút chính màu chu sa.
- Ấn triện chữ Hán: nơi sinh (城 鎮 村), nhật ký (生 病 傷 癒 壽 危 終), biển báo có biến (變). Vòng cọ (ensō) có chữ mùa (春 夏 秋 冬).
- Khung chân dung viền vàng; chưa có tranh nhân vật nên vẽ dáng người bằng mực.
- Màn chính: chữ Hán dọc 長生無路, tên tiếng Việt kèm ấn 命, menu chữ nổi nét cọ khi rê chuột.
- Chữ Hán trang trí dùng font Khải thư nếu máy có, không thì Tống thể (SimSun) có sẵn trên Windows; không tải font ngoài. *(Thay ngày 2026-10-26, xem mục "Font thư pháp".)*

### Tranh nền màn chính (2026-10-26)
- Tranh `apps/game/src/assets/menu-bg.webp` (1774×887, 480 KB) do chủ dự án cung cấp; **chưa rõ nguồn và giấy phép**, cần xác nhận trước khi phát hành.
- Tranh đặt trên một "sân khấu" giữ tỉ lệ 2:1, phủ kín màn hình; hiệu ứng ánh sáng gắn theo % của tranh nên luôn đúng chỗ ở mọi tỉ lệ màn hình.
- Hiệu ứng: máy quay trôi chậm (50 s), parallax theo chuột, vầng hào quang cung điện nhấp nháy và vòng sáng lan ra, trăng tỏa sáng, đèn lồng chập chờn, hai lớp sương trôi ngược chiều (nhiễu SVG), cánh hoa mai rơi và đốm linh khí bay lên (canvas, tự dừng khi tab ẩn), tiêu đề chữ Hán hiện dần như mực loang, mở màn từ màu giấy.
- Người dùng bật "giảm chuyển động" của hệ điều hành thì mọi hiệu ứng động tắt, chỉ còn tranh tĩnh.
- Tiêu đề và menu nằm trong dải sương bên phải để không che nhân vật (trái) và cung điện (giữa).

### Nhạc nền (2026-10-26)
- Bản sáo trúc và đàn tranh (203 giây) do chủ dự án cung cấp; gốc là MP3 256 kbps, 6,5 MB (đã bị cắt dải trên 16 kHz từ trước). Nén lại bằng ffmpeg 9.0.2 từ bản gốc (không nén chồng): **Opus 96 kbps trong WebM** (`bamboo-flute-guzheng.webm`, 2,7 MB) dùng chính, **MP3 128 kbps** (`bamboo-flute-guzheng-128.mp3`, 3,1 MB) dự phòng cho trình duyệt không phát được Opus (Safari trước 17). Game chọn bằng `canPlayType`, chỉ tải một bản. Độ lớn giữ nguyên (-17 dB trung bình); phổ Opus gần như trùng bản gốc tới 16 kHz, MP3 128 kbps có vài lỗ phổ nhỏ ở 8–14 kHz. Tên file gốc có dạng của Pixabay (`chinesezenmusic-…-618302.mp3`); **cần xác nhận nguồn và giấy phép** trước khi phát hành.
- `apps/game/src/app/music.ts`: phát lặp xuyên suốt các màn; trình duyệt chặn tự phát nên nhạc bắt đầu ở lần bấm hoặc gõ phím đầu tiên, tăng âm dần 2,5 giây; tạm dừng khi tab ẩn.
- Bật/tắt bằng ấn tròn 樂 ở góc dưới trái (mọi màn) hoặc trong Thiết lập; Thiết lập có thanh âm lượng (mặc định 40%). Lựa chọn lưu trong `localStorage` của trình duyệt, không thuộc save game.
- **Gió thổi áo nhân vật** (`apps/game/src/ui/ClothWind.tsx`): một canvas WebGL nhỏ phủ đúng hộp chứa nhân vật, vẽ lại phần tranh đó và làm méo theo sóng gió (sóng nhỏ chạy dọc vải + nhịp đung đưa chậm + cơn gió mạnh yếu). Vùng bay là các đa giác tóc, dải lụa, vạt áo, tay áo (toạ độ tranh gốc, trong `MainMenu.tsx`); độ bay tăng theo khoảng cách tới "sống lưng" nên đầu và thân đứng yên, đuôi vải bay nhiều nhất; chiếc ghế gỗ phía sau được loại trừ. Ngoài vùng vải canvas trong suốt nên ghép liền với tranh. Tắt khi "giảm chuyển động", dừng khi tab ẩn. Đổi tranh nền thì phải vẽ lại các đa giác này.

### Chân dung nhân vật (2026-10-26)
- Nguồn: bản xuất của portrait-studio (`xianxia-npc-export` 1.2.0, 100 nhân vật, PNG 512×768, 60 MB) do chủ dự án cung cấp ("Tuoi18-Maincharacter").
- `tools/portraits/import.mjs` kiểm tra sha256 theo manifest, chỉ lấy **người thường, tuổi ≤ 30** (vai chính trẻ; bỏ chủng tộc phi nhân vì v0.1 là thế giới phàm nhân), chuyển WebP chất lượng 82 bằng ffmpeg: 31 ảnh (17 nam, 14 nữ), 1,27 MB, kèm `index.json`.
- Mỗi đời gắn cố định một gương mặt cùng giới tính, chọn bằng băm (nơi sinh, tên, tick sinh) — chỉ hiển thị, không vào sim hay digest. Dưới 15 tuổi vẫn hiện bóng người bằng mực; từ 15 tuổi hiện chân dung. Màn tổng kết hiện chân dung nếu mất từ 15 tuổi.
- Hạn chế: một đời chỉ một gương mặt trẻ (gói không có cùng một người ở nhiều độ tuổi); người già vẫn hiện tranh thời trẻ.
- **Kho chân dung NPC (2026-10-26)**: gói "gia đình và xã hội phàm nhân" (`export_20261026_154318.zip`, 100 người thường, 12–85 tuổi) nhập bằng `node tools/portraits/import.mjs <thư mục đã giải nén> --role npc` vào `apps/game/src/assets/portraits-npc/` (WebP, 3,93 MB). Chỉ mục `index.json` gồm `id, gender, age, socialStatus, background` để sau này ghép đúng người (gia đình bần hàn, thế gia…). Phân bố: dưới 15 tuổi 11, 15–30 tuổi 39, 31–50 tuổi 22, trên 50 tuổi 28; tầng lớp bần hàn 13, bình dân 30, khá giả 34, giàu có 14, quyền quý 9.
  - **Chưa hiển thị**: chưa có code nào tham chiếu nên không vào bản build. Dùng khi làm NPC (v0.4) và gia đình (v0.5).
  - Lưu ý khi ghép: `socialStatus` của portrait-studio có `elite` (quyền quý) mà xuất thân trong sim v0.1 chưa có; `background` là từ điển của portrait-studio (`mortal_village`, `noble_clan`…), khác bộ xuất thân của sim.

### Font thư pháp (2026-10-26, sửa cùng ngày)
- Chủ dự án muốn tiêu đề "Trường Sinh Vô Lộ" mang nét chữ Hán/Nho. Font thư pháp Trung (Ma Shan Zheng, Zhi Mang Xing…) thiếu dấu tiếng Việt nên loại.
- **Lần 1 (lỗi):** Yuji Mai cho chữ Việt, Yuji Syuku cho chữ Hán. Danh sách ký tự Google công bố báo đủ dấu, nhưng đo thật thì tệp Yuji Mai **thiếu 101/146 chữ có dấu** (ư, ờ, ộ, đ… bị trình duyệt mượn font khác, lệch nét), còn Yuji Syuku thiếu 36 chữ giản thể của tên địa danh.
- **Lần 2 (đang dùng):** một font Khải thư duy nhất **LXGW WenKai TC** (OFL 1.1), nét đậm 700, cho tiêu đề và menu tiếng Việt ở màn chính, mọi chữ Hán trang trí (長生無路, ấn triện, vòng mùa, ấn nơi sinh, ấn 樂) và tên địa danh chữ Hán. `tools/fonts/fetch.mjs` tải bộ con 383 ký tự (toàn bộ chữ Việt, 145 chữ Hán; chữ địa danh lấy tự động từ bảng Hán-Việt) thành một tệp 59,8 KB kèm giấy phép.
- **Cách kiểm tra:** không tin danh sách ký tự của nhà cung cấp; vẽ từng ký tự trong Chrome. Chữ Việt: so độ rộng khi dự phòng monospace và serif (khác nhau là đang mượn font). Chữ Hán: so điểm ảnh với SimSun (giống hệt là đang mượn). Kết quả: thiếu 0/146 chữ Việt, 0/145 chữ Hán.
- Nét cọ chỉ dùng ở màn chính (quyết định của chủ dự án); nhãn ở các màn khác giữ chữ có chân.
