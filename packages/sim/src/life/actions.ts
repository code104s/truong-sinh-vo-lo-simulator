import { ageYearsAt, calendarOf, seasonOf, type ActionGroup, type CareerId, type CareerRank, type ActionOption, type MonthPlan, type PlanSlot, type SettlementKind, type Tick } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { hasSeverity, type CharacterState } from './character';
import { isStarving } from './household';
import { SKILL_BASE_GAIN, type Skill } from './skills';
import { CAREER_DEFS, hasRank, type CareerState } from './career';
import { seekLock } from './cultivation';
import { mountainCounty } from './wayward';
import { previewTravel } from './travel';
import { moneyCost, moneyGains, moneyLock } from '../economy/income';
import type { CountyEconomy, EconomyState } from '../economy/market';

export const ACTION_MIN_AGE = 12;
/** Tìm cơ duyên ở núi sâu (v0.8 S1): rủi ro như săn bắn; thăm miếu ở quận không núi thì không rủi ro. */
export const SEEK_MOUNTAIN_RISK_PPM = 1_500;
export interface ActionDef {
  id: string; group: ActionGroup; slots: number; stamina: number; riskPpm: number;
  skill?: Skill; places?: readonly SettlementKind[]; minStamina?: number;
  /** Chỉ sự kiện đặt vào (vd. đi phu trừ thuế); không có trong bảng chọn, không xếp vào kế hoạch được. */
  hidden?: boolean;
  /** Việc riêng của nghề (v0.7 S2): chỉ người làm nghề ấy, từ bậc `minRank`, mới làm được. */
  career?: CareerId;
  minRank?: CareerRank;
  /** Mức kỹ năng lên mỗi ô nếu khác lệ (`SKILL_BASE_GAIN`): võ đường (v0.7 S4). */
  skillGain?: number;
}
export const ACTIONS: readonly ActionDef[] = [
  { id: 'action.farm', group: 'livelihood', slots: 1, stamina: 180, riskPpm: 100, skill: 'farming', places: ['village'] },
  { id: 'action.hire', group: 'livelihood', slots: 1, stamina: 120, riskPpm: 200, skill: 'crafting', places: ['town', 'city'] },
  { id: 'action.forage', group: 'livelihood', slots: 1, stamina: 130, riskPpm: 350, skill: 'hunting' },
  { id: 'action.hunt', group: 'livelihood', slots: 1, stamina: 200, riskPpm: 1400, skill: 'hunting', places: ['village'], minStamina: 60 },
  { id: 'action.trade', group: 'livelihood', slots: 1, stamina: 60, riskPpm: 0, skill: 'trade', places: ['town', 'city'] },
  { id: 'action.study', group: 'study', slots: 1, stamina: 30, riskPpm: 0, skill: 'literacy', places: ['town', 'city'] },
  { id: 'action.train', group: 'study', slots: 1, stamina: 240, riskPpm: 800, skill: 'martial', minStamina: 80 },
  // Võ đường (v0.7 S4): học võ có thầy ở trấn, thành — tốn học phí, võ lên gấp đôi, ít rủi ro hơn tự luyện
  { id: 'action.dojo', group: 'study', slots: 1, stamina: 200, riskPpm: 400, skill: 'martial', places: ['town', 'city'], minStamina: 80, skillGain: SKILL_BASE_GAIN * 2 },
  // Việc riêng của nghề (v0.7 S2): xưởng thủ công ở trấn, thành (thợ từ bậc làm được); đặt bẫy (thợ săn). Mua ruộng: ai cũng mua được ở quận nhà
  { id: 'action.craft', group: 'livelihood', slots: 1, stamina: 120, riskPpm: 200, skill: 'crafting', places: ['town', 'city'], career: 'artisan', minRank: 'journeyman' },
  { id: 'action.trap', group: 'livelihood', slots: 1, stamina: 60, riskPpm: 150, skill: 'hunting', places: ['village'], career: 'hunter', minRank: 'apprentice' },
  { id: 'action.buy_land', group: 'livelihood', slots: 1, stamina: 20, riskPpm: 0, places: ['village'] },
  // Lính (S4): ứng tuyển sai dịch ở trị sở quan phủ; sai dịch đi tuần
  { id: 'action.enlist', group: 'livelihood', slots: 1, stamina: 20, riskPpm: 0 },
  // Đi tuần (S9, hướng A): đuổi bắt trộm cướp, rủi ro thân thể cao (S4 là 400 ppm)
  { id: 'action.patrol', group: 'livelihood', slots: 1, stamina: 120, riskPpm: 2_500, skill: 'martial', career: 'soldier' },
  // Lưu lạc, ẩn dật (S6): tự vào nghề — bỏ quê đi lang bạt; dựng lều ở quận có núi rừng
  { id: 'action.drift', group: 'livelihood', slots: 1, stamina: 20, riskPpm: 0 },
  { id: 'action.build_hut', group: 'livelihood', slots: 1, stamina: 200, riskPpm: 300, minStamina: 60 },
  // Thầy thuốc (S5): hành nghề y ở nơi đang đứng, từ bậc làm được; học việc thì theo thầy (xin học việc)
  { id: 'action.practice', group: 'livelihood', slots: 1, stamina: 100, riskPpm: 0, skill: 'medicine', career: 'physician', minRank: 'journeyman' },
  // Thương nhân (S3): đi buôn chuyến (khứ hồi, nhắm vào một quận như di chuyển)
  { id: 'action.haul', group: 'travel', slots: 1, stamina: 100, riskPpm: 300, skill: 'trade', minStamina: 30, career: 'merchant' },
  // Xã giao (v0.5 S4): nhắm vào một người cùng quận (PlanSlot.person)
  { id: 'action.visit', group: 'social', slots: 1, stamina: 30, riskPpm: 0 },
  { id: 'action.ask_help', group: 'social', slots: 1, stamina: 10, riskPpm: 0 },
  // Cưới hỏi (v0.5 S5): sính lễ theo xuất thân nhà trai; bên kia nhận lời theo quan hệ
  { id: 'action.propose', group: 'social', slots: 1, stamina: 30, riskPpm: 0 },
  // Xin học việc, học việc (v0.7 S1, ADR 0020): nhắm vào thầy cùng quận; kỹ năng theo nghề của thầy
  { id: 'action.apprentice', group: 'social', slots: 1, stamina: 150, riskPpm: 200 },
  // Xin vào thương hội (S3): nhờ một hội viên cùng quận bảo lãnh
  { id: 'action.join_guild', group: 'social', slots: 1, stamina: 20, riskPpm: 0 },
  // Tìm cơ duyên (v0.8 S1, ADR 0022 Q3): vào núi sâu (rủi ro cao như săn) hay thăm miếu (không rủi ro); không ra tiền, lương
  { id: 'action.seek', group: 'seek', slots: 1, stamina: 200, riskPpm: SEEK_MOUNTAIN_RISK_PPM, minStamina: 60 },
  // Tông môn (S3): dự kỳ tuyển ở trị sở trong tháng có sứ giả; đệ tử ký danh làm tạp dịch (chép kinh, hái thuốc nộp lên núi)
  { id: 'action.trial', group: 'seek', slots: 1, stamina: 30, riskPpm: 0 },
  { id: 'action.sect_duty', group: 'seek', slots: 1, stamina: 150, riskPpm: 0 },
  { id: 'action.rest', group: 'rest', slots: 1, stamina: 0, riskPpm: 0 },
  { id: 'action.heal', group: 'heal', slots: 1, stamina: 20, riskPpm: 0, places: ['town', 'city'] },
  { id: 'action.travel', group: 'travel', slots: 1, stamina: 100, riskPpm: 300, minStamina: 30 },
  { id: 'action.corvee', group: 'livelihood', slots: 2, stamina: 180, riskPpm: 500, hidden: true },
  // Sự kiện đặt vào (S6): việc gấp (gánh nước, đắp bờ, đuổi châu chấu, đốn củi, gánh lúa), đóng cửa tránh dịch
  { id: 'action.toil', group: 'livelihood', slots: 1, stamina: 180, riskPpm: 300, hidden: true },
  { id: 'action.shelter', group: 'rest', slots: 1, stamina: 0, riskPpm: 0, hidden: true },
  // Sự kiện gia đình đặt vào (v0.5 S5): chăm cha mẹ ốm, lo tang
  { id: 'action.nurse', group: 'livelihood', slots: 2, stamina: 90, riskPpm: 0, hidden: true },
  { id: 'action.mourn', group: 'livelihood', slots: 1, stamina: 60, riskPpm: 0, hidden: true },
];
/** Tra theo id (bảng dựng một lần; vòng NPC gọi nhiều lần mỗi tuần). */
const ACTION_BY_ID: ReadonlyMap<string, ActionDef> = new Map(ACTIONS.map((a) => [a.id, a]));
export const actionDef = (id: string): ActionDef | undefined => ACTION_BY_ID.get(id);
/** Việc nặng: thể lực tốn từ mức "cao" trở lên. */
export const HEAVY_STAMINA = 160;

export const restPlan = (): MonthPlan => ({ slots: [{ action: 'action.rest' }, { action: 'action.rest' }, { action: 'action.rest' }] });

/**
 * `market`: chợ quận đang đứng, để xét khóa tiền; bỏ trống khi chỉ xét luật không phụ thuộc tiền. `career`: thân phận nghề
 * của người chơi (v0.7 S2); NPC chưa có nên việc riêng của nghề luôn khóa với họ.
 */
export function actionLock(def: ActionDef, c: CharacterState, tick: Tick, kind: SettlementKind, market?: CountyEconomy, career: CareerState | null = null): string | null {
  if (ageYearsAt(c.birthTick, tick) < ACTION_MIN_AGE) return 'lock.child';
  if (def.places && !def.places.includes(kind)) return 'lock.place';
  if (def.career && !hasRank(career, def.career, def.minRank ?? 'apprentice')) return 'lock.career';
  if (def.id === 'action.farm' && seasonOf(tick) === 'winter') return 'lock.winter';
  if (def.group !== 'rest' && def.group !== 'heal' && (c.health < 200 || hasSeverity(c, 'grave'))) return 'lock.health';
  if (c.stamina < (def.minStamina ?? 0)) return 'lock.stamina';
  // Đói lả không làm nổi việc nặng (ADR 0013)
  if (isStarving(c.household) && def.stamina >= HEAVY_STAMINA) return 'lock.hunger';
  return market ? moneyLock(def.id, c, market) : null;
}

export function actionOptions(c: CharacterState, tick: Tick, logic: RegionLogic, eco: EconomyState, career: CareerState | null = null): ActionOption[] {
  const kind = logic.settlementKind[c.location]!;
  const market = eco.counties[c.location]!;
  return ACTIONS.filter((d) => !d.hidden).map((d) => ({
    id: d.id, group: d.group, slots: d.slots,
    cost: { stamina: d.stamina === 0 ? 'cost.none' : d.stamina < 80 ? 'cost.low' : d.stamina < HEAVY_STAMINA ? 'cost.medium' : 'cost.high', risk: riskBand(placeRiskPpm(d, logic, c.location)),
      money: moneyCost(d.id) },
    // Xã giao (v0.5) không có cái được chung: thân thiết, cái ăn, gia đình đã ở moneyGains; mua ruộng (S2) chỉ được ruộng, ứng tuyển (S4), bỏ quê, dựng lều (S6) chỉ được nghề
    gains: [...moneyGains(d.id), ...(d.skill ? [`skill.${d.skill}`] : d.group === 'social' || d.group === 'seek' || d.id === 'action.buy_land' || d.id === 'action.enlist' || d.id === 'action.drift' || d.id === 'action.build_hut' ? [] : [d.group === 'rest' ? 'gain.recovery' : d.group === 'heal' ? 'gain.healing' : 'gain.location'])],
    locked: actionLock(d, c, tick, kind, market, career) ?? placeLock(d, logic, c.location),
    // F1: việc riêng của nghề nào; ô nào tính vào năm làm nghề đang làm
    ...(d.career ? { career: d.career } : {}),
    ...(career && CAREER_DEFS[career.id].works.includes(d.id) ? { careerWork: true as const } : {}),
  }));
}

const riskBand = (ppm: number) => (ppm === 0 ? 'risk.none' : ppm < 300 ? 'risk.low' : ppm < 1000 ? 'risk.medium' : 'risk.high');
/** Rủi ro gốc của việc ở nơi này (ppm, chưa nhân mệt, kỹ năng). */
export function placeRiskPpm(d: ActionDef, logic: RegionLogic, county: number): number {
  return d.id === 'action.seek' && !mountainCounty(logic, county) ? 0 : d.riskPpm;
}
/** Khóa theo nơi chốn trên bản đồ (S1): tìm cơ duyên chỉ ở quận có núi hay có miếu. */
function placeLock(d: ActionDef, logic: RegionLogic, county: number): string | null {
  return d.id === 'action.seek' ? seekLock(logic, county) : null;
}

/** Điều kiện thời điểm chạy kiểm lại từng tick; ở đây chỉ chặn lệnh không hợp lệ về ý nghĩa. */
export function validatePlan(plan: MonthPlan, logic: RegionLogic): boolean {
  return plan.slots.every((s) => !!actionDef(s.action) && !actionDef(s.action)!.hidden && (actionDef(s.action)!.group === 'travel'
    ? s.target !== undefined && s.target < logic.counties.length
    : s.target === undefined)
    // Xã giao cần một người; việc khác không nhắm vào ai (v0.5 S4). Chỉ chuyến buôn mới chọn hàng (v0.7 S3b)
    && (actionDef(s.action)!.group === 'social') === (s.person !== undefined)
    && (s.cargo === undefined || s.action === 'action.haul'));
}

export function slotLock(slot: PlanSlot, c: CharacterState, tick: Tick, logic: RegionLogic, market?: CountyEconomy, career: CareerState | null = null): string | null {
  const def = actionDef(slot.action);
  if (!def) return 'lock.action';
  const lock = actionLock(def, c, tick, logic.settlementKind[c.location]!, market, career) ?? placeLock(def, logic, c.location);
  if (lock) return lock;
  if (def.group === 'travel' && (slot.target === undefined || !previewTravel(logic, c.location, slot.target))) return 'lock.route';
  return null;
}
