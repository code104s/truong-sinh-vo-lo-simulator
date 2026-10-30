# ADR 0023 — Linh căn 15% và dấu hiệu tiên duyên

- Trạng thái: **ĐÃ DUYỆT** (2026-10-30, chủ dự án chọn phương án B trên thẻ quyết định ở đề xuất "Làm Trường Sinh Vô Lộ cuốn hơn", mục 8.1).
- Ngày: 2026-10-30
- Liên quan: GDD 1.1 (trụ cột 4 "không phải nhân vật chính"), 3.2 A, L2; ADR 0022 (Q2, Q4, Q5, Q7, Q8); `docs/v0.8-giai-doan-a.md` mục 6

## Bối cảnh
- Từ v0.1, 5% nhân vật (người chơi và NPC, cùng hàm `createCharacter`) có linh căn (`SPIRIT_ROOT_PPM`, "giá trị tạm, chốt ở v0.8"). ADR 0022 Q2 giữ 5% làm khởi điểm, chỉnh tỉ lệ này sau cùng.
- Chủ dự án đặt mục tiêu: **người chơi giỏi đi từ lúc sinh tới dẫn khí trong khoảng một tiếng thật**. Với 5%, trung bình hai mươi đời mới có một đời tu được, nên người chơi giỏi cũng không làm được điều đó ở đa số đời.
- GDD L2 đòi người chạm ngưỡng là thiểu số; trụ cột 4 cấm cho người chơi "chọn làm nhân vật chính".
- Linh căn ẩn hoàn toàn tới lúc được kiểm (Q4). Người chơi chưa có cách nào đoán trước để quyết định sớm có đi tìm đạo hay không.

## Phương án
| | A. Giữ 5% | B. ~15% cho mọi nhân vật, kèm dấu hiệu tiên duyên (khuyến nghị) | C. Xuất thân "có tiên duyên" chọn lúc tạo nhân vật |
|---|---|---|---|
| Được | Không đổi cân bằng | Khoảng 1/7 đời có cơ hội, vẫn là thiểu số; cùng luật với NPC; người giỏi đọc dấu hiệu để biết sớm | Người muốn tu tiên có lối rõ |
| Mất | 19/20 đời không chạm ngưỡng, người mới dễ bỏ game trước phần hay nhất | Đổi cân bằng nền: trẻ NPC đỗ kỳ tuyển rời vùng nhiều gấp khoảng ba lần, phải đo lại dân số và mọi batch | Gần với chọn làm nhân vật chính, dễ phá trụ cột 4 |

## Quyết định: phương án B
- **`SPIRIT_ROOT_PPM` = 150.000 (15%)** cho người chơi và NPC. Phân bố số hệ, độ thuần, cách xếp dải tạp/khá/tốt giữ nguyên (ADR 0022 S2).
- **Dấu hiệu tiên duyên** (`life/omens.ts`). Đầu mỗi năm, từ 4 tới 11 tuổi, trẻ có thể lộ một dấu hiệu, ghi thành một dòng biên niên (`log.omen.*`): mơ thấy đốm sáng trên núi, vết thương mau lành, gia súc sợ, nghe tiếng thở trong gió. Chữ không nói thẳng là linh căn.
  - Cơ hội mỗi năm theo dải: tốt 50%, khá 35%, tạp 25%. Người không có linh căn vẫn gặp 3% mỗi năm, coi như trùng hợp.
  - Một dấu hiệu là gợi ý, chưa phải bằng chứng. Hai dấu hiệu trở lên thì đáng tin: đời không có linh căn ít khi gặp tới hai lần (test: dưới 5%), đời có linh căn tạp gặp từ hai lần ở hơn nửa số đời.
  - Dấu hiệu chỉ là chữ, không đổi luật. Nó suy từ seed gốc của đời bằng băm (`hash32('omen', lifeRoot, tuổi)`): không rút RNG, không thêm trạng thái vào save. Chỉ người chơi có dòng biên niên này; NPC không có biên niên nên không cần.
- **Cân bằng đi kèm** (ADR 0022 Q2 cho phép chỉnh tốc độ tu luyện, tỉ lệ đột phá; đo bằng batch tìm đạo, ghi ở ADR 0022 S7):
  - linh khí mỗi ô của linh căn tạp 50% → **20%** (tạp linh căn gần như vô vọng ở đường tán tu, chậm ở đường tông môn);
  - tán tu đột phá −8% → **−3%** (vẫn khó hơn đệ tử tông môn, vốn có linh thạch và thầy);
  - thân thể tầng 1 ít bệnh 70% → **85%** (để người tầng 1 không thọ hơn người cùng tuổi quá 8 năm).

## Hệ quả
- **Dân số:** kỳ tuyển nhận nhiều trẻ NPC hơn. Thế giới 30 seed × 100 năm vẫn giữ dân số mỗi quận 75–130% hạn mức, người 25–50 tuổi có vợ/chồng 81,6%, phụ nữ qua 45 tuổi trung bình 2,14 con. Hai tiêu chí v0.7 vẫn trượt như trước (nợ v0.7, chủ dự án để lại).
- **Tiêu chí gia đình (v0.5):** "cưới trước 30 tuổi" tụt 71,9% → 69,4% vì ít thanh niên để cưới hơn. Chủ dự án duyệt hạ ngưỡng 70% → **65%** (2026-10-30), giữ luật kỳ tuyển (không đặt hạn ngạch).
- **Kỳ tuyển:** nhiều trẻ khá, tốt hơn nên kỳ tuyển ít khi phải nhận linh căn tạp (`SECT_MIN_RECRUITS`, Q5). Đây là lý do chính khiến tỉ lệ vào tầng 1 của đường tông môn hạ từ 83% xuống 53%.
- **Digest:** đổi cho mọi đời, vì lúc dựng NPC rút thêm độ thuần, số hệ. Digest pin cập nhật, kèm ghi chú.
- **Người chơi máy thường:** không ai vào tầng 1 (0/1.000 mỗi chiến lược; tiêu chí dưới 0,5%).
- **Rủi ro:** dấu hiệu chỉ có ở biên niên; giao diện (F1, F3) cần cho người chơi thấy dòng này ở tuổi thơ, nếu không thì kỹ năng "đọc dấu hiệu" không tồn tại. Tỉ lệ 3% trùng hợp và 25–50% có thật chưa thử trên người chơi thật.
