import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { eraAt, INITIAL_ERA_INDEX, type Era } from '../config/eras';

export const BLOOM_NORMAL = 1.9;
export const BLOOM_OVERDRIVE = 3.8;
export const TRAIL_LENGTH = 42;

type BasicMesh<G extends THREE.BufferGeometry = THREE.BufferGeometry> = THREE.Mesh<G, THREE.MeshBasicMaterial>;

export interface WheelRig {
  group: THREE.Group;
  glow: BasicMesh;
  fold: number;
}

export interface Car {
  root: THREE.Group;
  wheels: WheelRig[];
  shadow: BasicMesh<THREE.PlaneGeometry>;
  shieldDome: BasicMesh<THREE.SphereGeometry>;
  underGlow: THREE.PointLight;
  box: THREE.Box3;
}

export interface LightTrails {
  left: THREE.Vector3[];
  right: THREE.Vector3[];
  geomLeft: THREE.BufferGeometry;
  geomRight: THREE.BufferGeometry;
  material: THREE.LineBasicMaterial;
}

export interface World {
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  scene: THREE.Scene;
  fog: THREE.FogExp2;
  camera: THREE.PerspectiveCamera;
  grid: THREE.GridHelper;
  gridMaterial: THREE.LineBasicMaterial;
  terrain: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  sun: BasicMesh<THREE.PlaneGeometry>;
  stars: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  city: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  tunnel: BasicMesh<THREE.CylinderGeometry>;
  speedLines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  lightning: THREE.PointLight;
  car: Car;
  trails: LightTrails;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return ctx;
}

export function generateSunTexture(era: Era): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = context2d(canvas);

  const gradient = ctx.createLinearGradient(0, 0, 0, 1024);
  gradient.addColorStop(0, era.sun[0]);
  gradient.addColorStop(0.5, era.sun[1]);
  gradient.addColorStop(1, era.sun[2]);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(512, 512, 490, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 22; i++) {
    ctx.fillRect(0, 510 + Math.pow(i, 1.55) * 4.8, 1024, 3 + i * 1.4);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function buildCityscape(era: Era): World['city'] {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(0, 0.5, 0);
  const material = new THREE.MeshStandardMaterial({
    color: era.bld,
    emissive: era.grid,
    emissiveIntensity: 0.12,
    roughness: 0.65,
    metalness: 0.45,
  });
  const count = 500;
  const city = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const side = Math.random() > 0.5 ? 1 : -1;
    dummy.position.set(side * (160 + Math.random() * 750), 0, -250 - Math.random() * 950);
    dummy.scale.set(18 + Math.random() * 45, 25 + Math.random() * 190, 18 + Math.random() * 45);
    dummy.updateMatrix();
    city.setMatrixAt(i, dummy.matrix);
  }
  return city;
}

function buildSpeedLines(): World['speedLines'] {
  const count = 180;
  const positions = new Float32Array(count * 6);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 14 + Math.random() * 26;
    const x = Math.cos(angle) * radius;
    const y = Math.max(0.5, 3 + Math.sin(angle) * (radius * 0.65));
    const z = -Math.random() * 400;
    positions.set([x, y, z, x, y, z + 12 + Math.random() * 24], i * 6);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.LineSegments(geometry, material);
}

function boxMesh(
  size: readonly [number, number, number],
  material: THREE.Material,
  position: readonly [number, number, number],
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  return mesh;
}

function buildDeLorean(scene: THREE.Scene, era: Era): Car {
  const root = new THREE.Group();

  const stainless = new THREE.MeshStandardMaterial({ color: 0xd0d5dd, roughness: 0.22, metalness: 0.92 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x121218, roughness: 0.75, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x050811, roughness: 0.05, metalness: 0.95 });
  const fluxGlow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x00ffff, emissiveIntensity: 7 });
  const tailLight = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff1100, emissiveIntensity: 9 });
  const headLight = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 8 });

  const hoodGeo = new THREE.BoxGeometry(2.48, 0.36, 1.85);
  const hoodPos = hoodGeo.attributes.position;
  if (hoodPos) {
    for (let i = 0; i < hoodPos.count; i++) {
      if (hoodPos.getZ(i) < 0 && hoodPos.getY(i) > 0) hoodPos.setY(i, -0.18);
    }
  }
  hoodGeo.computeVertexNormals();
  const hood = new THREE.Mesh(hoodGeo, stainless);
  hood.position.set(0, 0.62, -2.25);

  const cabinGeo = new THREE.BoxGeometry(1.92, 0.56, 2.35);
  const cabinPos = cabinGeo.attributes.position;
  if (cabinPos) {
    for (let i = 0; i < cabinPos.count; i++) {
      if (cabinPos.getY(i) > 0) cabinPos.setX(i, cabinPos.getX(i) * 0.84);
      if (cabinPos.getZ(i) < 0 && cabinPos.getY(i) > 0) cabinPos.setZ(i, cabinPos.getZ(i) + 0.52);
    }
  }
  cabinGeo.computeVertexNormals();
  const cabin = new THREE.Mesh(cabinGeo, glass);
  cabin.position.set(0, 1.06, -0.2);

  const louvers = boxMesh([1.55, 0.12, 1.65], trim, [0, 1.05, 1.32]);
  louvers.rotation.x = -0.22;

  const mrFusion = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.28, 0.45, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x00ffff, emissiveIntensity: 1.5 }),
  );
  mrFusion.position.set(0, 1.28, 2.05);

  const thrusterGeo = new THREE.CylinderGeometry(0.32, 0.44, 0.65, 16).rotateX(Math.PI / 2);
  const thrusterGlowGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.68, 16).rotateX(Math.PI / 2);
  const thrusters = [-0.78, 0.78].map((x) => {
    const thruster = new THREE.Mesh(thrusterGeo, trim);
    thruster.position.set(x, 1.12, 2.32);
    thruster.add(new THREE.Mesh(thrusterGlowGeo, fluxGlow));
    return thruster;
  });

  const shieldDome = new THREE.Mesh(
    new THREE.SphereGeometry(2.9, 24, 16),
    new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      wireframe: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    }),
  );
  shieldDome.scale.set(0.65, 0.42, 1.35);
  shieldDome.position.set(0, 0.75, -0.4);

  const underGlow = new THREE.PointLight(era.acc, 3, 12);
  underGlow.position.set(0, 0.3, 0);

  root.add(
    boxMesh([2.5, 0.42, 3.5], stainless, [0, 0.62, 0.35]),
    hood,
    boxMesh([2.52, 0.32, 0.42], trim, [0, 0.48, -3.32]),
    boxMesh([2.52, 0.42, 0.48], trim, [0, 0.62, 2.32]),
    boxMesh([0.65, 0.14, 0.08], headLight, [-0.78, 0.56, -3.52]),
    boxMesh([0.65, 0.14, 0.08], headLight, [0.78, 0.56, -3.52]),
    cabin,
    boxMesh([1.52, 0.06, 1.15], stainless, [0, 1.34, -0.2]),
    louvers,
    boxMesh([2.42, 0.22, 0.15], tailLight, [0, 0.66, 2.55]),
    boxMesh([2.62, 0.09, 0.09], fluxGlow, [0, 0.66, -2.95]),
    boxMesh([0.09, 0.09, 5.3], fluxGlow, [-1.31, 0.66, -0.35]),
    boxMesh([0.09, 0.09, 5.3], fluxGlow, [1.31, 0.66, -0.35]),
    boxMesh([0.95, 0.45, 0.85], stainless, [0, 0.92, 2.05]),
    mrFusion,
    ...thrusters,
    shieldDome,
    underGlow,
  );

  const wheelGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.56, 24).rotateZ(Math.PI / 2);
  const hubcapGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.6, 16).rotateZ(Math.PI / 2);
  const hoverGlowGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.66, 16).rotateZ(Math.PI / 2);
  const wheelLayout: readonly (readonly [number, number, number, number])[] = [
    [-1.32, 0.46, 1.72, 1],
    [1.32, 0.46, 1.72, -1],
    [-1.32, 0.46, -1.92, 1],
    [1.32, 0.46, -1.92, -1],
  ];
  const wheels = wheelLayout.map(([x, y, z, fold]): WheelRig => {
    const group = new THREE.Group();
    const glow = new THREE.Mesh(
      hoverGlowGeo,
      new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending }),
    );
    group.add(new THREE.Mesh(wheelGeo, trim), new THREE.Mesh(hubcapGeo, stainless), glow);
    group.position.set(x, y, z);
    root.add(group);
    return { group, glow, fold };
  });

  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const shadowCtx = context2d(shadowCanvas);
  const shadowGradient = shadowCtx.createRadialGradient(64, 64, 4, 64, 64, 62);
  shadowGradient.addColorStop(0, 'rgba(0,0,0,0.92)');
  shadowGradient.addColorStop(1, 'rgba(0,0,0,0)');
  shadowCtx.fillStyle = shadowGradient;
  shadowCtx.fillRect(0, 0, 128, 128);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 7.2),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(shadowCanvas),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.04;

  scene.add(shadow, root);
  return { root, wheels, shadow, shieldDome, underGlow, box: new THREE.Box3() };
}

function buildLightTrails(scene: THREE.Scene, era: Era): LightTrails {
  const geomLeft = new THREE.BufferGeometry();
  const geomRight = new THREE.BufferGeometry();
  geomLeft.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_LENGTH * 3), 3));
  geomRight.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_LENGTH * 3), 3));
  const material = new THREE.LineBasicMaterial({ color: era.acc, transparent: true, opacity: 0.85 });
  scene.add(new THREE.Line(geomLeft, material), new THREE.Line(geomRight, material));
  return {
    left: Array.from({ length: TRAIL_LENGTH }, () => new THREE.Vector3()),
    right: Array.from({ length: TRAIL_LENGTH }, () => new THREE.Vector3()),
    geomLeft,
    geomRight,
    material,
  };
}

export function buildWorld(container: HTMLElement, width: number, height: number, pixelRatio: number): World {
  const era = eraAt(INITIAL_ERA_INDEX);
  const scene = new THREE.Scene();
  const fog = new THREE.FogExp2(era.fog, 0.0024);
  scene.fog = fog;

  const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 2000);
  camera.position.set(0, 5.4, 14.5);

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(pixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), BLOOM_NORMAL, 0.55, 0.15);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloom);

  const dirLight = new THREE.DirectionalLight(0xffffff, 2.2);
  dirLight.position.set(15, 45, -20);
  const lightning = new THREE.PointLight(0x00ffff, 0, 900);
  lightning.position.set(0, 70, -120);
  scene.add(new THREE.AmbientLight(0xffffff, 0.45), dirLight, lightning);

  const sun = new THREE.Mesh(
    new THREE.PlaneGeometry(820, 820),
    new THREE.MeshBasicMaterial({ map: generateSunTexture(era), transparent: true, fog: false }),
  );
  sun.position.set(0, 185, -960);

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(1000, 2600).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x020006 }),
  );

  const grid = new THREE.GridHelper(2600, 220, era.grid, era.acc);
  grid.position.y = 0.08;
  const gridMaterial = grid.material;
  gridMaterial.transparent = true;
  gridMaterial.opacity = 0.65;

  const mountains = new THREE.PlaneGeometry(1800, 650, 72, 22);
  const mountainPos = mountains.attributes.position;
  if (mountainPos) {
    for (let i = 0; i < mountainPos.count; i++) {
      const vx = Math.abs(mountainPos.getX(i));
      if (vx > 75) mountainPos.setZ(i, Math.random() * 115 + (vx - 75) * 0.68);
    }
  }
  mountains.computeVertexNormals();
  const terrain = new THREE.Mesh(
    mountains,
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: era.grid, emissiveIntensity: 0.35, wireframe: true }),
  );
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.y = 0.15;

  const city = buildCityscape(era);
  const speedLines = buildSpeedLines();

  const tunnel = new THREE.Mesh(
    new THREE.CylinderGeometry(52, 16, 2000, 32, 20, true),
    new THREE.MeshBasicMaterial({
      color: era.acc,
      wireframe: true,
      transparent: true,
      opacity: 0,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  tunnel.rotation.x = Math.PI / 2;
  tunnel.position.set(0, 5, -800);

  const starPositions = new Float32Array(2500 * 3);
  for (let i = 0; i < starPositions.length; i += 3) {
    starPositions[i] = (Math.random() - 0.5) * 1600;
    starPositions[i + 1] = 15 + Math.random() * 580;
    starPositions[i + 2] = (Math.random() - 0.5) * 2000;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, transparent: true, opacity: 0.85 }),
  );

  scene.add(sun, road, grid, terrain, city, speedLines, tunnel, stars);

  const car = buildDeLorean(scene, era);
  const trails = buildLightTrails(scene, era);

  return {
    renderer,
    composer,
    bloom,
    scene,
    fog,
    camera,
    grid,
    gridMaterial,
    terrain,
    sun,
    stars,
    city,
    tunnel,
    speedLines,
    lightning,
    car,
    trails,
  };
}
