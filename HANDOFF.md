# Handoff — hero demo

For an agent that **can drive Chrome and see the page**. I could not. Everything
below marked "verified" means typecheck + lint + production build + HTTP 200.
Nothing here has been verified by looking at pixels except where it says a human
looked. That distinction is the reason this handoff exists.

## Where the plans are

- **[`HERO-DEMO-SPEC.md`](./HERO-DEMO-SPEC.md)** — the plan of record. Read it
  first. Stage definitions, the ground-truth table of what was actually checked
  vs assumed, the perf analysis of Faraz's demo, the upstream bug write-ups
  (issue-ready), and the open questions.
- **[`SPEC.md`](./SPEC.md)** — the parent site's spec, on `main`. Explains the
  R3F v10 multi-canvas architecture, the two documented alpha workarounds, and
  the constraints the demo will have to satisfy when it folds back into
  `components/hero/`. Not this branch's plan, but the destination.
- **`git log`** on this branch — each stage commit message carries the reasoning
  and the measurements. They are long on purpose.

## State

- Worktree `/Users/dex/Developer/paris-mini-site-hero`, branch `hero-demo`,
  4 commits on top of `main@0a6fa04`. Tree is clean.
- Dev server: `pnpm next dev -p 3111` → http://localhost:3111/hero-demo
- **pnpm**, not yarn (something ran `pnpm install` mid-session; the branch
  followed). `pnpm-lock.yaml` is gitignored since the repo's committed lock is
  `yarn.lock` — unresolved, flagged in the spec.
- **Do not run `next build` while the dev server is up in this worktree.** It
  disturbs `node_modules`/`.next` and kills the server, then Next refuses to
  restart because of stale dev state. Fix: `rm -rf .next` and restart.

### Stage status

| Stage | What | State |
|---|---|---|
| 0 | Port Faraz's Paris demo to R3F v10 / WebGPU | Human-confirmed rendering. Bloom **was working here**. |
| 1 | `@pmndrs/sky` — real solar position, IBL, haze | Renders, but **bloom and haze both missing** |
| 2 | `@pmndrs/upscaler` (FSR3) as sole temporal resolver | Not started |
| 3 | `SSGINode` + denoise under FSR3 | Not started |

## The bug you're here for

**Bloom and haze do not appear.** Bloom demonstrably worked at Stage 0 and
stopped at Stage 1. Haze has never been seen working.

### Prime suspect — check this first, it's one line

`useRenderPipeline` wraps **both** callbacks in a try/catch that swallows any
throw into a `console.warn` and leaves `outputNode` as the raw scene pass:

```js
// node_modules/@react-three/fiber/dist/webgpu/index.mjs:16040
} catch (error) {
  console.warn("[useRenderPipeline] Setup failed; the render pipeline was not configured:", error);
}
```

**So: open the console and search for `[useRenderPipeline] Setup failed`.** If it
is there, the attached error is the whole answer, and the symptom set — scene
renders fine, no bloom, no AO, no haze, no toggle does anything — is exactly what
a swallowed throw in `mainCB` produces. I could not read the console, which is
why this is still open.

Likely throw sites inside `components/hero-demo/fx.tsx`:

1. `scenePass.getTextureNode("emissive")` — if the MRT attachment isn't there.
   The MRT is built conditionally with object spreads; confirm `emissive`
   actually lands in it.
2. `sky.applyHaze(graph, { scenePass, policy })` — I pass an already-composited
   node, not `scenePass.getTextureNode()` as every sky example does. If applyHaze
   requires the raw pass texture node, this throws or silently misbehaves. **Try
   passing `scenePass.getTextureNode()` to isolate.**
3. `graph.rgb.mul(...)` / `TSL.vec4(graph.rgb, graph.a)` — if `graph` is a node
   type without `.rgb`/`.a` at that point in the chain.

### Second suspect — ordering

`sky.applyHaze` is composed **after** bloom and AO and **before** TRAA. If
applyHaze returns a node built from the scene pass rather than from the node it
was handed, it silently discards bloom — which would explain both symptoms with
one cause. Bisect with `sky/haze → haze: off`; if bloom returns, that's it, and
it's an upstream finding about `applyHaze`, not a wiring mistake.

### Known-good bisect path

The Leva panel is built for exactly this. `post` has `postFx`, `velocity`, `ao`,
`bloom`; `debug` has `buildings`, `tower`, `environment`, `shadows`; `sky` has
`skyEnabled`. Turning `skyEnabled` off returns the scene to the Stage 0
configuration where bloom worked — that's the cleanest A/B.

## Also open

**A WebGPU validation error, never diagnosed:**

```
Binding size for [Buffer "bindingBufferundefined_UniformBuffer_14_(vertex)"] is zero.
- While validating entries[7] ... visibility: ShaderStage::Vertex, buffer: {type: Uniform, minBindingSize: 0}
- While validating [BindGroupDescriptor "bindGroup_object"]
```

Object-scoped, vertex-stage, zero-byte uniform buffer. My hypothesis was the
`velocity` MRT attachment (it needs previous-frame model matrices per object, and
instanced batches / background meshes may not populate them) — untested. `post →
velocity` toggles it. May be harmless; WebGPU can keep drawing through validation
errors, so "looks fine" ≠ "gone".

**Sun disc blows out** to a hard-edged yellow blob at `exposure: 40`. Cosmetic;
`sky → sunDisc` and `exposure` are exposed. Nobody has tuned the look yet.

**Perf baseline never taken.** The whole staged plan is built on measuring each
stage against the last, and there is no Stage 0 number to compare to. The overlay
reports fps/ms. Note `drawCalls`/`triangles` read `renderer.info` *after* the
pipeline runs, so they describe the final present quad (1 draw, 1 tri), not the
scene — labelled `(final pass)` in the UI. Getting real scene counts needs
sampling before the pipeline renders.

## What burned time, so you don't repeat it

- **`camera-controls`' `fitToBox` is removed on purpose.** It cost three separate
  bugs: padding is in **world units** (not pixels), it **snaps polar to the
  nearest 90°** mid-fit (`camera-controls.module.js:1628`), and it produced a
  **NaN distance** from a camera whose `aspect` wasn't set yet, which poisoned
  the camera to `[NaN, NaN, NaN]` permanently. `camera.tsx` now does the framing
  maths directly with finite-checks on every value. Don't "simplify" it back.
- **Two `makeDefault` cameras.** The original paired `<CameraControls makeDefault>`
  with `<PerspectiveCamera makeDefault>`; controls can bind to a camera that
  isn't rendered, so `fitToBox` succeeds and nothing moves. There is now exactly
  one camera — the Canvas's. Clip planes are set imperatively because `<Canvas
  camera={{}}>` props apply only at creation and don't track `worldScale`.
- **`@pmndrs/sky` is vendored, not linked.** `pnpm sync:sky` copies the sky
  checkout's `dist/` into `vendor/pmndrs-sky/`. **Re-run it after every `pnpm
  build` in the sky repo.** Linking the checkout directly does not work: a linked
  directory keeps its own `node_modules`, so sky's imports resolved to *its* R3F
  (canary) and *its* three — two copies, which splits the TSL node registry and
  breaks `instanceof` — and then hard-failed on `WebGLCubeRenderTarget`. Turbopack
  `resolveAlias` can't reach into a linked subtree, and widening `turbopack.root`
  broke the existing Inspector alias. Don't retry any of that.
- **World scale is not arbitrary.** Sky reads `camera.position.y` as **metres**
  (`SkyAtmosphereBaker.ts:289`). `world → worldScale` (default 5) puts the tower
  near its real 330 m and the city at ~2 km, which is where aerial perspective is
  a physical quantity rather than something to fake with `hazeStrength`.

## Upstream fixes made in the sky checkout — uncommitted, need review

In `/Users/dex/Developer/SebH-TSL-Sky` (branch `feat/pmndrs-monorepo`), **not
committed** — Dennis's call:

1. `build.config.ts` — added `jsx: 'automatic'`. esbuild does not inherit
   `jsx: "react-jsx"` from tsconfig and defaults to the classic transform, so
   `dist/react.mjs` called `React.createElement` while the source never imports
   React. **The `./react` entry as built had never worked** — every consumer got
   `ReferenceError: React is not defined`. Invisible because `dist/` is
   gitignored and the published `tsl-sky@0.1.4` is an older shape with no `dist`.
2. `src/react/Sky.tsx` — imports `@react-three/fiber/webgpu` instead of the
   WebGL root entry.

A third, **not fixed**: the React bindings never call
`updateAerialPerspective()`. `<Sky>`'s `useFrame` calls `sky.update(camera)` →
`baker.update()`, which refreshes transmittance/multi-scatter/sky-view but
[explicitly not AP](../SebH-TSL-Sky/src/sky/SkyAtmosphereBaker.ts) (line 460);
`<AutoHaze>` doesn't either; the vanilla README does. Worked around by calling it
from `fx.tsx`'s `useFrame`. **This is a candidate cause for haze doing nothing —
verify the workaround actually fires.**

All three are written up issue-ready in `HERO-DEMO-SPEC.md`. `pmndrs/sky` exists
on GitHub but is **README-only** — code not pushed — so nothing was filed.

## Next, once bloom and haze are resolved

Stage 2 (FSR3) and Stage 3 (SSGI) are specced in `HERO-DEMO-SPEC.md`. The short
version, with the hard-won constraints from the upscaler repo's own examples:

- FSR3 becomes the **sole** temporal resolver — TRAA comes out, it does not
  layer. Two temporal resolvers ghost.
- `fx.tsx` is already shaped for this: the `useSky()` + `applyHaze` composition
  (rather than `<AutoHaze/>`) exists precisely so one callback owns `outputNode`
  and FSR3 can go last.
- SSGI is three's own `three/addons/tsl/display/SSGINode.js`, **not** part of
  `@pmndrs/upscaler`. Under FSR3, `ssgi.useTemporalFiltering` **must be off** —
  its per-frame pattern rotation defeats FSR3's variance clip and ghost-streaks
  off moving silhouettes. Use a static pattern + `DenoiseNode` and let FSR3
  converge the residual. Reference implementations:
  `/Users/dex/Developer/fsr3/examples/06-screenspace-gi` and `10-ssgi-denoise`
  (read their header comments — they document measured GPU results).
