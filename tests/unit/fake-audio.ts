export class FakeParam {
  value: number;
  readonly targets: { value: number; time: number }[] = [];
  constructor(value = 0) {
    this.value = value;
  }
  setValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
  exponentialRampToValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
  setTargetAtTime(value: number, time: number): this {
    this.value = value;
    this.targets.push({ value, time });
    return this;
  }
}

class FakeNode {
  readonly connections: unknown[] = [];
  connect(node: unknown): unknown {
    this.connections.push(node);
    return node;
  }
}

class FakeSource extends FakeNode {
  type = '';
  buffer: unknown = null;
  readonly frequency = new FakeParam();
  started = 0;
  stopped = 0;
  start(): void {
    this.started++;
  }
  stop(): void {
    this.stopped++;
  }
}

export class FakeAudioContext {
  state: AudioContextState = 'running';
  currentTime = 1;
  readonly sampleRate = 8000;
  readonly destination = new FakeNode();
  readonly gains: { gain: FakeParam }[] = [];
  readonly oscillators: FakeSource[] = [];
  readonly bufferSources: FakeSource[] = [];
  resumeCalls = 0;

  createGain() {
    const node = Object.assign(new FakeNode(), { gain: new FakeParam(1) });
    this.gains.push(node);
    return node;
  }
  createOscillator() {
    const node = new FakeSource();
    this.oscillators.push(node);
    return node;
  }
  createBufferSource() {
    const node = new FakeSource();
    this.bufferSources.push(node);
    return node;
  }
  createBiquadFilter() {
    return Object.assign(new FakeNode(), { type: '', frequency: new FakeParam() });
  }
  createDynamicsCompressor() {
    return Object.assign(new FakeNode(), {
      threshold: new FakeParam(),
      knee: new FakeParam(),
      ratio: new FakeParam(),
    });
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  resume(): Promise<void> {
    this.resumeCalls++;
    this.state = 'running';
    return Promise.resolve();
  }

  asAudioContext(): AudioContext {
    return this as unknown as AudioContext;
  }
}
