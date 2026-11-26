export type Sfx = 'coin' | 'nearmiss' | 'shield' | 'jump' | 'land' | 'time_travel' | 'crash';

export interface MusicMood {
  combo: number;
  overdrive: boolean;
}

export type AudioContextFactory = () => AudioContext | null;

interface Voice {
  ctx: AudioContext;
  bus: DynamicsCompressorNode;
  master: GainNode;
  engineOsc: OscillatorNode;
  engineGain: GainNode;
  hoverOsc: OscillatorNode;
  hoverGain: GainNode;
  noise: Record<'snare' | 'hat' | 'crash', AudioBuffer>;
}

export const MASTER_LEVEL = 0.75;
export const ENGINE_LEVEL = 0.14;
export const STEP_MS = 125;

const BASS_NOTES = [110.0, 110.0, 87.31, 87.31, 130.81, 130.81, 98.0, 98.0] as const;
const ARP_SCALE = [220.0, 261.63, 329.63, 392.0, 440.0, 523.25, 659.25] as const;
const STEPS_PER_LOOP = 64;

export function browserAudioContextFactory(): AudioContextFactory {
  return () => {
    const legacy = window as Window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = 'AudioContext' in window ? window.AudioContext : legacy.webkitAudioContext;
    if (!Ctor) return null;
    try {
      return new Ctor();
    } catch {
      return null;
    }
  };
}

function noiseBuffer(ctx: AudioContext, seconds: number, decay: number | null): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const envelope = decay === null ? 1 : Math.exp(-i / (ctx.sampleRate * decay));
    data[i] = (Math.random() * 2 - 1) * envelope;
  }
  return buffer;
}

/**
 * Procedural synthwave soundtrack and effects. The audio graph is created
 * lazily on the first user gesture (browser autoplay policy) and reused for
 * every run; each run explicitly restores the engine and hover voices.
 */
export class SynthAudio {
  private voice: Voice | null = null;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicActive = false;
  private step = 0;
  private isMuted = false;

  constructor(
    private readonly createContext: AudioContextFactory,
    private readonly mood: () => MusicMood,
  ) {}

  get muted(): boolean {
    return this.isMuted;
  }

  get ready(): boolean {
    return this.voice !== null;
  }

  get playingMusic(): boolean {
    return this.musicTimer !== null;
  }

  /** Must be called from a user gesture so the browser allows playback. */
  unlock(): void {
    this.voice ??= this.build();
    const ctx = this.voice?.ctx;
    if (ctx?.state === 'suspended') {
      ctx.resume().catch(() => undefined);
    }
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    const v = this.voice;
    if (v) v.master.gain.setTargetAtTime(this.isMuted ? 0 : MASTER_LEVEL, v.ctx.currentTime, 0.05);
    return this.isMuted;
  }

  startRun(): void {
    this.unlock();
    this.setEngineLevel(ENGINE_LEVEL);
    this.setHoverLevel(0);
    this.stopMusic();
    this.step = 0;
    this.musicActive = true;
    this.musicTimer = setInterval(() => {
      this.tick();
    }, STEP_MS);
  }

  pause(): void {
    this.musicActive = false;
    this.setEngineLevel(0);
    this.setHoverLevel(0);
  }

  resume(): void {
    this.musicActive = true;
    this.setEngineLevel(ENGINE_LEVEL);
  }

  endRun(): void {
    this.stopMusic();
    this.setEngineLevel(0);
    this.setHoverLevel(0);
  }

  setEngine(speed: number, hovering: boolean): void {
    const v = this.voice;
    if (!v) return;
    v.engineOsc.frequency.setTargetAtTime(60 + speed * 14 + (hovering ? 75 : 0), v.ctx.currentTime, 0.08);
  }

  play(type: Sfx, combo = 1): void {
    const v = this.voice;
    if (v?.ctx.state !== 'running' || this.isMuted) return;
    const { ctx, bus } = v;
    const t = ctx.currentTime;

    if (type === 'crash') {
      const noise = ctx.createBufferSource();
      noise.buffer = v.noise.crash;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200, t);
      filter.frequency.exponentialRampToValueAtTime(40, t + 0.9);
      noise.connect(filter);
      filter.connect(bus);
      noise.start(t);
      return;
    }

    if (type === 'land') this.setHoverLevel(0, 0.04);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(bus);
    const f = osc.frequency;
    let duration: number;

    switch (type) {
      case 'coin': {
        const base = 750 + Math.min(combo * 90, 1200);
        osc.type = 'triangle';
        f.setValueAtTime(base, t);
        f.exponentialRampToValueAtTime(base * 1.5, t + 0.12);
        gain.gain.setValueAtTime(0.28, t);
        duration = 0.25;
        break;
      }
      case 'nearmiss':
        osc.type = 'sine';
        f.setValueAtTime(520, t);
        f.exponentialRampToValueAtTime(1180, t + 0.14);
        gain.gain.setValueAtTime(0.22, t);
        duration = 0.18;
        break;
      case 'shield':
        osc.type = 'sine';
        f.setValueAtTime(440, t);
        f.setValueAtTime(660, t + 0.08);
        f.setValueAtTime(880, t + 0.16);
        gain.gain.setValueAtTime(0.26, t);
        duration = 0.35;
        break;
      case 'jump':
        osc.type = 'sawtooth';
        f.setValueAtTime(140, t);
        f.exponentialRampToValueAtTime(420, t + 0.28);
        gain.gain.setValueAtTime(0.22, t);
        duration = 0.3;
        v.hoverOsc.frequency.setValueAtTime(260, t);
        v.hoverOsc.frequency.linearRampToValueAtTime(170, t + 0.45);
        this.setHoverLevel(0.22);
        break;
      case 'land':
        osc.type = 'sine';
        f.setValueAtTime(95, t);
        f.exponentialRampToValueAtTime(35, t + 0.15);
        gain.gain.setValueAtTime(0.3, t);
        duration = 0.15;
        break;
      case 'time_travel':
        osc.type = 'sawtooth';
        f.setValueAtTime(60, t);
        f.exponentialRampToValueAtTime(2800, t + 0.7);
        gain.gain.setValueAtTime(0.65, t);
        duration = 1.8;
        break;
    }

    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.start(t);
    osc.stop(t + duration);
  }

  private stopMusic(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    this.musicActive = false;
  }

  private setEngineLevel(level: number): void {
    const v = this.voice;
    if (v) v.engineGain.gain.setTargetAtTime(level, v.ctx.currentTime, 0.05);
  }

  private setHoverLevel(level: number, timeConstant = 0.05): void {
    const v = this.voice;
    if (v) v.hoverGain.gain.setTargetAtTime(level, v.ctx.currentTime, timeConstant);
  }

  private build(): Voice | null {
    const ctx = this.createContext();
    if (!ctx) return null;

    const master = ctx.createGain();
    master.gain.value = this.isMuted ? 0 : MASTER_LEVEL;
    const bus = ctx.createDynamicsCompressor();
    bus.threshold.value = -14;
    bus.knee.value = 20;
    bus.ratio.value = 6;
    bus.connect(master);
    master.connect(ctx.destination);

    const engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 65;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 220;
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(bus);
    engineOsc.start();

    const hoverOsc = ctx.createOscillator();
    hoverOsc.type = 'sine';
    hoverOsc.frequency.value = 180;
    const hoverGain = ctx.createGain();
    hoverGain.gain.value = 0;
    hoverOsc.connect(hoverGain);
    hoverGain.connect(bus);
    hoverOsc.start();

    return {
      ctx,
      bus,
      master,
      engineOsc,
      engineGain,
      hoverOsc,
      hoverGain,
      noise: {
        snare: noiseBuffer(ctx, 0.16, 0.06),
        hat: noiseBuffer(ctx, 0.04, null),
        crash: noiseBuffer(ctx, 0.9, 0.18),
      },
    };
  }

  private tick(): void {
    const v = this.voice;
    if (!this.musicActive || v?.ctx.state !== 'running') return;
    const { ctx, bus } = v;
    const t = ctx.currentTime;
    const step = this.step;
    const { combo, overdrive } = this.mood();

    if (step % 4 === 0) {
      const kick = ctx.createOscillator();
      const kickGain = ctx.createGain();
      kick.type = 'sine';
      kick.frequency.setValueAtTime(125, t);
      kick.frequency.exponentialRampToValueAtTime(32, t + 0.18);
      kickGain.gain.setValueAtTime(0.65, t);
      kickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      kick.connect(kickGain);
      kickGain.connect(bus);
      kick.start(t);
      kick.stop(t + 0.22);
    }

    if (step % 8 === 4) {
      const snare = ctx.createBufferSource();
      snare.buffer = v.noise.snare;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1400;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.32, t);
      snare.connect(filter);
      filter.connect(gain);
      gain.connect(bus);
      snare.start(t);
    }

    if (step % 2 === 1) {
      const hat = ctx.createBufferSource();
      hat.buffer = v.noise.hat;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 8000;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.07, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      hat.connect(filter);
      filter.connect(gain);
      gain.connect(bus);
      hat.start(t);
    }

    const bass = ctx.createOscillator();
    const bassFilter = ctx.createBiquadFilter();
    const bassGain = ctx.createGain();
    bass.type = 'sawtooth';
    const note = BASS_NOTES[Math.floor(step / 8) % BASS_NOTES.length] ?? BASS_NOTES[0];
    bass.frequency.value = note * (step % 2 === 0 ? 0.5 : 1.0) * (overdrive ? 1.25 : 1.0);
    bassFilter.type = 'lowpass';
    bassFilter.frequency.setValueAtTime(overdrive ? 2200 : 950, t);
    bassFilter.frequency.exponentialRampToValueAtTime(120, t + 0.14);
    bassGain.gain.setValueAtTime(0.28, t);
    bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    bass.connect(bassFilter);
    bassFilter.connect(bassGain);
    bassGain.connect(bus);
    bass.start(t);
    bass.stop(t + 0.14);

    if (combo >= 2 || overdrive) {
      const arp = ctx.createOscillator();
      const arpGain = ctx.createGain();
      arp.type = overdrive ? 'sawtooth' : 'triangle';
      const arpNote = ARP_SCALE[(step * 3 + Math.floor(step / 4)) % ARP_SCALE.length] ?? ARP_SCALE[0];
      arp.frequency.value = arpNote * (overdrive ? 2 : 1);
      arpGain.gain.setValueAtTime(0.09, t);
      arpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      arp.connect(arpGain);
      arpGain.connect(bus);
      arp.start(t);
      arp.stop(t + 0.11);
    }

    this.step = (step + 1) % STEPS_PER_LOOP;
  }
}
