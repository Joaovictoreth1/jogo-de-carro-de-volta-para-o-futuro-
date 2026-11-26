export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const HIGH_SCORE_KEY = 'sunset_delorean_highscore';

export function resolveStorage(getStorage: () => KeyValueStore | null | undefined): KeyValueStore | null {
  try {
    return getStorage() ?? null;
  } catch {
    return null;
  }
}

export class HighScoreStore {
  private best: number;

  constructor(private readonly storage: KeyValueStore | null) {
    this.best = this.read();
  }

  get value(): number {
    return this.best;
  }

  submit(score: number): boolean {
    const candidate = Math.floor(score);
    if (!Number.isFinite(candidate) || candidate <= this.best) return false;
    this.best = candidate;
    try {
      this.storage?.setItem(HIGH_SCORE_KEY, candidate.toString());
    } catch {
      // Quota exceeded or storage revoked: keep the in-memory record.
    }
    return true;
  }

  private read(): number {
    try {
      const parsed = Number.parseInt(this.storage?.getItem(HIGH_SCORE_KEY) ?? '0', 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch {
      return 0;
    }
  }
}
