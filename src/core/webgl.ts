type CanvasLike = Pick<HTMLCanvasElement, 'getContext'>;

export function isWebGLAvailable(createCanvas: () => CanvasLike): boolean {
  try {
    const canvas = createCanvas();
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    return context !== null;
  } catch {
    return false;
  }
}
