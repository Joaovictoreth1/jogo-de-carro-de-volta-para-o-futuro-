import * as THREE from 'three';

import { type Sfx, type SynthAudio } from '../audio/synth';
import { eraAt, INITIAL_ERA_INDEX, pickNextEraIndex } from '../config/eras';
import {
  BASE_SPEED,
  CAR_ACCEL,
  CAR_FRICTION,
  CAR_MAX_X,
  COMBO_WINDOW,
  GRAVITY,
  JUMP_STRENGTH,
  MAX_COMBO,
  MAX_FRAME_SECONDS,
  MAX_SPEED_NORMAL,
  OVERDRIVE_DURATION,
  PLUTONIUM_FULL,
  SPEED_OVERDRIVE,
  TARGET_FPS,
} from '../config/physics';
import { speedToMph } from '../core/format';
import { classifySwipe, keyToAction, SteeringState, type Direction } from '../core/input';
import { type HighScoreStore } from '../core/storage';
import { Hud } from './hud';
import { BLOOM_NORMAL, BLOOM_OVERDRIVE, buildWorld, generateSunTexture, type World } from './scene';

export type GameState = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAMEOVER';

type CollectibleType = 'ring' | 'shield' | 'boost';
type BurstKind = 'crash' | 'boost' | 'shield';

interface Obstacle {
  group: THREE.Group;
  wire: THREE.MeshBasicMaterial;
  box: THREE.Box3;
  vx: number;
  width: number;
  nearMissed: boolean;
}

interface Collectible {
  object: THREE.Object3D;
  type: CollectibleType;
  box: THREE.Box3;
}

interface Particle {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  vel: THREE.Vector3;
}

interface FireTrail {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  life: number;
}

interface Shockwave {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  life: number;
  scale: number;
}

const GAME_OVER_DELAY_MS = 1700;
const OFFSCREEN_Z = 25;
const SPAWN_Z = -620;

function createAssets(ringEmissive: number) {
  return {
    obsGeo: new THREE.BoxGeometry(1, 1, 1),
    obsMatSolid: new THREE.MeshStandardMaterial({ color: 0x0a0a10, metalness: 0.85, roughness: 0.2 }),
    obsMatWire: new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.95 }),
    ringGeo: new THREE.TorusGeometry(1.4, 0.32, 10, 24),
    ringMat: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: ringEmissive, emissiveIntensity: 4.5 }),
    boostGeo: new THREE.OctahedronGeometry(2.0, 0),
    boostCoreGeo: new THREE.OctahedronGeometry(1.0, 0),
    boostMat: new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0xff6600,
      emissiveIntensity: 6,
      wireframe: true,
    }),
    boostCoreMat: new THREE.MeshBasicMaterial({ color: 0xffcc00 }),
    shieldGeo: new THREE.IcosahedronGeometry(1.6, 1),
    shieldMat: new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0x00ff88,
      emissiveIntensity: 4.5,
      wireframe: true,
    }),
    partGeo: new THREE.BoxGeometry(0.65, 0.65, 0.65),
    partMat: {
      crash: new THREE.MeshBasicMaterial({ color: 0xffaa00 }),
      boost: new THREE.MeshBasicMaterial({ color: 0x00ffff }),
      shield: new THREE.MeshBasicMaterial({ color: 0x00ff88 }),
    } satisfies Record<BurstKind, THREE.MeshBasicMaterial>,
    shockGeo: new THREE.SphereGeometry(1.5, 24, 24),
    fireGeo: new THREE.PlaneGeometry(1.1, 9),
    fireMat: new THREE.MeshBasicMaterial({
      color: 0xff5500,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  };
}

const BURST_COLORS: Readonly<Record<BurstKind, number>> = { crash: 0xffaa00, boost: 0x00ffff, shield: 0x00ff88 };

export class SunsetRace {
  private readonly world: World;
  private readonly hud: Hud;
  private readonly assets: ReturnType<typeof createAssets>;
  private readonly clock = new THREE.Clock();
  private readonly steering = new SteeringState();
  private readonly trailPoint = new THREE.Vector3();

  private readonly obstacles: Obstacle[] = [];
  private readonly collectibles: Collectible[] = [];
  private readonly particles: Particle[] = [];
  private readonly fireTrails: FireTrail[] = [];
  private readonly shockwaves: Shockwave[] = [];
  private readonly pools = {
    obstacles: [] as Obstacle[],
    collectibles: [] as Collectible[],
    particles: [] as Particle[],
    fireTrails: [] as FireTrail[],
  };

  private state: GameState = 'MENU';
  private score = 0;
  private maxCombo = 1;
  private timeJumps = 0;
  private eraIndex = INITIAL_ERA_INDEX;
  private speed = 1.2;
  private carVelocityX = 0;
  private carVelocityY = 0;
  private jumping = false;
  private shield = false;
  private invulnerable = 0;
  private overdrive = false;
  private overdriveTimer = 0;
  private plutonium = 0;
  private combo = 1;
  private comboTimer = 0;
  private screenShake = 0;
  private hitstop = 0;
  private spawnCooldownObs = 0;
  private spawnCooldownCol = 0;
  private touchStartX = 0;
  private touchStartY = 0;
  private gameOverTimer: ReturnType<typeof setTimeout> | null = null;
  private squashTimer: ReturnType<typeof setTimeout> | null = null;
  private lightningTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly win: Window,
    private readonly audio: SynthAudio,
    private readonly highScore: HighScoreStore,
  ) {
    const doc = win.document;
    this.hud = new Hud(doc);
    const container = doc.getElementById('game-container');
    if (!container) throw new Error('Missing #game-container element');
    this.world = buildWorld(container, win.innerWidth, win.innerHeight, win.devicePixelRatio);
    this.assets = createAssets(eraAt(INITIAL_ERA_INDEX).acc);
    this.hud.setHighScore(highScore.value);
    this.bindControls();
    win.addEventListener('resize', this.onResize);
    this.world.renderer.setAnimationLoop(this.frame);
  }

  get gameState(): GameState {
    return this.state;
  }

  get mood(): { combo: number; overdrive: boolean } {
    return { combo: this.combo, overdrive: this.overdrive };
  }

  start = (): void => {
    this.audio.startRun();
    this.cancelTimer('gameOverTimer');
    this.hud.showScreen(null);
    this.hud.newRecord.hidden = true;

    this.score = 0;
    this.maxCombo = 1;
    this.timeJumps = 0;
    this.speed = BASE_SPEED;
    this.carVelocityX = 0;
    this.carVelocityY = 0;
    this.jumping = false;
    this.steering.reset();
    this.overdrive = false;
    this.invulnerable = 0;
    this.overdriveTimer = 0;
    this.plutonium = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.screenShake = 0;
    this.hitstop = 0;
    this.setShield(false);

    this.hud.setCombo(1, false);
    this.hud.setOverdrive(false);
    this.hud.setFlux(0, false);
    this.world.bloom.strength = BLOOM_NORMAL;
    this.world.stars.material.size = 0.9;
    this.applyEra(INITIAL_ERA_INDEX, false);

    const { car } = this.world;
    car.root.position.set(0, 0, 0);
    car.root.rotation.set(0, 0, 0);
    car.root.scale.set(1, 1, 1);
    car.root.visible = true;
    car.shadow.visible = true;

    this.clearEntities();
    this.world.trails.left.forEach((v) => v.set(0, 0, 0));
    this.world.trails.right.forEach((v) => v.set(0, 0, 0));

    this.clock.getDelta();
    this.state = 'PLAYING';
  };

  pause = (): void => {
    if (this.state !== 'PLAYING') return;
    this.state = 'PAUSED';
    this.steering.reset();
    this.hud.showScreen('pause');
    this.audio.pause();
  };

  resume = (): void => {
    if (this.state !== 'PAUSED') return;
    this.hud.showScreen(null);
    this.clock.getDelta();
    this.state = 'PLAYING';
    this.audio.resume();
  };

  togglePause = (): void => {
    if (this.state === 'PLAYING') this.pause();
    else if (this.state === 'PAUSED') this.resume();
  };

  toggleMute = (): void => {
    this.hud.setMuted(this.audio.toggleMute());
  };

  private play(sfx: Sfx): void {
    this.audio.play(sfx, this.combo);
  }

  private cancelTimer(name: 'gameOverTimer' | 'squashTimer' | 'lightningTimer'): void {
    const timer = this[name];
    if (timer !== null) clearTimeout(timer);
    this[name] = null;
  }

  private applyEra(index: number, announce: boolean): void {
    this.eraIndex = index;
    const era = eraAt(index);
    const w = this.world;
    w.fog.color.setHex(era.fog);
    w.gridMaterial.color.setHex(era.grid);
    w.terrain.material.emissive.setHex(era.grid);
    const previous = w.sun.material.map;
    w.sun.material.map = generateSunTexture(era);
    w.sun.material.needsUpdate = true;
    previous?.dispose();
    w.trails.material.color.setHex(era.acc);
    w.city.material.color.setHex(era.bld);
    w.city.material.emissive.setHex(era.grid);
    w.tunnel.material.color.setHex(era.acc);
    this.assets.ringMat.emissive.setHex(era.acc);
    w.car.underGlow.color.setHex(era.acc);
    this.hud.setEra(era, announce);
  }

  private setShield(active: boolean): void {
    this.shield = active;
    this.hud.setShield(active);
    this.world.car.shieldDome.material.opacity = active ? 0.35 : 0;
  }

  private addPlutonium(amount: number): void {
    if (this.overdrive) return;
    const wasReady = this.plutonium >= PLUTONIUM_FULL;
    this.plutonium = Math.min(PLUTONIUM_FULL, this.plutonium + amount);
    this.hud.setFlux(this.plutonium, false);
    if (!wasReady && this.plutonium >= PLUTONIUM_FULL) {
      this.hud.showCallout('CAPACITOR PRONTO! [SHIFT / E]', 'var(--neon-orange)');
      this.play('shield');
    }
  }

  private engageOverdrive(): void {
    this.triggerTimeTravel();
    this.overdrive = true;
    this.plutonium = 0;
    this.overdriveTimer = OVERDRIVE_DURATION;
    this.invulnerable = OVERDRIVE_DURATION;
    this.hud.setOverdrive(true);
    this.world.bloom.strength = BLOOM_OVERDRIVE;
    this.hud.setFlux(0, true);
  }

  private activateManualOverdrive(): void {
    if (this.overdrive || this.plutonium < PLUTONIUM_FULL || this.state !== 'PLAYING') return;
    this.engageOverdrive();
  }

  private triggerTimeTravel(): void {
    this.play('time_travel');
    this.timeJumps++;
    this.hud.flashScreen();
    this.screenShake = 3.8;
    this.applyEra(pickNextEraIndex(this.eraIndex), true);
  }

  private jump(): void {
    if (this.jumping || this.state !== 'PLAYING') return;
    this.jumping = true;
    this.carVelocityY = JUMP_STRENGTH;
    this.play('jump');
    const root = this.world.car.root;
    root.scale.set(0.88, 1.18, 0.88);
    this.cancelTimer('squashTimer');
    this.squashTimer = setTimeout(() => {
      root.scale.set(1, 1, 1);
      this.squashTimer = null;
    }, 140);
  }

  private spawnObstacle(): void {
    const era = eraAt(this.eraIndex);
    const moving = Math.random() < 0.14 + this.eraIndex * 0.07;
    const width = moving ? 4.2 : Math.random() > 0.72 ? 11.5 : 4.2;
    const color = moving ? era.acc : width > 5 ? 0xffaa00 : 0xff0055;

    let obs = this.pools.obstacles.pop();
    if (obs) {
      obs.group.visible = true;
    } else {
      const group = new THREE.Group();
      const wire = this.assets.obsMatWire.clone();
      group.add(new THREE.Mesh(this.assets.obsGeo, this.assets.obsMatSolid), new THREE.Mesh(this.assets.obsGeo, wire));
      this.world.scene.add(group);
      obs = { group, wire, box: new THREE.Box3(), vx: 0, width, nearMissed: false };
    }

    obs.group.scale.set(width, 2.4, 2.4);
    obs.wire.color.setHex(color);
    obs.group.position.set(Math.random() * (CAR_MAX_X * 2 - width) - (CAR_MAX_X - width / 2), 1.2, SPAWN_Z);
    obs.vx = moving ? (Math.random() > 0.5 ? 1 : -1) * (0.18 + this.eraIndex * 0.04) : 0;
    obs.width = width;
    obs.nearMissed = false;
    this.obstacles.push(obs);
  }

  private createCollectible(type: CollectibleType): Collectible {
    const a = this.assets;
    let object: THREE.Object3D;
    if (type === 'boost') {
      object = new THREE.Group();
      object.add(new THREE.Mesh(a.boostGeo, a.boostMat), new THREE.Mesh(a.boostCoreGeo, a.boostCoreMat));
    } else if (type === 'shield') {
      object = new THREE.Mesh(a.shieldGeo, a.shieldMat);
    } else {
      object = new THREE.Mesh(a.ringGeo, a.ringMat);
      object.rotation.y = Math.PI / 2;
    }
    this.world.scene.add(object);
    return { object, type, box: new THREE.Box3() };
  }

  private spawnCollectible(): void {
    const roll = Math.random();
    const type: CollectibleType = roll > 0.9 ? 'boost' : roll > 0.81 && !this.shield ? 'shield' : 'ring';
    const pooled = this.pools.collectibles.findIndex((c) => c.type === type);
    const item = pooled === -1 ? this.createCollectible(type) : this.pools.collectibles.splice(pooled, 1)[0];
    if (!item) return;
    item.object.visible = true;
    item.object.position.set(Math.random() * (CAR_MAX_X * 2) - CAR_MAX_X, 2.0, SPAWN_Z);
    this.collectibles.push(item);
  }

  private burst(pos: THREE.Vector3, kind: BurstKind): void {
    const material = new THREE.MeshBasicMaterial({
      color: BURST_COLORS[kind],
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const wave = new THREE.Mesh(this.assets.shockGeo, material);
    wave.position.copy(pos);
    this.world.scene.add(wave);
    this.shockwaves.push({ mesh: wave, life: 1, scale: 1 });

    const partMat = this.assets.partMat[kind];
    for (let i = 0; i < 28; i++) {
      let p = this.pools.particles.pop();
      if (p) {
        p.mesh.visible = true;
        p.mesh.material = partMat;
      } else {
        const mesh = new THREE.Mesh(this.assets.partGeo, partMat);
        this.world.scene.add(mesh);
        p = { mesh, vel: new THREE.Vector3() };
      }
      p.mesh.position.copy(pos);
      p.vel.set((Math.random() - 0.5) * 9, Math.random() * 11, (Math.random() - 0.5) * 9);
      this.particles.push(p);
    }
  }

  private spawnFireTrail(x: number, z: number): void {
    for (const offsetX of [-1.35, 1.35]) {
      let f = this.pools.fireTrails.pop();
      if (f) {
        f.mesh.visible = true;
      } else {
        const mesh = new THREE.Mesh(this.assets.fireGeo, this.assets.fireMat.clone());
        mesh.rotation.x = -Math.PI / 2;
        this.world.scene.add(mesh);
        f = { mesh, life: 1 };
      }
      f.mesh.material.opacity = 0.95;
      f.mesh.position.set(x + offsetX, 0.12, z);
      f.life = 1;
      this.fireTrails.push(f);
    }
  }

  private clearEntities(): void {
    const recycle = <T>(active: T[], pool: T[], hide: (item: T) => void): void => {
      for (const item of active) {
        hide(item);
        pool.push(item);
      }
      active.length = 0;
    };
    recycle(this.obstacles, this.pools.obstacles, (o) => {
      o.group.visible = false;
    });
    recycle(this.collectibles, this.pools.collectibles, (c) => {
      c.object.visible = false;
    });
    recycle(this.particles, this.pools.particles, (p) => {
      p.mesh.visible = false;
    });
    recycle(this.fireTrails, this.pools.fireTrails, (f) => {
      f.mesh.visible = false;
    });
    for (const s of this.shockwaves) this.disposeShockwave(s);
    this.shockwaves.length = 0;
  }

  private disposeShockwave(s: Shockwave): void {
    this.world.scene.remove(s.mesh);
    s.mesh.material.dispose();
  }

  private retireObstacle(index: number): void {
    const [obs] = this.obstacles.splice(index, 1);
    if (!obs) return;
    obs.group.visible = false;
    this.pools.obstacles.push(obs);
  }

  private handleCollision(obs: Obstacle, index: number): void {
    if (this.overdrive) {
      this.burst(obs.group.position, 'boost');
      this.score += 500 * this.combo;
      this.retireObstacle(index);
      this.play('crash');
      this.screenShake = 1.1;
    } else if (this.shield) {
      this.setShield(false);
      this.invulnerable = 75;
      this.hitstop = 4;
      this.screenShake = 1.6;
      this.burst(obs.group.position, 'shield');
      this.retireObstacle(index);
      this.play('crash');
      this.hud.showCallout('ESCUDO ABSORVEU IMPACTO!', 'var(--neon-green)');
    } else if (this.invulnerable <= 0) {
      this.gameOver();
    }
  }

  private gameOver(): void {
    const { car } = this.world;
    this.screenShake = 2.6;
    this.hitstop = 6;
    this.state = 'GAMEOVER';
    this.steering.reset();
    this.burst(car.root.position, 'crash');
    car.root.visible = false;
    car.shadow.visible = false;
    this.play('crash');
    this.audio.endRun();

    const summary = { score: Math.floor(this.score), maxCombo: this.maxCombo, timeJumps: this.timeJumps };
    if (this.highScore.submit(summary.score)) {
      this.hud.setHighScore(this.highScore.value);
      this.hud.newRecord.hidden = false;
    }
    this.gameOverTimer = setTimeout(() => {
      this.gameOverTimer = null;
      this.hud.showSummary(summary);
    }, GAME_OVER_DELAY_MS);
  }

  private bindControls(): void {
    const { win, hud } = this;
    const passiveFalse = { passive: false } as const;

    win.addEventListener('keydown', (e) => {
      const action = keyToAction(e.key);
      if (!action) return;
      if (this.state === 'PLAYING' && (action.kind === 'jump' || action.kind === 'steer')) {
        // Keeps Space/arrows from scrolling or re-activating a focused HUD button.
        e.preventDefault();
      }
      if (e.repeat && action.kind !== 'steer') return;
      switch (action.kind) {
        case 'pause':
          this.togglePause();
          break;
        case 'mute':
          this.toggleMute();
          break;
        case 'overdrive':
          this.activateManualOverdrive();
          break;
        case 'jump':
          this.jump();
          break;
        case 'steer':
          this.steering.press(action.direction, `key:${e.key.toLowerCase()}`);
          break;
      }
    });

    win.addEventListener('keyup', (e) => {
      const action = keyToAction(e.key);
      if (action?.kind === 'steer') this.steering.release(action.direction, `key:${e.key.toLowerCase()}`);
    });

    const releaseAll = (): void => {
      this.steering.reset();
    };
    win.addEventListener('blur', releaseAll);
    win.document.addEventListener('visibilitychange', () => {
      if (win.document.visibilityState === 'hidden') {
        releaseAll();
        this.pause();
      }
    });

    const bindSteerButton = (id: string, direction: Direction): void => {
      const el = hud.button(id);
      const source = `touch:${direction}`;
      el.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();
          this.steering.press(direction, source);
        },
        passiveFalse,
      );
      for (const type of ['touchend', 'touchcancel'] as const) {
        el.addEventListener(
          type,
          (e) => {
            e.preventDefault();
            this.steering.release(direction, source);
          },
          passiveFalse,
        );
      }
    };
    bindSteerButton('touch-left', 'left');
    bindSteerButton('touch-right', 'right');

    hud.button('touch-jump').addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        this.jump();
      },
      passiveFalse,
    );
    hud.button('touch-boost').addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        this.activateManualOverdrive();
      },
      passiveFalse,
    );

    win.addEventListener(
      'touchstart',
      (e) => {
        const touch = e.touches[0];
        if (!touch) return;
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
      },
      { passive: true },
    );
    win.addEventListener(
      'touchend',
      (e) => {
        const touch = e.changedTouches[0];
        if (this.state !== 'PLAYING' || !touch) return;
        const gesture = classifySwipe(touch.clientX - this.touchStartX, touch.clientY - this.touchStartY);
        if (gesture === 'jump') this.jump();
        else if (gesture === 'overdrive') this.activateManualOverdrive();
      },
      { passive: true },
    );

    hud.button('start-btn').addEventListener('click', this.start);
    hud.button('restart-btn').addEventListener('click', this.start);
    hud.button('pause-restart-btn').addEventListener('click', this.start);
    hud.button('resume-btn').addEventListener('click', this.resume);
    hud.pauseBtn.addEventListener('click', this.togglePause);
    hud.muteBtn.addEventListener('click', this.toggleMute);
  }

  private readonly onResize = (): void => {
    const { camera, renderer, composer } = this.world;
    const { innerWidth: width, innerHeight: height } = this.win;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height);
  };

  private readonly frame = (): void => {
    const dt = Math.min(this.clock.getDelta(), MAX_FRAME_SECONDS) * TARGET_FPS;
    const { composer } = this.world;

    if (this.state === 'PAUSED') {
      composer.render();
      return;
    }
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      composer.render();
      return;
    }

    const simSpeed = this.state === 'PLAYING' ? this.speed : 0.35;
    this.updateBackdrop(simSpeed, dt);
    if (this.state === 'PLAYING') this.updateRun(simSpeed, dt);
    this.updateEffects(dt);
    composer.render();
  };

  private updateBackdrop(simSpeed: number, dt: number): void {
    const w = this.world;
    w.grid.position.z += simSpeed * 2.5 * dt;
    if (w.grid.position.z > 20) w.grid.position.z -= 20;
    w.terrain.position.z += simSpeed * 2.5 * dt;
    if (w.terrain.position.z > 20) w.terrain.position.z -= 20;

    const starAttr = w.stars.geometry.getAttribute('position') as THREE.BufferAttribute;
    const stars = starAttr.array;
    const starSpeed = (this.overdrive ? simSpeed * 18 : simSpeed * 2.5) * dt;
    for (let i = 2; i < stars.length; i += 3) {
      const z = (stars[i] ?? 0) + starSpeed;
      stars[i] = z > 200 ? -1800 : z;
    }
    starAttr.needsUpdate = true;

    const speedRatio = Math.max(0, (simSpeed - 4.2) / (SPEED_OVERDRIVE - 4.2));
    const lines = w.speedLines;
    lines.material.opacity = THREE.MathUtils.lerp(
      lines.material.opacity,
      this.overdrive ? 0.65 : speedRatio * 0.35,
      0.1 * dt,
    );
    if (lines.material.opacity > 0.02) {
      const attr = lines.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array;
      const step = simSpeed * 12 * dt;
      for (let i = 2; i < arr.length; i += 6) {
        const z = (arr[i] ?? 0) + step;
        if (z > 30) {
          const reset = -380 - Math.random() * 60;
          arr[i] = reset;
          arr[i + 3] = reset + 14 + Math.random() * 24;
        } else {
          arr[i] = z;
          arr[i + 3] = (arr[i + 3] ?? 0) + step;
        }
      }
      attr.needsUpdate = true;
    }

    for (let i = this.fireTrails.length - 1; i >= 0; i--) {
      const f = this.fireTrails[i];
      if (!f) continue;
      f.mesh.position.z += simSpeed * 3.0 * dt;
      f.life -= 0.016 * dt;
      f.mesh.material.opacity = Math.max(0, f.life);
      if (f.life <= 0 || f.mesh.position.z > OFFSCREEN_Z) {
        f.mesh.visible = false;
        this.pools.fireTrails.push(f);
        this.fireTrails.splice(i, 1);
      }
    }

    if (this.state === 'PLAYING' && Math.random() < (this.overdrive ? 0.18 : 0.002) * dt) {
      w.lightning.intensity = Math.random() * 6 + 4;
      this.cancelTimer('lightningTimer');
      this.lightningTimer = setTimeout(() => {
        w.lightning.intensity = 0;
        this.lightningTimer = null;
      }, 55);
    }
  }

  private updateRun(simSpeed: number, dt: number): void {
    const w = this.world;
    const { car, camera } = w;
    const root = car.root;

    if (this.shield) {
      car.shieldDome.rotation.y += 0.04 * dt;
      car.shieldDome.material.opacity = 0.28 + Math.sin(Date.now() * 0.008) * 0.12;
    }

    if (this.invulnerable > 0) {
      this.invulnerable -= dt;
      root.visible = this.overdrive || Math.floor(this.invulnerable) % 8 < 4;
    } else {
      root.visible = true;
    }

    if (this.overdrive) {
      this.overdriveTimer -= dt;
      this.speed = THREE.MathUtils.lerp(this.speed, SPEED_OVERDRIVE, 0.1 * dt);
      camera.fov = THREE.MathUtils.lerp(camera.fov, 132, 0.08 * dt);
      w.stars.material.size = 3.2;
      w.tunnel.material.opacity = THREE.MathUtils.lerp(w.tunnel.material.opacity, 0.55, 0.06 * dt);
      w.tunnel.rotation.y += 0.05 * dt;
      this.hud.setOverdriveRemaining(this.overdriveTimer / OVERDRIVE_DURATION);
      if (Math.floor(this.overdriveTimer) % 3 === 0) this.spawnFireTrail(root.position.x, root.position.z);

      if (this.overdriveTimer <= 0) {
        this.overdrive = false;
        this.invulnerable = 60;
        this.hud.setOverdrive(false);
        w.bloom.strength = BLOOM_NORMAL;
        w.stars.material.size = 0.9;
        this.hud.setFlux(this.plutonium, false);
      }
    } else {
      const targetSpeed = Math.min(MAX_SPEED_NORMAL, BASE_SPEED + this.score * 0.00016);
      this.speed = THREE.MathUtils.lerp(this.speed, targetSpeed, 0.05 * dt);
      camera.fov = THREE.MathUtils.lerp(camera.fov, 75 + this.speed * 1.6, 0.05 * dt);
      w.tunnel.material.opacity = THREE.MathUtils.lerp(w.tunnel.material.opacity, 0, 0.1 * dt);
    }
    camera.updateProjectionMatrix();

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 1;
        this.hud.setCombo(1, false);
      }
    }

    this.score += simSpeed * 0.35 * this.combo * dt;
    this.hud.setScore(this.score);
    this.hud.setSpeed(speedToMph(this.speed, this.overdrive));
    this.audio.setEngine(this.speed, this.jumping);

    if (this.steering.left) this.carVelocityX -= CAR_ACCEL * dt;
    if (this.steering.right) this.carVelocityX += CAR_ACCEL * dt;
    this.carVelocityX *= Math.pow(CAR_FRICTION, dt);
    root.position.x += this.carVelocityX * dt;
    if (Math.abs(root.position.x) > CAR_MAX_X) {
      root.position.x = Math.sign(root.position.x) * CAR_MAX_X;
      this.carVelocityX = 0;
    }

    if (this.jumping) {
      root.position.y += this.carVelocityY * dt;
      this.carVelocityY -= GRAVITY * dt;
      if (root.position.y <= 0) {
        root.position.y = 0;
        this.jumping = false;
        this.play('land');
        this.screenShake = 0.25;
      }
    } else {
      root.position.y = Math.sin(Date.now() * 0.015 * this.speed) * 0.06;
    }

    const hoverTarget = this.jumping ? Math.PI / 2 : 0;
    for (const wheel of car.wheels) {
      wheel.group.rotation.z = THREE.MathUtils.lerp(wheel.group.rotation.z, hoverTarget * wheel.fold, 0.22 * dt);
      wheel.glow.material.opacity = THREE.MathUtils.lerp(
        wheel.glow.material.opacity,
        this.jumping ? 0.92 : 0,
        0.22 * dt,
      );
    }

    root.rotation.z = -this.carVelocityX * 0.24;
    root.rotation.y = -this.carVelocityX * 0.14;
    car.shadow.position.x = root.position.x;
    car.shadow.material.opacity = this.jumping ? 0.28 : 0.9;
    car.box.setFromObject(root).expandByScalar(-0.44);

    this.updateTrails();
    this.updateSpawns(dt);
    this.updateObstacles(dt);
    this.updateCollectibles(dt);
    this.updateCamera(dt);
  }

  private updateTrails(): void {
    const { car, trails } = this.world;
    const root = car.root;
    const tY = this.jumping ? root.position.y + 0.35 : 0.22;
    const sides = [
      { points: trails.left, geometry: trails.geomLeft, x: -1.35 },
      { points: trails.right, geometry: trails.geomRight, x: 1.35 },
    ];
    for (const side of sides) {
      const recycled = side.points.pop() ?? new THREE.Vector3();
      recycled
        .copy(this.trailPoint.set(side.x, root.position.y + 0.35, root.position.z + 1.8))
        .applyMatrix4(root.matrixWorld);
      side.points.unshift(recycled);

      const attr = side.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array;
      side.points.forEach((p, i) => {
        arr[i * 3] = p.x;
        arr[i * 3 + 1] = THREE.MathUtils.lerp(arr[i * 3 + 1] ?? 0, tY, 0.5);
        arr[i * 3 + 2] = p.z + i * 2.1;
      });
      attr.needsUpdate = true;
    }
    trails.material.opacity = this.jumping ? 0.35 : 0.9;
  }

  private updateSpawns(dt: number): void {
    this.spawnCooldownObs -= this.speed * dt;
    if (this.spawnCooldownObs <= 0) {
      this.spawnObstacle();
      this.spawnCooldownObs = Math.max(24, 65 - this.speed * 4.5 + Math.random() * 25);
    }
    this.spawnCooldownCol -= this.speed * dt;
    if (this.spawnCooldownCol <= 0) {
      this.spawnCollectible();
      this.spawnCooldownCol = 42 + Math.random() * 38;
    }
  }

  private updateObstacles(dt: number): void {
    const { car } = this.world;
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      if (!obs) continue;
      const pos = obs.group.position;
      pos.z += this.speed * 3.5 * dt;

      if (obs.vx !== 0) {
        pos.x += obs.vx * dt;
        const limit = CAR_MAX_X - obs.width / 2;
        if (pos.x > limit || pos.x < -limit) obs.vx *= -1;
      }

      obs.box.setFromObject(obs.group);
      if (car.box.intersectsBox(obs.box)) {
        this.handleCollision(obs, i);
        if (this.state !== 'PLAYING') return;
        continue;
      }

      if (!obs.nearMissed && !this.overdrive && pos.z > -1.5 && pos.z < 3.5) {
        const lateral = Math.abs(car.root.position.x - pos.x) - (obs.width * 0.5 + 1.25);
        const jumpedOver = this.jumping && car.root.position.y > 2.1 && lateral < 0.8;
        if ((lateral >= 0 && lateral < 1.65) || jumpedOver) {
          obs.nearMissed = true;
          const bonus = 150 * this.combo;
          this.score += bonus;
          this.addPlutonium(12);
          this.play('nearmiss');
          this.hud.showCallout(jumpedOver ? `HOVER OVER +${bonus}!` : `NEAR MISS +${bonus}!`, 'var(--neon-blue)');
        }
      }

      if (pos.z > OFFSCREEN_Z) this.retireObstacle(i);
    }
  }

  private updateCollectibles(dt: number): void {
    const { car } = this.world;
    for (let i = this.collectibles.length - 1; i >= 0; i--) {
      const item = this.collectibles[i];
      if (!item) continue;
      const obj = item.object;
      obj.position.z += this.speed * 3.5 * dt;

      if (item.type === 'ring') {
        obj.rotation.z += 0.14 * dt;
        obj.rotation.x += 0.07 * dt;
      } else if (item.type === 'shield') {
        obj.rotation.y += 0.12 * dt;
        obj.rotation.x += 0.08 * dt;
      } else {
        obj.rotation.y += 0.35 * dt;
      }

      item.box.setFromObject(obj);
      const collected = car.box.intersectsBox(item.box);
      if (collected) this.collect(item.type);
      if (collected || obj.position.z > OFFSCREEN_Z) {
        obj.visible = false;
        this.pools.collectibles.push(item);
        this.collectibles.splice(i, 1);
      }
    }
  }

  private collect(type: CollectibleType): void {
    if (type === 'boost') {
      this.engageOverdrive();
    } else if (type === 'shield') {
      this.setShield(true);
      this.score += 300 * this.combo;
      this.play('shield');
      this.hud.showCallout('ESCUDO TEMPORAL ATIVO!', 'var(--neon-green)');
    } else {
      this.score += 250 * this.combo;
      this.combo = Math.min(this.combo + 1, MAX_COMBO);
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.comboTimer = COMBO_WINDOW;
      this.addPlutonium(16);
      this.hud.setCombo(this.combo, true);
      this.play('coin');
    }
  }

  private updateCamera(dt: number): void {
    const { camera, car } = this.world;
    const root = car.root;
    const camTargetX = root.position.x * 0.42;
    camera.position.x += (camTargetX - camera.position.x) * 0.12 * dt;

    let shakeX = 0;
    let shakeY = 0;
    if (this.screenShake > 0) {
      shakeX = (Math.random() - 0.5) * this.screenShake;
      shakeY = (Math.random() - 0.5) * this.screenShake;
      this.screenShake *= Math.pow(0.86, dt);
      if (this.screenShake < 0.04) this.screenShake = 0;
    }
    const vibration = this.speed > 5.5 && !this.jumping ? (Math.random() - 0.5) * 0.14 : 0;

    camera.position.y = 5.4 + (this.jumping ? root.position.y * 0.42 : 0) + shakeY + vibration;
    camera.position.x += shakeX;
    camera.lookAt(camTargetX * 0.25, 2.4 + (this.jumping ? root.position.y * 0.48 : 0), -65);
    camera.rotation.z = -this.carVelocityX * 0.045;
  }

  private updateEffects(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (!p) continue;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.y -= 0.32 * dt;
      if (p.mesh.position.y < -5) {
        p.mesh.visible = false;
        this.pools.particles.push(p);
        this.particles.splice(i, 1);
      }
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      if (!s) continue;
      s.scale += 1.6 * dt;
      s.mesh.scale.setScalar(s.scale);
      s.life -= 0.07 * dt;
      s.mesh.material.opacity = Math.max(0, s.life);
      if (s.life <= 0) {
        this.disposeShockwave(s);
        this.shockwaves.splice(i, 1);
      }
    }
  }
}
