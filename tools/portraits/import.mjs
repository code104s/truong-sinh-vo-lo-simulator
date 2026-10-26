// Nhập chân dung từ bản xuất của portrait-studio (schema "xianxia-npc-export") vào game.
//   node tools/portraits/import.mjs <thư mục xuất đã giải nén> [--role main|npc] [--max-age N]
// Kiểm tra sha256 theo manifest, chỉ lấy người thường (race = human), chuyển PNG sang WebP bằng ffmpeg
// và ghi chỉ mục index.json. Cần ffmpeg trên PATH (hoặc biến FFMPEG).
//   main: chân dung nhân vật chính → apps/game/src/assets/portraits      (mặc định tuổi ≤ 30)
//   npc : kho chân dung NPC, gia đình → apps/game/src/assets/portraits-npc (mọi tuổi)
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const src = args[0];
const role = opt('--role') ?? 'main';
if (!src || src.startsWith('--') || !['main', 'npc'].includes(role)) {
  console.error('Dùng: node tools/portraits/import.mjs <thư mục xuất đã giải nén> [--role main|npc] [--max-age N]');
  process.exit(1);
}
const maxAge = Number(opt('--max-age') ?? (role === 'main' ? 30 : Infinity));
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../apps/game/src/assets', role === 'main' ? 'portraits' : 'portraits-npc');

const manifest = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8'));
if (manifest.schema !== 'xianxia-npc-export') throw new Error(`schema lạ: ${manifest.schema}`);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const index = [];
let skipped = 0;
for (const entry of manifest.npcs) {
  const npc = JSON.parse(readFileSync(join(src, entry.data), 'utf8'));
  if (npc.id !== entry.id) throw new Error(`${entry.id}: id trong file dữ liệu là ${npc.id}`);
  if (npc.race !== 'human' || npc.age > maxAge) {
    skipped++;
    continue;
  }
  const png = join(src, entry.portrait);
  const hash = createHash('sha256').update(readFileSync(png)).digest('hex');
  if (hash !== entry.sha256) throw new Error(`${entry.id}: sha256 không khớp manifest`);
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', png, '-c:v', 'libwebp', '-quality', '82', '-compression_level', '6', join(out, `${npc.id}.webp`)]);
  const item = { id: npc.id, gender: npc.gender, age: npc.age };
  // Kho NPC cần thêm tầng lớp và xuất thân để ghép đúng người (gia đình nghèo, thế gia…)
  if (role === 'npc') Object.assign(item, { socialStatus: npc.socialStatus, background: npc.background });
  index.push(item);
}
index.sort((a, b) => (a.id < b.id ? -1 : 1));
writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 1) + '\n');
const bytes = readdirSync(out).reduce((s, f) => s + statSync(join(out, f)).size, 0);
const count = (g) => index.filter((p) => p.gender === g).length;
console.log(`[${role}] nhập ${index.length} chân dung (nam ${count('male')}, nữ ${count('female')}), bỏ ${skipped}; ${(bytes / 1e6).toFixed(2)} MB → ${out}`);
