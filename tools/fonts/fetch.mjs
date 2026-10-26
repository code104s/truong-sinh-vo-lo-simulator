// Tải font Khải thư LXGW WenKai TC (Google Fonts, OFL 1.1) về apps/game/src/assets/fonts/, chỉ giữ ký tự game cần.
//   node tools/fonts/fetch.mjs
// Một font cho mọi chữ trang trí để nét đồng bộ: tiêu đề và menu tiếng Việt, chữ Hán trang trí, tên địa danh chữ Hán.
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
const HAN = '長生無路命終病傷癒壽危變春夏秋冬城鎮村樂天';
/** Chữ Hán của tên địa danh (bảng Hán-Việt trong worldgen). */
const PLACE_HAN = [...readFileSync(join(root, 'packages/worldgen/src/region/hanviet.ts'), 'utf8').matchAll(/(\p{Script=Han}): '/gu)].map((m) => m[1]).join('');

const family = 'LXGW WenKai TC';
const text = [...new Set([...vietnamese(), ...HAN, ...PLACE_HAN])].join('');
const file = 'lxgw-wenkai-tc.woff2';

mkdirSync(out, { recursive: true });
const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@700&text=${encodeURIComponent(text)}`, { headers: { 'User-Agent': UA } })).text();
const urls = [...css.matchAll(/url\((https:[^)]+)\) format\('woff2'\)/g)].map((m) => m[1]);
if (urls.length !== 1) throw new Error(`${family}: cần đúng 1 tệp woff2, nhận ${urls.length}`);
const buf = Buffer.from(await (await fetch(urls[0])).arrayBuffer());
writeFileSync(join(out, file), buf);
const lic = await fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/lxgwwenkaitc/OFL.txt');
if (!lic.ok) throw new Error(`không tải được giấy phép (${lic.status})`);
writeFileSync(join(out, 'lxgw-wenkai-tc.OFL.txt'), await lic.text());
console.log(`${family} 700: ${[...text].length} ký tự (Hán ${[...new Set([...HAN, ...PLACE_HAN])].length}) → ${file} (${(buf.length / 1024).toFixed(1)} KB)`);
