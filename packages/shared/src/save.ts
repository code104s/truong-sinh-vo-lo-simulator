// Định dạng save (ADR 0004). Trong bộ nhớ và qua postMessage/IndexedDB, mảng số giữ nguyên kiểu;
// encodeSave/decodeSave đổi sang JSON văn bản (file CLI, xuất save), mảng số mã hóa base64 little-endian.
import { vCommandRecord, type CommandRecord } from './actions';
import { vLogEntry, type LogEntry } from './character';
import { arr, lit, nat, nonEmpty, obj, parseWith, unknownValue, type Result } from './schema';
import { vBirthplace, vRegionMapData, vRegionSummary, vWorldSeed, type Birthplace, type RegionMapData, type RegionSummary, type WorldSeed } from './world';

export const SAVE_FORMAT = 'tsvl-save';
/** 2: v0.2 — thêm nhật ký lệnh (ADR 0011); save version 1 bị từ chối (ADR 0004). */
export const SAVE_VERSION = 2;

export interface SaveRegion {
  summary: RegionSummary;
  map: RegionMapData;
  birthplaces: Birthplace[];
  /** Lớp logic của vùng; sim sở hữu định dạng, chỉ số nguyên và chuỗi. */
  logic: unknown;
}

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: typeof SAVE_VERSION;
  protocolVersion: number;
  simVersion: string;
  worldSeed: WorldSeed;
  region: SaveRegion;
  /** Snapshot sim; sim sở hữu định dạng. */
  sim: unknown;
  log: LogEntry[];
  /** Các lệnh đổi trạng thái đời, theo thứ tự, để phát lại (ADR 0011). */
  commandLog: CommandRecord[];
  /** Digest snapshot sim lúc lưu. */
  digest: string;
}

export const vSaveFile = obj<SaveFile>({
  format: lit(SAVE_FORMAT),
  version: lit(SAVE_VERSION),
  protocolVersion: nat,
  simVersion: nonEmpty,
  worldSeed: vWorldSeed,
  region: obj<SaveRegion>({ summary: vRegionSummary, map: vRegionMapData, birthplaces: arr(vBirthplace), logic: unknownValue }),
  sim: unknownValue,
  log: arr(vLogEntry),
  commandLog: arr(vCommandRecord),
  digest: nonEmpty,
});

// —— base64 (không dùng btoa/Buffer để chạy giống nhau ở Node, worker và trình duyệt) ——
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Int16Array(128).fill(-1);
for (let i = 0; i < B64.length; i++) B64_INDEX[B64.charCodeAt(i)] = i;

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + '==';
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + '=';
  }
  return out;
}

export function base64ToBytes(s: string): Uint8Array {
  if (s.length % 4 !== 0) throw new Error('base64: độ dài không chia hết cho 4');
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((s.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    let n = 0;
    for (let j = 0; j < 4; j++) {
      const c = s.charCodeAt(i + j);
      const d = c === 61 ? 0 : c < 128 ? B64_INDEX[c]! : -1;
      if (d < 0) throw new Error(`base64: ký tự lạ ở ${i + j}`);
      n = (n << 6) | d;
    }
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

type TaTag = 'f32' | 'i16' | 'u8';
interface TaJson {
  $ta: TaTag;
  b64: string;
}

function encodeTyped(a: Float32Array | Int16Array | Uint8Array): TaJson {
  if (a instanceof Uint8Array) return { $ta: 'u8', b64: bytesToBase64(a) };
  const size = a instanceof Float32Array ? 4 : 2;
  const bytes = new Uint8Array(a.length * size);
  const dv = new DataView(bytes.buffer);
  for (let i = 0; i < a.length; i++) {
    if (a instanceof Float32Array) dv.setFloat32(i * 4, a[i]!, true);
    else dv.setInt16(i * 2, a[i]!, true);
  }
  return { $ta: a instanceof Float32Array ? 'f32' : 'i16', b64: bytesToBase64(bytes) };
}

function decodeTyped(t: TaJson): Float32Array | Int16Array | Uint8Array {
  const bytes = base64ToBytes(t.b64);
  if (t.$ta === 'u8') return bytes;
  const dv = new DataView(bytes.buffer);
  if (t.$ta === 'f32') {
    const out = new Float32Array(bytes.length / 4);
    for (let i = 0; i < out.length; i++) out[i] = dv.getFloat32(i * 4, true);
    return out;
  }
  const out = new Int16Array(bytes.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = dv.getInt16(i * 2, true);
  return out;
}

const isTaJson = (u: unknown): u is TaJson =>
  typeof u === 'object' && u !== null && ((u as TaJson).$ta === 'f32' || (u as TaJson).$ta === 'i16' || (u as TaJson).$ta === 'u8') && typeof (u as TaJson).b64 === 'string';

export function encodeSave(save: SaveFile): string {
  return JSON.stringify(save, (_k, value: unknown) => {
    if (value instanceof Float32Array || value instanceof Int16Array || value instanceof Uint8Array) return encodeTyped(value);
    if (ArrayBuffer.isView(value)) throw new Error('encodeSave: kiểu mảng số không hỗ trợ');
    return value;
  });
}

export function decodeSave(text: string): Result<SaveFile> {
  let raw: unknown;
  try {
    raw = JSON.parse(text, (_k, value: unknown) => (isTaJson(value) ? decodeTyped(value) : value));
  } catch (e) {
    return { ok: false, error: `save không phải JSON hợp lệ: ${(e as Error).message}` };
  }
  return parseSave(raw);
}

export function parseSave(u: unknown): Result<SaveFile> {
  return parseWith(vSaveFile, u, '$save');
}
