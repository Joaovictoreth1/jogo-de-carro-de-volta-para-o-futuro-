export type Direction = 'left' | 'right';

export type KeyAction =
  | { kind: 'steer'; direction: Direction }
  | { kind: 'jump' }
  | { kind: 'overdrive' }
  | { kind: 'pause' }
  | { kind: 'mute' };

const STEER_KEYS: Readonly<Record<string, Direction>> = {
  ArrowLeft: 'left',
  a: 'left',
  A: 'left',
  ArrowRight: 'right',
  d: 'right',
  D: 'right',
};

const JUMP_KEYS = new Set([' ', 'ArrowUp', 'w', 'W']);
const OVERDRIVE_KEYS = new Set(['Shift', 'e', 'E']);
const PAUSE_KEYS = new Set(['p', 'P', 'Escape']);
const MUTE_KEYS = new Set(['m', 'M']);

export function keyToAction(key: string): KeyAction | null {
  const direction = STEER_KEYS[key];
  if (direction) return { kind: 'steer', direction };
  if (JUMP_KEYS.has(key)) return { kind: 'jump' };
  if (OVERDRIVE_KEYS.has(key)) return { kind: 'overdrive' };
  if (PAUSE_KEYS.has(key)) return { kind: 'pause' };
  if (MUTE_KEYS.has(key)) return { kind: 'mute' };
  return null;
}

export type SwipeGesture = 'jump' | 'overdrive' | null;

export const SWIPE_THRESHOLD_PX = 45;

export function classifySwipe(dx: number, dy: number): SwipeGesture {
  if (Math.abs(dy) <= Math.abs(dx) || Math.abs(dy) <= SWIPE_THRESHOLD_PX) return null;
  return dy < 0 ? 'jump' : 'overdrive';
}

/**
 * Tracks which steering sources are held so that releasing one source
 * (a key, a touch button) never cancels another, and every source can be
 * dropped at once when the page loses focus or a touch is cancelled.
 */
export class SteeringState {
  private readonly held: Record<Direction, Set<string>> = { left: new Set(), right: new Set() };

  press(direction: Direction, source: string): void {
    this.held[direction].add(source);
  }

  release(direction: Direction, source: string): void {
    this.held[direction].delete(source);
  }

  releaseSource(source: string): void {
    this.held.left.delete(source);
    this.held.right.delete(source);
  }

  reset(): void {
    this.held.left.clear();
    this.held.right.clear();
  }

  get left(): boolean {
    return this.held.left.size > 0;
  }

  get right(): boolean {
    return this.held.right.size > 0;
  }
}
