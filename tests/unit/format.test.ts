import { describe, expect, it } from 'vitest';

import { formatMph, formatScore, hexToCss, speedToMph } from '../../src/core/format';
import { MAX_SPEED_NORMAL } from '../../src/config/physics';

describe('formatScore', () => {
  it('pads to six digits and floors fractions', () => {
    expect(formatScore(41.9)).toBe('000041');
    expect(formatScore(1234567)).toBe('1234567');
  });

  it('never renders a negative score', () => {
    expect(formatScore(-5)).toBe('000000');
  });
});

describe('hexToCss', () => {
  it('renders a 24-bit colour with leading zeros', () => {
    expect(hexToCss(0x00ffff)).toBe('#00ffff');
    expect(hexToCss(0xff00ff)).toBe('#ff00ff');
    expect(hexToCss(0x000a24)).toBe('#000a24');
  });
});

describe('speedToMph', () => {
  it('always reads 88 MPH in overdrive', () => {
    expect(speedToMph(0, true)).toBe(88);
  });

  it('scales normal speed and caps just below the time-travel threshold', () => {
    expect(speedToMph(0, false)).toBe(0);
    expect(speedToMph(MAX_SPEED_NORMAL / 2, false)).toBe(42);
    expect(speedToMph(MAX_SPEED_NORMAL * 10, false)).toBe(87);
    expect(speedToMph(-1, false)).toBe(0);
  });

  it('formats the speedometer readout', () => {
    expect(formatMph(7)).toBe('07 MPH');
    expect(formatMph(88)).toBe('88 MPH');
  });
});
