// Chữ Hán trang trí cho ấn triện và vòng mùa. Chỉ để hiển thị, không phải luật game.
import { CULTIVATION_EVENT_IDS } from '@tsvl/content';
import type { CareerId, LogEntry, Season, SettlementKind, SiteKind } from '@tsvl/shared';

export const SEASON_CHAR: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
export const KIND_CHAR: Record<SettlementKind, string> = { city: '城', town: '鎮', village: '村' };

export type SealTone = 'red' | 'ink' | 'jade' | 'ochre';

/** Triện nghề (v0.7 F3): thanh trạng thái, khối Nghề, bảng chọn nghề, thẻ sự kiện riêng của nghề, biên niên. */
export const CAREER_CHAR: Record<CareerId, { char: string; tone: SealTone }> = {
  farmer: { char: '農', tone: 'ochre' }, artisan: { char: '匠', tone: 'ochre' }, hunter: { char: '獵', tone: 'ochre' },
  merchant: { char: '商', tone: 'ochre' }, physician: { char: '醫', tone: 'jade' }, soldier: { char: '兵', tone: 'ink' },
  drifter: { char: '浪', tone: 'ink' }, recluse: { char: '隱', tone: 'jade' }, outlaw: { char: '匪', tone: 'red' },
};

/** Triện đường tiên (v0.8 F3): thẻ sự kiện đường tiên, biên niên. */
export const DAO_CHAR = { char: '道', tone: 'jade' } as const satisfies { char: string; tone: SealTone };
/** Chốn đã biết trên bản đồ (F3): di tích (hang đá cũ), miếu. */
export const SITE_CHAR: Record<SiteKind, string> = { ruin: '洞', shrine: '廟' };

/** Ấn của từng hành động trong kế hoạch tháng và bảng chọn. */
export const ACTION_CHAR: Record<string, { char: string; tone: SealTone }> = {
  'action.farm': { char: '耕', tone: 'ink' }, 'action.hire': { char: '傭', tone: 'ink' }, 'action.forage': { char: '採', tone: 'ink' },
  'action.hunt': { char: '獵', tone: 'ink' }, 'action.trade': { char: '商', tone: 'ink' }, 'action.study': { char: '學', tone: 'ink' },
  'action.train': { char: '武', tone: 'ink' }, 'action.rest': { char: '休', tone: 'jade' }, 'action.heal': { char: '醫', tone: 'jade' },
  'action.travel': { char: '行', tone: 'red' },
  // Xã giao (v0.5)
  'action.visit': { char: '訪', tone: 'jade' }, 'action.ask_help': { char: '求', tone: 'ink' }, 'action.propose': { char: '婚', tone: 'red' },
  // Học việc (v0.7 S1); việc riêng của nghề, mua ruộng (S2)
  'action.apprentice': { char: '徒', tone: 'ochre' },
  'action.craft': { char: '匠', tone: 'ink' }, 'action.trap': { char: '阱', tone: 'ink' }, 'action.buy_land': { char: '田', tone: 'ochre' },
  // Thương nhân (S3)
  'action.haul': { char: '販', tone: 'red' }, 'action.join_guild': { char: '會', tone: 'ochre' },
  // Lính, võ đường (S4)
  'action.dojo': { char: '館', tone: 'ink' }, 'action.enlist': { char: '募', tone: 'ochre' }, 'action.patrol': { char: '巡', tone: 'ink' },
  // Thầy thuốc (S5); lưu lạc, ẩn dật (S6)
  'action.practice': { char: '醫', tone: 'jade' },
  'action.drift': { char: '浪', tone: 'ink' }, 'action.build_hut': { char: '廬', tone: 'jade' },
  // Tìm cơ duyên (v0.8 S1)
  'action.seek': { char: '尋', tone: 'jade' },
  // Đường tu (v0.8 F2): dự tuyển, tạp dịch tông môn, tự dẫn khí, tu luyện, đột phá
  'action.trial': { char: '試', tone: 'jade' }, 'action.sect_duty': { char: '役', tone: 'ink' }, 'action.induce': { char: '引', tone: 'jade' },
  'action.cultivate': { char: '修', tone: 'jade' }, 'action.breakthrough': { char: '破', tone: 'red' },
};

/** Ấn triện cho một mục nhật ký theo khóa nội dung: chữ và màu. */
export function logSeal(e: LogEntry): { char: string; tone: SealTone } | null {
  if (e.key === 'log.birth') return { char: '生', tone: 'red' };
  // Kết quả sự kiện riêng của nghề (v0.7 F3): triện nghề
  if (e.career) return CAREER_CHAR[e.career];
  if (e.key.startsWith('log.outlaw.')) return { char: '匪', tone: 'red' };
  // Vào nghề, lên bậc, rời nghề (v0.7 S1)
  if (e.key.startsWith('log.career.')) return { char: '業', tone: 'ochre' };
  if (e.key.startsWith('log.haul.') || e.key.startsWith('log.guild.')) return { char: '販', tone: e.key === 'log.haul.robbed' ? 'red' : 'ochre' };
  if (e.key.startsWith('log.soldier.')) return { char: '兵', tone: e.key === 'log.soldier.lost' ? 'red' : 'ochre' };
  if (e.key === 'log.death' || e.key === 'log.death.hungry') return { char: '終', tone: 'ink' };
  if (e.key === 'log.age.milestone') return { char: '壽', tone: 'red' };
  if (e.key === 'log.npc.death') return { char: '喪', tone: 'ink' };
  if (e.key === 'log.npc.birth') return { char: '嬰', tone: 'jade' };
  if (e.key === 'log.illness.onset') return { char: '病', tone: 'ink' };
  if (e.key === 'log.injury.onset') return { char: '傷', tone: 'ink' };
  if (e.key === 'log.health.worse') return { char: '危', tone: 'ink' };
  if (e.key.endsWith('.recovered')) return { char: '癒', tone: 'red' };
  if (e.key.startsWith('log.hunger.')) return { char: '飢', tone: 'red' };
  if (e.key.startsWith('log.harvest.') || e.key === 'log.world.harvest_good') return { char: '穀', tone: 'jade' };
  if (e.key === 'log.world.famine' || e.key === 'log.world.harvest_bad') return { char: '荒', tone: 'ochre' };
  if (e.key.startsWith('log.tax.')) return { char: '稅', tone: 'ink' };
  if (e.key === 'log.travel.arrived') return { char: '行', tone: 'ink' };
  // Quan hệ, gia đình, lời đồn (v0.5 F3)
  if (e.key === 'log.kin.death') return { char: '喪', tone: 'red' };
  if (e.key === 'log.kin.birth') return { char: '嬰', tone: 'red' };
  if (e.key.startsWith('log.marry.wed')) return { char: '婚', tone: 'red' };
  if (e.key === 'log.marry.refused' || e.key === 'log.social.refused' || e.key === 'log.social.cannot_help') return { char: '拒', tone: 'ink' };
  if (e.key === 'log.kin.help' || e.key.startsWith('log.social.helped')) return { char: '恩', tone: 'jade' };
  if (e.key === 'log.social.visit') return { char: '訪', tone: 'jade' };
  if (e.key === 'log.kin.inherit') return { char: '承', tone: 'ochre' };
  if (e.key.startsWith('log.rumor.')) return { char: '聞', tone: 'ochre' };
  // Thế sự (v0.6 F3): cướp đỏ, quan phủ mực, họ lớn, thương hội vàng đất
  if (e.key === 'log.faction.bandits_founded' || e.key === 'log.faction.seized_bandits') return { char: '匪', tone: 'red' };
  if (e.key.startsWith('log.faction.campaign_') || e.key === 'log.faction.retaken') return { char: '官', tone: 'ink' };
  if (e.key.startsWith('log.faction.')) return { char: '勢', tone: 'ochre' };
  // Đường tiên (v0.8 F3): tông môn, dấu hiệu lúc nhỏ, dẫn khí, tu luyện, đột phá, sự kiện đường tiên
  if (e.key.startsWith('log.sect.')) return { char: '宗', tone: e.key === 'log.sect.expelled' || e.key.startsWith('log.sect.rejected') ? 'ink' : 'jade' };
  if (e.key.startsWith('log.omen.')) return { char: '兆', tone: 'jade' };
  if (e.key.startsWith('log.breakthrough.')) return e.key === 'log.breakthrough.ok' ? { char: '成', tone: 'jade' } : { char: '逆', tone: 'red' };
  if (e.key.startsWith('log.rogue.')) return { char: '引', tone: e.key === 'log.rogue.induced' ? 'jade' : 'ink' };
  if (e.key.startsWith('log.cultivate.')) return { char: '修', tone: 'jade' };
  if (e.key.startsWith('event.') && CULTIVATION_EVENT_IDS.has(e.key.slice(0, e.key.indexOf('.', 'event.'.length)))) return DAO_CHAR;
  return null;
}
