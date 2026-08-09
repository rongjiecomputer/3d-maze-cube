# 3D Maze Cube

A browser game: a heavy steel ball falls through a 3D maze inside a cube. You don't move the
ball — you rotate the whole maze by dragging, and gravity does the rest.

## Stack

| Concern | Choice |
|---|---|
| Language | TypeScript, ESM, strict (`noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`) |
| Build | Vite 8 + `vite-plugin-wasm` + `vite-plugin-top-level-await` (both needed for Rapier's WASM) |
| Package manager | **pnpm** |
| Rendering | Three.js `WebGPURenderer` (`three/webgpu`) |
| Physics | Rapier 3D (`@dimforge/rapier3d`, WASM) |
| Audio | Tone.js, all procedural — there are no audio asset files |
| Deploy | Netlify, publish `dist` |

```bash
pnpm dev      # dev server on :5173
pnpm build    # tsc type-check, then vite build
pnpm preview  # serve the production build
```

**WebGPU is required — there is no WebGL fallback.** If `navigator.gpu` is missing the game will
not render.

## Layout

| Path | Role |
|---|---|
| `src/main.ts` | Everything except maze generation and audio: UI markup, physics world, scene, input, game loop |
| `src/maze.ts` | `HollowMaze3D` — recursive-backtracker maze generator |
| `src/audio.ts` | `GameAudio` — the whole audio graph and its gating rules |
| `src/impact.ts` | Pure DSP: renders the wood-knock waveform. No Tone import, so it runs under plain Node |
| `.claude/launch.json` | Dev-server config for the preview tooling |

`src/counter.ts` and the `Maze3D` class in `src/maze.ts` are unused leftovers.

## How it works

**Flow.** No route without `?size=N` shows a start screen; picking a size sets the query string and
reloads. `src/main.ts` is one long `async function init()` — UI is built with `innerHTML`, then the
physics world, scene, and a single `requestAnimationFrame` loop.

**Rotation.** A `TrackballControls` drives an off-screen `proxyCamera`. Each frame the maze's
quaternion slerps toward the *inverse* of that camera's rotation, so dragging feels like turning the
object rather than orbiting it. The maze is one kinematic Rapier body carrying every wall collider;
`setNextKinematicRotation` keeps physics in step with the visual.

**Ball.** A dynamic body, density 7000 (steel), restitution 0, CCD enabled, `canSleep` false.
Linear velocity is clamped to 10 at the end of each frame.

Physics steps **once per rendered frame** with no fixed-timestep accumulator, so simulation rate
follows display refresh rate.

## Audio

All sound is synthesized at runtime; there are no samples. Two layers, both routed through a master
gain into a limiter:

- **Impact** — a metal ball striking wood: a noise transient exciting damped, inharmonic wood modes
  plus a very short bright ring from the steel. Four variants are rendered into buffers once at
  startup, with stratified base frequencies so no two are alike, then played through an 8-voice
  round-robin pool with per-hit pitch jitter. Impact energy drives both level and a lowpass cutoff —
  soft taps are dull, hard hits are bright.
- **Rolling** — brown noise through a lowpass whose cutoff and gain track the ball's surface speed
  (`|angvel| * radius`) and whether it is touching anything. Ramped, never assigned, so it glides.

### Rules worth knowing before touching audio

- **Impact energy is the velocity lost across the physics step**, sampled *before* `world.step()` and
  compared after. Do not use post-step speed: restitution is 0, so a hard head-on hit ends up
  *slower* than a graze and loudness inverts.
- **Contact chatter is the enemy.** Rapier fires start/stop events every frame for a ball resting in
  a corner. Three gates suppress it: an energy floor (quiet contact belongs to the rolling layer, not
  a knock), a per-collider cooldown, and a global cooldown between impact clusters.
- **`beginFrame()` must be called once per frame before draining collision events.** It resets the
  per-frame hit budget. Do not infer frame boundaries from `Tone.now()` — it advances mid-frame.
- **Hits within one frame are one physical event** (a ball landing in a corner touches several walls
  at once), so they layer, staggered 2 ms apart. The stagger is also what prevents Tone's
  "Start time must be strictly greater than previous start time" error.
- **The audio toggle must ramp the master gain**, not just skip triggers — the rolling layer is
  continuous and would otherwise keep playing.
- Volume is a **linear** gain ramp, not `Tone.gainToDb`: `gainToDb(0)` is `-Infinity` and cannot be
  ramped to.
- `AudioContext` stays suspended until a real user gesture. `unlock()` shares its in-flight promise
  because `pointerdown` and the toggle's `click` can both fire in one interaction.

### Verifying audio changes

`src/impact.ts` is deliberately free of Tone imports so the waveform can be measured directly:

```bash
npx esbuild src/impact.ts --format=esm --outfile=/tmp/impact.mjs
```

Then in Node, check that peak is normalized and lands in the first millisecond, the first sample is
0 (no DC step), and the tail reaches silence before the buffer ends — a truncated decay is an audible
click on every hit.

`GameAudio`'s gating can be driven headlessly by bundling `src/audio.ts` with `--alias:tone=` a stub
and a fake clock, which is how the cooldown and per-frame-cap behaviour was checked.

## Gotchas

- `RAPIER.init` is guarded with `@ts-ignore`; the build prints an `IMPORT_IS_UNDEFINED` warning for
  it. Pre-existing and harmless.
- Maze size changes trigger a **full page reload** via the query string.
- Preferences persist in `localStorage`: `audioEnabled`, `audioVolume`.
- Several `@ts-ignore`s are load-bearing around Rapier and `three/webgpu` typings.
