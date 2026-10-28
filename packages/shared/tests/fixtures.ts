import {
  birthplaceId, regionId,
  type ActionOption, type Birthplace, type CharacterView, type HouseholdView, type LifeSummary, type LogEntry, type MarketView, type MonthPlan, type NpcView, type PendingEvent,
  type RegionMapData, type RegionSummary, type SaveFile,
} from '../src/index';

export function sampleMap(W = 4, H = 3): RegionMapData {
  const n = W * H;
  const water = new Float32Array(n).fill(Number.NaN);
  water[0] = 0;
  return {
    W, H,
    origin: { x: 100, y: 200 },
    kmPerCell: 5.859375,
    elevation: Float32Array.from({ length: n }, (_, i) => i * 0.125 - 0.1),
    water,
    coastDist: new Float32Array(n).fill(2.5),
    flow: new Float32Array(n),
    temperature: new Float32Array(n).fill(14.2),
    biome: new Uint8Array(n).fill(5),
    mask: new Uint8Array(n).fill(1),
    county: new Int16Array(n).fill(-1),
    counties: [{ name: 'Vị Kinh', nameHan: '渭京', seat: { x: 1, y: 1 } }],
    rivers: [{ points: new Float32Array([0.5, 0.5, 1.5, 2.25]), flow: new Float32Array([1, 2]) }],
    roads: [{ kind: 'major', pts: [0, 0, 3, 2] }],
    labels: [{ kind: 'range', name: 'Thanh Sơn', x: 2.5, y: 1, angle: 0.3, weight: 3, span: 4 }],
  };
}

export const sampleSummary: RegionSummary = {
  id: regionId('r1'),
  name: 'Vị Kinh',
  nameHan: '渭京',
  realmName: 'Đại Tần',
  kmPerCell: 5.859375,
  landKm2: 40787,
};

export const sampleBirthplace: Birthplace = {
  id: birthplaceId('r1/c3'),
  name: 'Vị Kinh',
  nameHan: '渭京',
  kind: 'city',
  cell: { x: 1, y: 1 },
  county: 0,
};

export const sampleHousehold: HouseholdView = {
  independent: true, money: 320, grain: 140, landMu: 6, tenure: 'owner', hungerBand: 'fed', foodWeeksBand: 'season', grainWeeks: 14, foodWeeks: 14,
};

export const sampleMarket: MarketView = { county: 0, buyPrice: 46, sellPrice: 34, supply: 'normal', trend: 'rising', maxBuy: 5000, maxSell: 800 };

export const samplePending: PendingEvent = {
  instance: 4,
  eventId: 'event.tax_collector',
  variant: 'winter',
  params: { amount: 200 },
  choices: [
    { id: 'pay', costs: ['money'], locked: 'lock.money' },
    { id: 'corvee', costs: ['time', 'stamina'], locked: null },
    { id: 'flee', costs: ['risk', 'opportunity'], locked: null },
  ],
  figure: { gender: 'male', ageBand: 'adult', class: 'official' },
};

export const sampleCharacter: CharacterView = {
  name: 'Trần Văn An',
  gender: 'male',
  birthTick: 0,
  ageYears: 12,
  birthplaceId: birthplaceId('r1/c3'),
  background: 'background.peasant',
  personality: 'personality.calm',
  constitution: 'constitution.sturdy',
  aptitude: 'aptitude.average',
  traits: [],
  healthPct: 85,
  healthBand: 'healthy',
  conditions: [{ id: 'illness.cold', severity: 'mild' }],
  alive: true,
  location: 0,
  home: 0,
  staminaBand: 'tired',
  skills: [{ id: 'skill.farming', rank: 'rank.novice' }],
  canAct: true,
  household: sampleHousehold,
  reputation: 'unknown',
};

export const sampleNpc: NpcView = {
  id: 'n1', name: 'Lý Thị Hoa', gender: 'female', ageYears: 34, occupation: 'occupation.farmer', healthBand: 'healthy',
  portrait: { ageBand: 'adult', class: 'common', key: 'n1' },
};

export const samplePlan: MonthPlan = { slots: [{ action: 'action.farm' }, { action: 'action.travel', target: 2 }, { action: 'action.rest' }] };

export const sampleOption: ActionOption = {
  id: 'action.farm', group: 'livelihood', slots: 1,
  cost: { stamina: 'cost.high', risk: 'risk.low', money: 'cost.none' }, gains: ['skill.farming'], locked: null,
};

export const sampleLog: LogEntry = { tick: 3, key: 'log.illness.onset', params: { illness: 'illness.cold', age: 0 }, importance: 'minor' };

export const sampleLife: LifeSummary = {
  config: { worldSeed: 'tsvl-01', regionId: regionId('r1'), birthplaceId: birthplaceId('r1/c3'), lifeSeed: 7 },
  name: 'Trần Văn An',
  birthTick: 0,
  deathTick: 2200,
  ageYears: 61,
  cause: 'illness',
  causeDetail: 'illness.consumption',
  birthplaceId: birthplaceId('r1/c3'),
  milestones: [{ ...sampleLog, importance: 'major' }],
  estate: { money: 1200, grain: 340, landMu: 6, tenure: 'owner' },
  hungerYears: 3,
  legacy: { spouse: { name: 'Lý Thị Hoa', alive: false }, children: [{ name: 'Trần Văn Bình', alive: true }], friends: 2, enemies: 1, reputation: 'respected', factions: [{ name: { key: 'faction.clan.name', params: { surname: 'Lương', place: 'Vị Kinh' } }, kind: 'clan', fate: 'rose' }] },
  digest: '0123456789abcdef',
};

export function sampleSave(): SaveFile {
  return {
    format: 'tsvl-save',
    version: 6,
    protocolVersion: 6,
    simVersion: '0.1.0',
    worldSeed: 'tsvl-01',
    region: { summary: sampleSummary, map: sampleMap(), birthplaces: [sampleBirthplace], logic: { adjacency: [[0, 1]] } },
    sim: { tick: 3, rng: { health: [1, 2, 3, 4] } },
    log: [sampleLog],
    commandLog: [
      { seq: 0, tick: 0, cmd: { type: 'NEW_LIFE', config: { worldSeed: 'tsvl-01', regionId: regionId('r1'), birthplaceId: birthplaceId('r1/c3') } } },
      { seq: 1, tick: 5, cmd: { type: 'SET_PLAN', plan: samplePlan } },
      { seq: 2, tick: 5, cmd: { type: 'ADVANCE', mode: 'year' } },
      { seq: 3, tick: 41, cmd: { type: 'TRADE', grain: -50 } },
      { seq: 4, tick: 41, cmd: { type: 'CHOOSE', instance: 4, choice: 'corvee' } },
    ],
    digest: '0123456789abcdef',
  };
}
