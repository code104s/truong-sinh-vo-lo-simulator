// Lõi mô phỏng thuần (GDD 3.2 B). Không import React, DOM, Worker, IndexedDB, fs.
export { Rng, RngStreams, type RngState, type RngStreamsSnapshot } from './core/rng';
export { hash32, hashString, hash64Hex } from './core/hash';
export { canonical, digestOf } from './core/digest';
export { idiv, mulDiv, clamp, lerpTable, sortedEntries } from './core/math';
export { Life, SIM_VERSION, lifeRoot, type LifeSnapshot, type AdvanceResult } from './life/life';
export { toView, type CharacterState } from './life/character';
export type { Death } from './life/health';
export { SimHost, replaySave, type Emit, type HostOptions } from './host';
