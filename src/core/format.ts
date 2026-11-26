import { MAX_SPEED_NORMAL } from '../config/physics';

export function formatScore(value: number): string {
  return Math.max(0, Math.floor(value)).toString().padStart(6, '0');
}

export function hexToCss(hex: number): string {
  return `#${(hex & 0xffffff).toString(16).padStart(6, '0')}`;
}

export function speedToMph(speed: number, overdrive: boolean): number {
  if (overdrive) return 88;
  return Math.max(0, Math.min(87, Math.floor((speed / MAX_SPEED_NORMAL) * 84)));
}

export function formatMph(mph: number): string {
  return `${mph.toString().padStart(2, '0')} MPH`;
}
