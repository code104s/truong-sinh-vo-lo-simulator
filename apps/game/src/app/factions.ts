// Khối "Thế lực ở {nơi}" (v0.6 F2): thế lực đặt chân ở quận đang đứng, vai của từng thế lực với nơi ấy, nhãn thế lực
// của một người. Thuần, không có luật game: số liệu từ STATE.factions, STATE.control.
import type { ContentId, FactionId, FactionKind, FactionView, NpcView } from '@tsvl/shared';

/** Vai của thế lực với quận đang đứng. */
export type FactionRole = 'holder' | 'lost' | 'lead' | 'seat' | 'near';
export interface FactionRow { f: FactionView; roles: FactionRole[] }

const KIND_ORDER: Record<FactionKind, number> = { government: 0, clan: 1, guild: 2, bandits: 3 };
const idNum = (id: string) => Number(id.slice(1));
/** Chữ triện theo loại thế lực. */
export const FACTION_CHAR: Record<FactionKind, string> = { government: '官', clan: '族', guild: '商', bandits: '匪' };

/**
 * Thế lực ở quận `county`: quan phủ luôn có mặt (giữ đất này, hay đã mất đất này vào tay kẻ khác); người cát cứ giữ đất
 * này; gia tộc đứng đầu hay đặt nhà thờ họ ở đây; thương hội có hội quán ở đây; băng cướp có sào huyệt ở đây hay giữ
 * đường qua đây. Thứ tự: quan phủ, gia tộc (họ đứng đầu trước), thương hội, băng cướp; trong loại theo id.
 */
export function factionsHere(factions: readonly FactionView[], control: readonly (FactionId | null)[], county: number): FactionRow[] {
  const holder = control[county] ?? null;
  const rows: FactionRow[] = [];
  for (const f of factions) {
    const roles: FactionRole[] = [];
    if (f.id === holder) roles.push('holder');
    // Quan phủ của vùng luôn có mặt; đất này do kẻ khác cát cứ thì ghi đã mất
    else if (f.kind === 'government' && holder !== null) roles.push('lost');
    if (f.kind === 'clan' && f.counties.includes(county)) roles.push('lead');
    if (f.seat === county) roles.push('seat');
    if (f.kind === 'bandits' && f.seat !== county && (f.roads ?? []).some(([a, b]) => a === county || b === county)) roles.push('near');
    if (roles.length || f.kind === 'government') rows.push({ f, roles });
  }
  return rows.sort((a, b) => KIND_ORDER[a.f.kind] - KIND_ORDER[b.f.kind] || Number(b.roles.includes('lead')) - Number(a.roles.includes('lead')) || idNum(a.f.id) - idNum(b.f.id));
}

/** Khóa nhãn vai trên một dòng; vai "trị sở" đọc theo loại (nha môn, nhà thờ họ, hội quán, sào huyệt). */
export function roleKey(f: FactionView, role: FactionRole): ContentId {
  return role === 'seat' ? `ui.factions.seat.${f.kind}` : `ui.factions.role.${role}`;
}

/** Nhãn thế lực của một người (người họ …, hội viên, người của đảng, sai dịch); không thuộc thế lực nào thì null. */
export function memberLabel(p: Pick<NpcView, 'faction'>, factions: readonly FactionView[]): { key: ContentId; params: Record<string, string | number> } | null {
  const f = p.faction ? factions.find((x) => x.id === p.faction) : undefined;
  if (!f) return null;
  return { key: `ui.factions.member.${f.kind}`, params: { ...f.name.params } };
}

/** Người cầm đầu: người có tên quanh mình (ở quận đang đứng hay người quen); không thấy thì null (ở nơi khác). */
export function leaderOf(f: FactionView, people: readonly NpcView[], circle: readonly NpcView[]): NpcView | null {
  if (!f.leader) return null;
  return people.find((p) => p.id === f.leader) ?? circle.find((p) => p.id === f.leader) ?? null;
}
