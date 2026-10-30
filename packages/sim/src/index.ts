// Lõi mô phỏng thuần (GDD 3.2 B). Không import React, DOM, Worker, IndexedDB, fs.
export { Rng, RngStreams, type RngState, type RngStreamsSnapshot } from './core/rng';
export { hash32, hashString, hash64Hex } from './core/hash';
export { canonical, digestOf } from './core/digest';
export { idiv, mulDiv, clamp, lerpTable, sortedEntries } from './core/math';
export { Life, SIM_VERSION, STREAMS, firstOpenChoice, lifeRoot, type LifeSnapshot, type AdvanceResult } from './life/life';
export { toView, type CharacterState } from './life/character';
export { mountainCounty } from './life/wayward';
export { rootBand } from './life/cultivation';
export { MERCHANT_LIVING_CAPITAL } from './npc/phase';
export { BACKGROUNDS, type Background } from './life/params';
export { CAREER_EVENT_IDS, CAREER_EVENTS_OF, CULTIVATION_EVENT_IDS, EVENT_IDS } from './events/catalog';
export type { Death } from './life/health';
export { simulateEconomy, type EconomyRunStats } from './economy/simulate';
export { simulateWorld, type WorldRunStats } from './npc/world';
export { HANDLED_LIMIT, SimHost, replaySave, type Emit, type HostOptions } from './host';
export { earnPlan, needsPlan, foodWeeks, GRAIN_RESERVE, MONEY_RESERVE, SELL_ABOVE, SURVIVAL_WEEKS, tradeDecision, weakPlan, workChoice, type BrainInput, type WorkChoice } from './npc/brain';
