import { describe, expect, it } from 'vitest';

import { HIGH_SCORE_KEY, HighScoreStore, type KeyValueStore, resolveStorage } from '../../src/core/storage';

class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const throwing: KeyValueStore = {
  getItem: () => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  },
  setItem: () => {
    throw new DOMException('Quota exceeded', 'QuotaExceededError');
  },
};

describe('resolveStorage', () => {
  it('returns the storage when it is accessible', () => {
    const store = new MemoryStore();
    expect(resolveStorage(() => store)).toBe(store);
  });

  it('returns null when reading window.localStorage throws (blocked cookies, sandboxed iframes)', () => {
    expect(
      resolveStorage(() => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      }),
    ).toBeNull();
  });

  it('returns null when storage is missing', () => {
    expect(resolveStorage(() => undefined)).toBeNull();
  });
});

describe('HighScoreStore', () => {
  it('loads the saved record', () => {
    const store = new MemoryStore();
    store.setItem(HIGH_SCORE_KEY, '4200');
    expect(new HighScoreStore(store).value).toBe(4200);
  });

  it.each(['abc', '-50', '', 'NaN'])('treats a corrupt record %j as zero', (raw) => {
    const store = new MemoryStore();
    store.setItem(HIGH_SCORE_KEY, raw);
    expect(new HighScoreStore(store).value).toBe(0);
  });

  it('persists only new records', () => {
    const store = new MemoryStore();
    const scores = new HighScoreStore(store);
    expect(scores.submit(150.7)).toBe(true);
    expect(scores.value).toBe(150);
    expect(store.getItem(HIGH_SCORE_KEY)).toBe('150');
    expect(scores.submit(150)).toBe(false);
    expect(scores.submit(Number.NaN)).toBe(false);
    expect(scores.submit(Number.POSITIVE_INFINITY)).toBe(false);
    expect(store.getItem(HIGH_SCORE_KEY)).toBe('150');
  });

  it('keeps working in memory without storage', () => {
    const scores = new HighScoreStore(null);
    expect(scores.value).toBe(0);
    expect(scores.submit(99)).toBe(true);
    expect(scores.value).toBe(99);
  });

  it('survives storage that throws on read and write', () => {
    const scores = new HighScoreStore(throwing);
    expect(scores.value).toBe(0);
    expect(scores.submit(10)).toBe(true);
    expect(scores.value).toBe(10);
  });
});
