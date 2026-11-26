import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  browserAudioContextFactory,
  ENGINE_LEVEL,
  MASTER_LEVEL,
  type Sfx,
  STEP_MS,
  SynthAudio,
} from '../../src/audio/synth';
import { FakeAudioContext } from './fake-audio';

// build() creates master, engine and hover gains in that order.
const MASTER = 0;
const ENGINE = 1;
const HOVER = 2;

function setup(mood = { combo: 1, overdrive: false }) {
  const ctx = new FakeAudioContext();
  const factory = vi.fn(() => ctx.asAudioContext());
  const audio = new SynthAudio(factory, () => mood);
  const gain = (i: number) => ctx.gains[i]?.gain.value;
  return { ctx, factory, audio, gain, mood };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('SynthAudio lifecycle', () => {
  it('creates the audio graph once, on the first gesture', () => {
    const { audio, factory } = setup();
    expect(audio.ready).toBe(false);
    audio.unlock();
    audio.unlock();
    audio.startRun();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(audio.ready).toBe(true);
  });

  it('resumes a suspended context', () => {
    const { audio, ctx } = setup();
    audio.unlock();
    ctx.state = 'suspended';
    audio.unlock();
    expect(ctx.resumeCalls).toBe(1);
  });

  it('restores the engine voice on every new run after a game over', () => {
    const { audio, gain } = setup();
    audio.startRun();
    expect(gain(ENGINE)).toBe(ENGINE_LEVEL);
    audio.endRun();
    expect(gain(ENGINE)).toBe(0);
    expect(audio.playingMusic).toBe(false);
    audio.startRun();
    expect(gain(ENGINE)).toBe(ENGINE_LEVEL);
    expect(audio.playingMusic).toBe(true);
  });

  it('silences the engine and hover while paused and restores the engine on resume', () => {
    const { audio, gain } = setup();
    audio.startRun();
    audio.play('jump');
    expect(gain(HOVER)).toBeGreaterThan(0);
    audio.pause();
    expect([gain(ENGINE), gain(HOVER)]).toEqual([0, 0]);
    audio.resume();
    expect(gain(ENGINE)).toBe(ENGINE_LEVEL);
  });

  it('restarting from pause keeps exactly one music clock running', () => {
    const { audio, ctx } = setup();
    audio.startRun();
    audio.pause();
    audio.startRun();
    const before = ctx.oscillators.length;
    vi.advanceTimersByTime(STEP_MS);
    expect(ctx.oscillators.length - before).toBe(2); // kick + bass on step 0
  });

  it('does nothing when the browser has no Web Audio support', () => {
    const audio = new SynthAudio(
      () => null,
      () => ({ combo: 1, overdrive: false }),
    );
    expect(() => {
      audio.startRun();
      audio.play('crash');
      audio.setEngine(3, true);
      audio.pause();
      audio.resume();
      audio.endRun();
    }).not.toThrow();
    expect(audio.ready).toBe(false);
  });
});

describe('SynthAudio mute', () => {
  it('toggles the master bus and suppresses effects', () => {
    const { audio, ctx, gain } = setup();
    audio.startRun();
    expect(audio.toggleMute()).toBe(true);
    expect(audio.muted).toBe(true);
    expect(gain(MASTER)).toBe(0);
    const before = ctx.oscillators.length;
    audio.play('coin');
    expect(ctx.oscillators.length).toBe(before);
    expect(audio.toggleMute()).toBe(false);
    expect(gain(MASTER)).toBe(MASTER_LEVEL);
  });

  it('applies a mute chosen before the first gesture', () => {
    const { audio, gain } = setup();
    audio.toggleMute();
    audio.startRun();
    expect(gain(MASTER)).toBe(0);
  });
});

describe('SynthAudio effects', () => {
  it.each<Sfx>(['coin', 'nearmiss', 'shield', 'jump', 'land', 'time_travel'])('plays %s as a one-shot voice', (sfx) => {
    const { audio, ctx } = setup();
    audio.startRun();
    const before = ctx.oscillators.length;
    audio.play(sfx, 3);
    const voice = ctx.oscillators.at(-1);
    expect(ctx.oscillators.length).toBe(before + 1);
    expect(voice?.started).toBe(1);
    expect(voice?.stopped).toBe(1);
  });

  it('plays the crash from a pre-rendered noise buffer', () => {
    const { audio, ctx } = setup();
    audio.startRun();
    audio.play('crash');
    audio.play('crash');
    const [a, b] = ctx.bufferSources.slice(-2);
    expect(a?.buffer).toBeTruthy();
    expect(a?.buffer).toBe(b?.buffer);
  });

  it('landing releases the hover hum', () => {
    const { audio, gain } = setup();
    audio.startRun();
    audio.play('jump');
    audio.play('land');
    expect(gain(HOVER)).toBe(0);
  });

  it('stays silent while the context is not running', () => {
    const { audio, ctx } = setup();
    audio.startRun();
    ctx.state = 'suspended';
    const before = ctx.oscillators.length;
    audio.play('coin');
    vi.advanceTimersByTime(STEP_MS * 4);
    expect(ctx.oscillators.length).toBe(before);
  });

  it('tracks engine pitch to speed and hover', () => {
    const { audio, ctx } = setup();
    audio.startRun();
    audio.setEngine(2, false);
    const engine = ctx.oscillators[0];
    expect(engine?.frequency.value).toBe(60 + 2 * 14);
    audio.setEngine(2, true);
    expect(engine?.frequency.value).toBe(60 + 2 * 14 + 75);
  });
});

describe('SynthAudio music', () => {
  it('sequences kick, snare, hats and bass over a bar', () => {
    const { audio, ctx } = setup();
    audio.startRun();
    const osc = ctx.oscillators.length;
    const buf = ctx.bufferSources.length;
    vi.advanceTimersByTime(STEP_MS * 8);
    // 8 bass notes + 2 kicks; 1 snare + 4 hats.
    expect(ctx.oscillators.length - osc).toBe(10);
    expect(ctx.bufferSources.length - buf).toBe(5);
  });

  it('adds the arpeggio with a combo and in overdrive', () => {
    const mood = { combo: 2, overdrive: false };
    const { audio, ctx } = setup(mood);
    audio.startRun();
    let osc = ctx.oscillators.length;
    vi.advanceTimersByTime(STEP_MS * 8);
    expect(ctx.oscillators.length - osc).toBe(18);
    mood.combo = 1;
    mood.overdrive = true;
    osc = ctx.oscillators.length;
    vi.advanceTimersByTime(STEP_MS * 64);
    expect(ctx.oscillators.length - osc).toBe(64 * 2 + 16);
  });

  it('holds the beat while paused', () => {
    const { audio, ctx } = setup();
    audio.startRun();
    audio.pause();
    const before = ctx.oscillators.length;
    vi.advanceTimersByTime(STEP_MS * 8);
    expect(ctx.oscillators.length).toBe(before);
  });
});

describe('browserAudioContextFactory', () => {
  it('uses the standard AudioContext constructor', () => {
    const ctx = new FakeAudioContext();
    vi.stubGlobal('window', {
      AudioContext: vi.fn(function AudioContext() {
        return ctx;
      }),
    });
    expect(browserAudioContextFactory()()).toBe(ctx);
  });

  it('falls back to the prefixed Safari constructor', () => {
    const ctx = new FakeAudioContext();
    vi.stubGlobal('window', {
      webkitAudioContext: vi.fn(function AudioContext() {
        return ctx;
      }),
    });
    expect(browserAudioContextFactory()()).toBe(ctx);
  });

  it('returns null without Web Audio or when construction fails', () => {
    vi.stubGlobal('window', {});
    expect(browserAudioContextFactory()()).toBeNull();
    vi.stubGlobal('window', {
      AudioContext: vi.fn(() => {
        throw new Error('NotAllowedError');
      }),
    });
    expect(browserAudioContextFactory()()).toBeNull();
  });
});
