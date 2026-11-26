import { describe, expect, it, vi } from 'vitest';

import { isWebGLAvailable } from '../../src/core/webgl';

type GetContext = HTMLCanvasElement['getContext'];

const canvasWith = (impl: (kind: string) => unknown) => ({ getContext: vi.fn(impl) as unknown as GetContext });

describe('isWebGLAvailable', () => {
  it('accepts WebGL 2', () => {
    expect(isWebGLAvailable(() => canvasWith((kind) => (kind === 'webgl2' ? {} : null)))).toBe(true);
  });

  it('falls back to WebGL 1', () => {
    expect(isWebGLAvailable(() => canvasWith((kind) => (kind === 'webgl' ? {} : null)))).toBe(true);
  });

  it('reports false when no context can be created', () => {
    expect(isWebGLAvailable(() => canvasWith(() => null))).toBe(false);
  });

  it('reports false when canvas creation throws', () => {
    expect(
      isWebGLAvailable(() => {
        throw new Error('no canvas');
      }),
    ).toBe(false);
  });
});
