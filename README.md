# Sunset Race — DeLorean Time Machine 88 MPH

A synthwave 3D endless runner set in the _Back to the Future_ universe. Drive the DeLorean, dodge barriers, collect plutonium rings and hit 88 MPH to jump between eras (1985, 2015, 1955, 2077 and 1885). Everything — the car, the world and the soundtrack — is generated procedurally in the browser with [Three.js](https://threejs.org/) and the Web Audio API.

It is a fully static site: there is no backend, no API, no account system and **no environment variables**. The production build is a folder of HTML, JS, CSS and font files that any static host can serve.

## Quick start

Requires Node.js 22 or newer.

```bash
npm ci
npm run dev        # http://localhost:5173
```

Or run the production image:

```bash
make docker-run    # http://localhost:8080
```

## Controls

| Action                   | Keyboard            | Touch                   |
| ------------------------ | ------------------- | ----------------------- |
| Steer                    | `←` `→` / `A` `D`   | Hold the ◀ ▶ buttons    |
| Hover jump               | `Space` / `↑` / `W` | ▲ button or swipe up    |
| Flux capacitor (at 100%) | `Shift` / `E`       | ⚡ button or swipe down |
| Pause / resume           | `Esc` / `P`         | ⏸ button                |
| Mute                     | `M`                 | 🔊 button               |

Near misses and hovering over barriers score bonus points and charge the flux capacitor; rings build a combo multiplier; the green orb gives a one-hit shield. The game pauses itself when the tab is hidden.

## Architecture

```
index.html              Markup for the canvas host, HUD and menus (no inline scripts or styles)
src/main.ts             Entry point: fonts, WebGL detection, storage and audio wiring
src/styles.css          HUD, menus and animations
src/config/             Era palettes and physics constants
src/core/               Pure, unit-tested logic: storage, input mapping, formatting, WebGL probe
src/audio/synth.ts      Procedural soundtrack, engine and effects with an explicit run lifecycle
src/game/scene.ts       Three.js world: renderer, bloom, sun, city, road, procedural DeLorean
src/game/hud.ts         Typed access to every HUD element
src/game/game.ts        Game state machine, main loop, spawning, collisions and object pools
security-headers.json   Single source of truth for the CSP and security headers
deploy/nginx.conf       Production web server config (non-root nginx on :8080)
```

Design notes:

- **State machine.** `SunsetRace` moves between `MENU → PLAYING ⇄ PAUSED → GAMEOVER`. The loop runs on `renderer.setAnimationLoop`, is frame-rate independent (delta clamped to 50 ms) and keeps the attract-mode backdrop animating behind menus.
- **Pooling.** Obstacles, collectibles, particles and fire trails are recycled instead of reallocated; shared geometries and materials are created once. Replaced sun textures and expired shockwave materials are disposed so GPU memory stays flat across time jumps.
- **Input.** Steering is tracked per source (each key and each touch button), so releasing one source never cancels another, and all input is released on window blur, `touchcancel`, pause and game over.
- **Audio.** The audio graph is created on the first user gesture and reused. `startRun` / `pause` / `resume` / `endRun` drive the engine, hover hum and sequencer, so sound comes back on every restart.
- **Resilience.** Blocked or full `localStorage` (private mode, sandboxed iframes, disabled cookies) falls back to an in-memory high score. Without WebGL the game shows an explanatory screen instead of crashing.

## Security

- Every dependency (Three.js and the Orbitron / VT323 fonts) is bundled from npm; the page makes no third-party requests.
- A strict Content Security Policy (`default-src 'self'`, no `unsafe-inline` or `unsafe-eval`) is sent by nginx and `vite preview`, and is also embedded as a `<meta>` tag in the build for static hosts that cannot set headers. `frame-ancestors`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and the cross-origin isolation headers come from `security-headers.json`; a unit test fails if `deploy/nginx.conf` drifts from it.
- The container runs as the unprivileged `nginx` user, hides the server version and does not serve source maps.

## Scripts

| Command                 | What it does                                                                    |
| ----------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`           | Vite dev server with hot reload                                                 |
| `npm run build`         | Type-check and build to `dist/`                                                 |
| `npm run preview`       | Serve `dist/` with the production security headers                              |
| `npm run lint`          | ESLint (strict type-checked rules, zero warnings allowed)                       |
| `npm run typecheck`     | `tsc --noEmit` in strict mode                                                   |
| `npm test`              | Vitest unit tests                                                               |
| `npm run test:coverage` | Unit tests with a 95% coverage gate on `src/core`, `src/config` and `src/audio` |
| `npm run test:e2e`      | Playwright smoke tests against the production build                             |
| `npm run check`         | Everything CI runs except the browser tests                                     |

`make` wraps the same commands (`make check`, `make e2e`, `make docker-build`, `make docker-run`). Run `npx playwright install --with-deps chromium` once before the first `npm run test:e2e`.

## Testing

- **Unit (Vitest):** storage fallbacks, key and swipe mapping, multi-source steering, era selection, HUD formatting, the WebGL probe, the full audio lifecycle against a fake `AudioContext`, and header/nginx consistency.
- **End to end (Playwright, Chromium):** boot under the CSP with zero console errors and zero third-party requests, racing, pause/resume by button and keyboard, restart, auto-pause on hidden tab, blocked `localStorage`, and the no-WebGL fallback.

## Deployment

CI (`.github/workflows/ci.yml`) runs `npm audit`, formatting, lint, type checks, coverage, the build and the Playwright suite on every push and pull request, then builds the Docker image and checks that it serves the security headers.

- **Container:** `docker build -t sunset-race . && docker run -p 8080:8080 sunset-race`.
- **Static host** (GitHub Pages, Netlify, Cloudflare Pages, S3): upload `dist/`. The build uses relative asset paths, so it works from a sub-path. Configure the headers from `security-headers.json` on the host if it supports custom headers; the CSP meta tag covers the rest.

## Browser support

Any current browser with WebGL and ES2022 support (Chrome, Edge, Firefox, Safari 16+). Audio starts after the first click or tap, as browsers require.
