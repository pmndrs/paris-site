# Paris workshop mini-site

Advanced React Three Fiber — the PMNDRS workshop at Gobelins, Paris, September 8–9 2026.

Next.js 16 (App Router) · Tailwind v4 · shadcn/ui · React Three Fiber v9
(v10 pending — see below).

```sh
npm run dev     # http://localhost:3000
npm run build
npm run lint
```

## Planning docs

| Doc | What it is |
| --- | --- |
| [SPEC.md](SPEC.md) | What's left to build: Notion content sync, the motion layer, the 3D/shader plan, open decisions. |
| [CONTENT.md](CONTENT.md) | Per-section copy outlines, and where the site currently disagrees with Notion. **Read §1 first.** |

Workshop facts live in the pmndrs Notion workspace under
[🧊 R3F Workshop — Paris](https://app.notion.com/p/5870baf602168314b53701894049e9b3);
`lib/content.ts` is downstream of it.

## Where things are

| Path | What it is |
| --- | --- |
| `app/page.tsx` | The site. Server components throughout except the header and hero. |
| `components/motion/reveal.tsx` | Scroll reveal — one shared observer, `data-reveal` on children. |
| `app/mobile-preview/` | Dev harness — the live app framed at fixed sizes. |
| `components/hero/` | The R3F scene: `paris-scene` (lights/fog/camera), `tower`, `city`, `stars`. |
| `components/sections/` | One component per content section, all server-rendered. |
| `lib/content.ts` | Every string on the site. |
| `lib/time-of-day.ts` | The sky model shared by the DOM gradient and the 3D lighting. |
| `reference/` | The original static HTML port this was converted from. Not built. |

## The hero

The hero is a live R3F scene: a lattice tower in a low block city, with a
time-of-day scrubber that drives sun position, ambient and fill colour, fog,
window emissive, and the star field.

**The wordmark interleaves with the tower.** That effect is the whole point of
the original design, and it survives the move to 3D by layering:

```
z-0    CSS sky gradient          (DOM — must sit behind the type)
z-10   P · N · R                 (DOM)
z-20   <Canvas> transparent      (tower, city, stars)
z-30   M · D · S                 (DOM)
```

The canvas has `alpha: true` and no scene background, so the back half of the
wordmark shows through wherever there is no geometry, and the tower occludes it
wherever there is. The sky stays in the DOM rather than in the scene precisely so
it can be painted *behind* the type.

Two consequences worth knowing if you change the scene:

- **Fog colour is not the sky's bottom stop.** It is blended ~72% toward the mid
  stop, to match the CSS gradient at the height the horizon actually lands on.
  Using the bottom stop makes distant blocks fade to black against a blue sky.
- **There is no ground plane.** A lit plane draws a hard horizon line straight
  across the transparent canvas. Without it, the rooflines are the horizon and
  the CSS sky shows through the gaps.

Scale is deliberate: blocks top out around 4 units against the tower's 10, they
are excluded from a plaza around the base and from the corridor between camera
and tower, so nothing crosses in front of the subject.

The scene stops rendering when the hero scrolls out of view (IntersectionObserver
→ `frameloop="demand"`), which also keeps the preview page's iframes affordable.
`prefers-reduced-motion` drops the camera drift. Without WebGL, the `Canvas`
`fallback` renders the original static tower plate in the same position.

## React Three Fiber

Currently on **v9.7.0** with `@react-three/drei@10.7.8` — the stable pairing.

### Why not v10 yet

`@react-three/fiber@10.0.0-alpha.2` fails to build under Turbopack:

```
Export WebGLCubeRenderTarget doesn't exist in target module
./node_modules/@react-three/fiber/dist/index.mjs
The export WebGLCubeRenderTarget was not found in
  node_modules/three/build/three.webgpu.js
```

Cause: alpha.2's main entry (`dist/index.mjs`) statically imports from **both**
`three` and `three/webgpu`. three's exports map sends `three/webgpu` to
`build/three.webgpu.js`, which does not export `WebGLCubeRenderTarget` (only
`WebGLRenderTarget`) — `three.module.js` does. The package already has a separate
`./webgpu` entry point, so the static `three/webgpu` import from the default entry
looks unintended.

### Swapping back to v10

```sh
npm i @react-three/fiber@10.0.0-alpha.3 @react-three/drei@^11.0.0-alpha.5
```

drei 11 is the line that peers `@react-three/fiber >= 10`; drei 10.x targets v9
and will not resolve against it. Then two call sites change, both in
`components/hero/`:

- **`paris-scene.tsx` and `stars.tsx`** — v10 flattens timing onto the frame
  state, so `state.clock.elapsedTime` becomes `state.elapsed`. There is no
  `state.clock` on v10's `FrameNextState`.
- **`stars.tsx`** — v10's `useFrame` takes scheduler options instead of a numeric
  priority, so the shimmer can go back to `useFrame(cb, { fps: 24 })` rather than
  burning a full-rate slot. v9's second argument is `renderPriority: number`.

Nothing else in the scene is version-specific: `attach="material-N"`, the
instanced meshes, and the `Canvas` `fallback` prop are the same on both, and both
versions augment the global JSX namespace so `<mesh>` types without an import.

## Lint

Next 16 ships the React Compiler's `react-hooks` rules. `react-hooks/immutability`
and `react-hooks/refs` are disabled for `components/hero/**` only — R3F drives
three.js *by* mutating renderer-owned objects every frame, which those rules
correctly flag for React state and incorrectly flag here. The rest of the app is
held to the full rule set; `npm run lint` is clean.

## Concept images are placeholders

`public/concept/*.png` are generated stand-ins, not the originals. The real files
live in the Claude Design project but exceed the design MCP's 256 KiB read cap, so
they come back truncated. Filenames and dimensions match the originals exactly —
export the real ones over the top and nothing else changes.
`reference/tools/gen-concept-art.py` rebuilds the stand-ins.

They are only used in three places now (the overview plate, the closing band, and
the no-WebGL hero fallback); the hero's tower and city are 3D.

## Status

Build, typecheck, and lint pass. Verified in headless Chrome at 390 / 768 / 1024 /
1440 px: no horizontal overflow, scroll-spy and progress rail correct, accordion
correct, and the time-of-day scrubber drives the scene through all four phases.
