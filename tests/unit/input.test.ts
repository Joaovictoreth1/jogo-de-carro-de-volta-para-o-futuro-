import { describe, expect, it } from 'vitest';

import { classifySwipe, keyToAction, SteeringState, SWIPE_THRESHOLD_PX } from '../../src/core/input';

describe('keyToAction', () => {
  it.each([
    ['ArrowLeft', { kind: 'steer', direction: 'left' }],
    ['a', { kind: 'steer', direction: 'left' }],
    ['A', { kind: 'steer', direction: 'left' }],
    ['ArrowRight', { kind: 'steer', direction: 'right' }],
    ['d', { kind: 'steer', direction: 'right' }],
    ['D', { kind: 'steer', direction: 'right' }],
    [' ', { kind: 'jump' }],
    ['ArrowUp', { kind: 'jump' }],
    ['w', { kind: 'jump' }],
    ['W', { kind: 'jump' }],
    ['Shift', { kind: 'overdrive' }],
    ['e', { kind: 'overdrive' }],
    ['E', { kind: 'overdrive' }],
    ['p', { kind: 'pause' }],
    ['P', { kind: 'pause' }],
    ['Escape', { kind: 'pause' }],
    ['m', { kind: 'mute' }],
    ['M', { kind: 'mute' }],
  ])('maps %j', (key, action) => {
    expect(keyToAction(key)).toEqual(action);
  });

  it('ignores unrelated keys', () => {
    expect(keyToAction('Tab')).toBeNull();
    expect(keyToAction('Enter')).toBeNull();
  });
});

describe('classifySwipe', () => {
  const t = SWIPE_THRESHOLD_PX;

  it('treats a fast upward swipe as a jump', () => {
    expect(classifySwipe(0, -(t + 1))).toBe('jump');
  });

  it('treats a downward swipe as overdrive', () => {
    expect(classifySwipe(10, t + 1)).toBe('overdrive');
  });

  it('ignores taps, short drags and mostly horizontal swipes', () => {
    expect(classifySwipe(0, 0)).toBeNull();
    expect(classifySwipe(0, -t)).toBeNull();
    expect(classifySwipe(200, -100)).toBeNull();
  });
});

describe('SteeringState', () => {
  it('steers while any source holds a direction', () => {
    const s = new SteeringState();
    s.press('left', 'key:a');
    s.press('left', 'touch:left');
    s.release('left', 'key:a');
    expect(s.left).toBe(true);
    s.release('left', 'touch:left');
    expect(s.left).toBe(false);
  });

  it('can hold both directions independently', () => {
    const s = new SteeringState();
    s.press('left', 'key:a');
    s.press('right', 'key:d');
    expect([s.left, s.right]).toEqual([true, true]);
    s.releaseSource('key:a');
    expect([s.left, s.right]).toEqual([false, true]);
  });

  it('drops every held source on reset (window blur, touchcancel, pause)', () => {
    const s = new SteeringState();
    s.press('left', 'key:arrowleft');
    s.press('right', 'touch:right');
    s.reset();
    expect([s.left, s.right]).toEqual([false, false]);
  });
});
