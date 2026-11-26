import { type Era } from '../config/eras';
import { formatMph, formatScore, hexToCss } from '../core/format';

function byId(doc: Document, id: string): HTMLElement {
  const el = doc.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

function restartAnimation(el: HTMLElement, className: string): void {
  el.classList.remove(className);
  el.getBoundingClientRect();
  el.classList.add(className);
}

export type Screen = 'start' | 'pause' | 'gameOver';

export interface RunSummary {
  score: number;
  maxCombo: number;
  timeJumps: number;
}

export class Hud {
  readonly score: HTMLElement;
  readonly highScore: HTMLElement;
  readonly level: HTMLElement;
  readonly combo: HTMLElement;
  readonly speed: HTMLElement;
  readonly overdrive: HTMLElement;
  readonly overdriveBar: HTMLElement;
  readonly notification: HTMLElement;
  readonly callout: HTMLElement;
  readonly flash: HTMLElement;
  readonly fluxCap: HTMLElement;
  readonly fluxStatus: HTMLElement;
  readonly shield: HTMLElement;
  readonly muteBtn: HTMLElement;
  readonly pauseBtn: HTMLElement;
  readonly newRecord: HTMLElement;
  private readonly screens: Record<Screen, HTMLElement>;
  private readonly finalScore: HTMLElement;
  private readonly finalCombo: HTMLElement;
  private readonly finalJumps: HTMLElement;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private comboPulseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly doc: Document) {
    this.score = byId(doc, 'score-display');
    this.highScore = byId(doc, 'highscore-display');
    this.level = byId(doc, 'level-display');
    this.combo = byId(doc, 'combo-display');
    this.speed = byId(doc, 'speed-display');
    this.overdrive = byId(doc, 'overdrive-warning');
    this.overdriveBar = byId(doc, 'overdrive-bar');
    this.notification = byId(doc, 'level-notification');
    this.callout = byId(doc, 'callout-banner');
    this.flash = byId(doc, 'time-flash');
    this.fluxCap = byId(doc, 'flux-capacitor');
    this.fluxStatus = byId(doc, 'flux-status');
    this.shield = byId(doc, 'shield-indicator');
    this.muteBtn = byId(doc, 'mute-btn');
    this.pauseBtn = byId(doc, 'pause-btn');
    this.newRecord = byId(doc, 'new-record-badge');
    this.screens = {
      start: byId(doc, 'start-screen'),
      pause: byId(doc, 'pause-screen'),
      gameOver: byId(doc, 'game-over-screen'),
    };
    this.finalScore = byId(doc, 'final-score');
    this.finalCombo = byId(doc, 'final-combo');
    this.finalJumps = byId(doc, 'final-jumps');
  }

  button(id: string): HTMLElement {
    return byId(this.doc, id);
  }

  showScreen(screen: Screen | null): void {
    for (const [name, el] of Object.entries(this.screens)) {
      el.classList.toggle('hidden', name !== screen);
    }
  }

  setScore(score: number): void {
    this.score.textContent = formatScore(score);
  }

  setHighScore(score: number): void {
    this.highScore.textContent = formatScore(score);
  }

  setSpeed(mph: number): void {
    this.speed.textContent = formatMph(mph);
  }

  setCombo(combo: number, pulse: boolean): void {
    this.combo.textContent = `x${combo}`;
    if (this.comboPulseTimer !== null) clearTimeout(this.comboPulseTimer);
    this.combo.classList.toggle('combo-active', pulse);
    if (pulse) {
      this.comboPulseTimer = setTimeout(() => {
        this.combo.classList.remove('combo-active');
        this.comboPulseTimer = null;
      }, 110);
    }
  }

  setMuted(muted: boolean): void {
    this.muteBtn.textContent = muted ? '🔇' : '🔊';
    this.muteBtn.setAttribute('aria-pressed', String(muted));
  }

  setShield(active: boolean): void {
    this.shield.classList.toggle('active', active);
  }

  setOverdrive(active: boolean): void {
    this.overdrive.classList.toggle('overdrive-on', active);
  }

  setOverdriveRemaining(fraction: number): void {
    this.overdriveBar.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
  }

  setFlux(chargePct: number, overdrive: boolean): void {
    if (overdrive) {
      this.fluxStatus.textContent = '1.21 GW!';
      this.fluxStatus.style.color = '#00ffff';
      this.fluxCap.classList.remove('flux-ready');
      this.fluxCap.classList.add('flux-active');
      return;
    }
    const pct = Math.max(0, Math.min(100, Math.floor(chargePct)));
    this.overdriveBar.style.width = `${pct}%`;
    if (pct >= 100) {
      this.fluxStatus.textContent = 'PRONTO!';
      this.fluxStatus.style.color = '#ffaa00';
      this.fluxCap.classList.add('flux-ready');
    } else {
      this.fluxStatus.textContent = `${pct}%`;
      this.fluxStatus.style.color = '#aaa';
      this.fluxCap.classList.remove('flux-ready', 'flux-active');
    }
  }

  showCallout(text: string, color = 'var(--neon-green)'): void {
    this.callout.textContent = text;
    this.callout.style.color = color;
    this.callout.style.textShadow = `0 0 14px ${color}, 0 0 28px #000`;
    restartAnimation(this.callout, 'callout-anim');
  }

  setEra(era: Era, announce: boolean): void {
    this.level.textContent = era.name;
    this.level.style.color = announce ? hexToCss(era.grid) : 'var(--neon-blue)';
    if (!announce) return;
    this.notification.textContent = era.label;
    this.notification.style.textShadow = `0 0 20px ${hexToCss(era.grid)}, 0 0 70px #fff`;
    restartAnimation(this.notification, 'level-up-anim');
  }

  flashScreen(): void {
    if (this.flashTimer !== null) clearTimeout(this.flashTimer);
    this.flash.style.transition = 'none';
    this.flash.style.opacity = '1';
    requestAnimationFrame(() => {
      this.flashTimer = setTimeout(() => {
        this.flash.style.transition = 'opacity 1.4s ease-out';
        this.flash.style.opacity = '0';
        this.flashTimer = null;
      }, 40);
    });
  }

  showSummary(summary: RunSummary): void {
    this.finalScore.textContent = Math.floor(summary.score).toLocaleString('pt-PT');
    this.finalCombo.textContent = `x${summary.maxCombo}`;
    this.finalJumps.textContent = summary.timeJumps.toString();
    this.showScreen('gameOver');
  }
}
