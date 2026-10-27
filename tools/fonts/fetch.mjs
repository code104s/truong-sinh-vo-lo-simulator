// Tải font (Google Fonts, OFL 1.1) về apps/game/src/assets/fonts/, chỉ giữ ký tự game cần.
//   node tools/fonts/fetch.mjs
// - LXGW WenKai TC (Khải thư): mọi chữ trang trí để nét đồng bộ — tựa, nút, nhãn, chữ Hán trang trí, tên địa danh chữ Hán.
// - Noto Serif (2026-10-27, đề xuất giao diện Q1): thân bài, nhật ký, sự kiện. Trước đó CSS khai báo nhưng không tải,
//   trình duyệt rơi về Times New Roman.
// Đã loại (2026-10-26), đo bằng cách vẽ thật trong trình duyệt:
//   Yuji Mai   — Google báo có dấu tiếng Việt nhưng tệp thiếu 101/146 chữ có dấu (trình duyệt mượn font khác).
//   Yuji Syuku — thiếu 36 chữ giản thể dùng trong tên địa danh (苍 龙 东 长…).
// Thêm chữ Hán trang trí mới thì thêm vào HAN rồi chạy lại; chữ địa danh lấy tự động từ bảng Hán-Việt của worldgen.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = join(root, 'apps/game/src/assets/fonts');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36';

/** Bảng chữ tiếng Việt: mọi nguyên âm × 6 thanh (dựng sẵn NFC), hoa và thường, đ, cộng ASCII in được. */
function vietnamese() {
  const vowels = ['a', 'ă', 'â', 'e', 'ê', 'i', 'o', 'ô', 'ơ', 'u', 'ư', 'y'];
  const tones = ['', '̀', '́', '̉', '̃', '̣'];
  const set = new Set();
  for (let c = 0x20; c < 0x7f; c++) set.add(String.fromCharCode(c));
  for (const v of vowels) for (const t of tones) {
    const ch = (v + t).normalize('NFC');
    set.add(ch);
    set.add(ch.toUpperCase());
  }
  for (const ch of ['đ', 'Đ', '·', '–', '—', '…', '“', '”', '‘', '’', '²']) set.add(ch);
  return [...set].join('');
}

/** Chữ Hán trang trí: tiêu đề, ấn triện nhật ký, ấn mệnh, vòng mùa, loại nơi sinh, nút nhạc. */
const HAN = '長生無路命終病傷癒壽危變春夏秋冬城鎮村樂天' +
  // Ấn hành động và ấn tin v0.3 (đề xuất giao diện 2026-10-27)
  '耕傭採獵商學武休醫行飢穀稅荒錢' +
  // Tờ đề tựa bản đồ tranh treo
  '輿圖';
/** Chữ Hán của tên địa danh (bảng Hán-Việt trong worldgen). */
const PLACE_HAN = [...readFileSync(join(root, 'packages/worldgen/src/region/hanviet.ts'), 'utf8').matchAll(/(\p{Script=Han}): '/gu)].map((m) => m[1]).join('');

/** Tải một bộ chữ rút gọn theo `text`; trả về số KB. */
async function subset(family, axis, text, file) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:${axis}&text=${encodeURIComponent(text)}`, { headers: { 'User-Agent': UA } })).text();
  const urls = [...css.matchAll(/url\((https:[^)]+)\) format\('woff2'\)/g)].map((m) => m[1]);
  if (urls.length !== 1) throw new Error(`${family} ${axis}: cần đúng 1 tệp woff2, nhận ${urls.length}`);
  const buf = Buffer.from(await (await fetch(urls[0])).arrayBuffer());
  writeFileSync(join(out, file), buf);
  return (buf.length / 1024).toFixed(1);
}
async function license(dir, file) {
  const lic = await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${dir}/OFL.txt`);
  if (!lic.ok) throw new Error(`không tải được giấy phép ${dir} (${lic.status})`);
  writeFileSync(join(out, file), await lic.text());
}

mkdirSync(out, { recursive: true });
const wenkai = [...new Set([...vietnamese(), ...HAN, ...PLACE_HAN])].join('');
console.log(`LXGW WenKai TC 700: ${[...wenkai].length} ký tự (Hán ${[...new Set([...HAN, ...PLACE_HAN])].length}) → ${await subset('LXGW WenKai TC', 'wght@700', wenkai, 'lxgw-wenkai-tc.woff2')} KB`);
await license('lxgwwenkaitc', 'lxgw-wenkai-tc.OFL.txt');

const viet = vietnamese();
for (const [axis, file] of [['wght@400', 'noto-serif-400.woff2'], ['wght@600', 'noto-serif-600.woff2'], ['wght@700', 'noto-serif-700.woff2'], ['ital,wght@1,400', 'noto-serif-400-italic.woff2']]) {
  console.log(`Noto Serif ${axis}: ${[...viet].length} ký tự → ${await subset('Noto Serif', axis, viet, file)} KB`);
}
await license('notoserif', 'noto-serif.OFL.txt');
