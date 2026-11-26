export interface Era {
  readonly name: string;
  readonly label: string;
  readonly sun: readonly [top: string, middle: string, bottom: string];
  readonly fog: number;
  readonly grid: number;
  readonly acc: number;
  readonly bld: number;
}

export const ERAS: readonly Era[] = [
  {
    name: '1985',
    label: 'OUTRUN 1985',
    sun: ['#ffdd00', '#ff0066', '#2a0066'],
    fog: 0x050014,
    grid: 0xff00ff,
    acc: 0x00ffff,
    bld: 0x08001a,
  },
  {
    name: '2015',
    label: 'FUTURE 2015',
    sun: ['#00ffff', '#0066ff', '#000833'],
    fog: 0x00081c,
    grid: 0x00ffff,
    acc: 0xff0077,
    bld: 0x000a24,
  },
  {
    name: '1955',
    label: 'CLASSIC 1955',
    sun: ['#ffee44', '#ff6600', '#440000'],
    fog: 0x180400,
    grid: 0xffaa00,
    acc: 0xff3300,
    bld: 0x1a0500,
  },
  {
    name: '2077',
    label: 'CYBER 2077',
    sun: ['#aaffcc', '#00ff88', '#002218'],
    fog: 0x00120a,
    grid: 0x00ff88,
    acc: 0xff00ff,
    bld: 0x001a0e,
  },
  {
    name: '1885',
    label: 'FRONTIER 1885',
    sun: ['#ffffff', '#ffbb66', '#331100'],
    fog: 0x1a0c04,
    grid: 0xffcc66,
    acc: 0x00ffff,
    bld: 0x140802,
  },
];

export const INITIAL_ERA_INDEX = 0;

export function eraAt(index: number): Era {
  const era = ERAS[index];
  if (!era) throw new RangeError(`Unknown era index ${index}`);
  return era;
}

export function pickNextEraIndex(current: number, random: () => number = Math.random): number {
  const offset = 1 + Math.floor(random() * (ERAS.length - 1));
  return (current + Math.min(offset, ERAS.length - 1)) % ERAS.length;
}
