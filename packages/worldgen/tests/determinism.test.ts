import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, generateWorld, type World } from '../src/index';

const params = { ...DEFAULT_PARAMS, seed: 'tsvl-01', width: 128, height: 96 };

function digest(w: World): string {
  const h = createHash('sha256');
  for (const a of [w.elevation, w.water, w.temperature, w.precipitation, w.flow, w.biome, w.realm]) {
    h.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  }
  h.update(JSON.stringify([w.worldName, w.worldNameZh, w.rivers.length, w.labels.map((l) => l.name), w.realms.length, w.roads.length]));
  return h.digest('hex');
}

describe('worldgen (Cartographer snapshot)', () => {
  it('same seed gives the same world', () => {
    expect(digest(generateWorld(params))).toBe(digest(generateWorld(params)));
  });

  it('different seeds give different worlds', () => {
    expect(digest(generateWorld({ ...params, seed: 'tsvl-02' }))).not.toBe(digest(generateWorld(params)));
  });

  it('has land, rivers, realms and roads', () => {
    const w = generateWorld(params);
    expect(w.stats.land).toBeGreaterThan(0.1);
    expect(w.rivers.length).toBeGreaterThan(0);
    expect(w.realms.length).toBeGreaterThan(0);
    expect(w.roads.length).toBeGreaterThan(0);
  });

  it('matches the pinned digest (detects drift from the upstream snapshot or the engine)', () => {
    expect(digest(generateWorld(params))).toBe('cf97a4f1c54e3912b63e5250560e0276fffb119bf9ed775391e525eb858546cf');
  });
});
