import { describe, expect, it } from 'vitest';

import { ERAS, eraAt, INITIAL_ERA_INDEX, pickNextEraIndex } from '../../src/config/eras';

describe('eras', () => {
  it('starts in 1985', () => {
    expect(eraAt(INITIAL_ERA_INDEX).name).toBe('1985');
  });

  it('rejects unknown indexes', () => {
    expect(() => eraAt(ERAS.length)).toThrow(RangeError);
  });

  it('defines a complete palette for every era', () => {
    for (const era of ERAS) {
      expect(era.sun).toHaveLength(3);
      for (const hex of [era.fog, era.grid, era.acc, era.bld]) {
        expect(hex).toBeGreaterThanOrEqual(0);
        expect(hex).toBeLessThanOrEqual(0xffffff);
      }
    }
  });
});

describe('pickNextEraIndex', () => {
  it('never returns the current era, for any random draw', () => {
    for (let current = 0; current < ERAS.length; current++) {
      for (const draw of [0, 0.2, 0.5, 0.75, 0.999999, 1]) {
        const next = pickNextEraIndex(current, () => draw);
        expect(next).not.toBe(current);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThan(ERAS.length);
      }
    }
  });

  it('can reach every other era from any era', () => {
    for (let current = 0; current < ERAS.length; current++) {
      const reached = new Set<number>();
      for (let k = 0; k < ERAS.length - 1; k++) {
        reached.add(pickNextEraIndex(current, () => k / (ERAS.length - 1)));
      }
      expect(reached.size).toBe(ERAS.length - 1);
    }
  });

  it('uses Math.random by default', () => {
    expect(pickNextEraIndex(0)).not.toBe(0);
  });
});
