# Hero Demo — spec

**Worktree:** `/Users/dex/Developer/paris-mini-site-hero` · branch `hero-demo` off `main@0a6fa04`
**Route:** `/hero-demo`
**Status:** spec drafted, nothing built yet.

## What this is

A lab. It exists to prove three things can run together at framerate on a
conference laptop:

1. **`@pmndrs/sky`** replacing the hero's hand-rolled sky system (CSS gradient +
   `fogExp2` + `<Stars>` + the `lib/time-of-day.ts` keyframe lerp).
2. **Faraz's Paris scene** from `/Users/dex/Developer/threejs-conf-pmndrs`,
   converted from R3F v9 / three 0.184 / Vite to v10 / 0.185 / Next, and made fast.
3. **`@pmndrs/upscaler`** (FSR3) plus three's **`SSGINode`**, for upscaling and
   screen-space GI.

It is deliberately **not** built under the shipped hero's constraints. No
multi-canvas, no `id="main"` primary, no `alpha: true` wordmark sandwich, no
`DepthAttachmentSync`. Own `<Canvas>`, own page, Leva panel for everything. When
a stage proves out, it gets ported into `components/hero/` as a separate piece of
work — and that port is where the site constraints get re-applied.

The corollary: **do not** import anything from `/hero-demo` into the real hero,
and do not refactor `components/hero/**` from this branch. One-way street until
the fold-back.

## Ground truth (verified, not assumed)

Checked against the actual installed packages in this worktree.

| Claim | Verdict |
|---|---|
| `@pmndrs/sky` is on npm under that name | **No.** npm has `tsl-sky@0.1.4`; `@pmndrs/sky` 404s. Local repo is already renamed. |
| R3F alpha.3 lacks `useRenderPipeline`, so `<AutoHaze>` won't work | **False.** alpha.3 exports it from `/webgpu`. The README caveat was about alpha.2. `<AutoHaze>` is available. |
| `@pmndrs/sky/react` uses `@react-three/fiber`, our app uses `@react-three/fiber/webgpu` — two bundles, two contexts, `useThree()` returns null | **False, and by design.** Both entries do `globalThis[Symbol.for("@react-three/fiber.context")] ?? createContext(null)`. Shared. `<Sky>` sees our webgpu Canvas. |
| …but it's free | **No.** `dist/index.mjs` (the root entry `@pmndrs/sky/react` pulls in) is a **separate 668 KB bundle** that `import`s `three` for `WebGLRenderer` — i.e. the WebGL three build lands in our graph, which `SPEC.md` explicitly tells us to avoid. See *Upstream fix 1*. |
| SSGI ships in `@pmndrs/upscaler` | **No.** SSGI is three's own `three/addons/tsl/display/SSGINode.js`, already present in our three 0.185.1. The upscaler contributes FSR3 + the temporal-guides bundle. |
| drei 11.0.0-alpha.5 has what Faraz's scene needs | `CameraControls`, `Text3D`, `Environment`, `useGLTF` all present; there is a `./webgpu` entry to prefer. `ContactShadows` is absent from the root types — irrelevant, he ships his own TSL version. |

## Why Faraz's demo is slow

Read before touching it; the causes are specific and all in two files.

**[Buildings.tsx](/Users/dex/Developer/threejs-conf-pmndrs/src/Buildings.tsx)**

- `treeCount = 20000` instances of `<sphereGeometry args={[1]} />`. That default
  is 32×16 segments — **960 triangles each, ~19.2 M triangles of shrubbery**,
  every one `castShadow receiveShadow`.
- Both instanced meshes are `frustumCulled={false}` across a 400-unit radius, so
  the whole city is submitted from every camera angle.
- The tree loop computes `spread` and `height` and then **never applies them** —
  `dummy.scale.set(...)` is commented out at line 112. Every tree is a unit
  sphere. So the 19.2 M triangles are not even buying the variation the code
  intends.
- 10,300 boxes + 20,000 spheres all cast into a single 2048² shadow map whose
  ortho camera covers ±60 units of a ±400-unit city.

**[FX.tsx](/Users/dex/Developer/threejs-conf-pmndrs/src/FX/FX.tsx)**

- `pass(scene, camera)` is called **twice** (lines 19 and 27), with two different
  MRTs, purely to get `emissive` and `alpha` onto their own attachments. That is
  **the entire scene geometry rendered twice per frame** — on top of the shadow
  pass. Combined with the trees, that is the single biggest cost in the demo.
- Fix: one `pass`, one MRT carrying `output` + `emissive` + `normal` + `velocity`
  + alpha together.

Fixes, in the order they pay off:

1. Collapse the two scene passes into one MRT. *(No visual change. Should be
   close to a 2× win on geometry-bound frames.)*
2. Trees → `icosahedronGeometry` detail 0 or 1 (20–80 tris), and apply the scale
   the code already computes. *(~20× triangle reduction.)*
3. Trees stop casting shadows; keep receiving.
4. Fit the shadow camera to the near city, not the whole 400-unit disc.

**Correction to an earlier draft of this list:** "re-enable frustum culling" was
in it, and is wrong. Each of these is a *single* instanced mesh whose bounding
sphere spans the entire city, so culling is all-or-nothing and never fires while
the city is in frame. Turning it on looks like a fix and does nothing. Real
culling here means LOD rings, which is a bigger change than a port.

Measure after each. Do not do them as one commit.

## Stages

Each stage lands as its own commit and must be independently revertable, because
the whole point is being able to say which one cost the framerate.

### Stage 0 — port Faraz's scene to v10

Target: his scene rendering at `/hero-demo` on our stack, visually equivalent,
before any of the new libraries go in.

Conversion deltas:

- `@react-three/fiber` → `@react-three/fiber/webgpu`. Drop `extend(THREE as any)`
  and the async `gl={...}` factory; the webgpu entry auto-extends node materials
  and takes `renderer={{ antialias: false, ... }}`.
- `import.meta.env.BASE_URL` → plain `/` paths. Assets move to `public/hero-demo/`
  (**5.4 MB** `free__la_tour_eiffel.glb`, 312 KB `Geist_SemiBold.json`; the two
  cubemaps are ~1.1 MB each and are **dropped** — sky replaces them at Stage 1).
- `useThree(s => s.gl)` → `s.renderer`.
- His manual `new THREE.RenderPipeline(gl)` + `useFrame(pipeline.render, 1)` →
  the `useRenderPipeline` hook. This matters: it is what lets sky's `<AutoHaze>`
  and the upscaler node compose into the same graph instead of fighting over
  `outputNode`.
- drei imports from `@react-three/drei/webgpu` where available.
- The page must be client-only via `components/three/scenes.tsx`'s existing
  `next/dynamic({ ssr: false })` pattern — the webgpu entry touches
  `localStorage` at module scope.
- His vendored `SSAONode.js` (606 lines) comes over **unused and unwired** for
  now. Stage 3 decides between it, three's `GTAONode`, or nothing once SSGI is
  in. Don't port it into the graph just to delete it.
- `components/hero-demo/**` gets added to the eslint override that already
  exempts `components/hero/**` from `react-hooks/immutability` (uniform writes
  from `useFrame`).

Also at Stage 0: the perf fixes above. Record before/after numbers.

**Done when:** `/hero-demo` renders his scene, and we have a frame-time number to
regress against.

### Stage 1 — sky

Replace, in the demo only: `<Environment>` cubemap IBL, the solid `<color
attach="background">`, `fogExp2`, `<Stars>`, and the `time-of-day.ts` keyframe
lerp.

```tsx
<Sky preset="earth" timeOfDay={tod} latitude={48.86} /* Paris */>
  <AutoHaze />
</Sky>
```

- `latitude={48.86}`, and a `dayOfYear` for the conference date, so the sun arc
  is the real Paris one. That is a better story than four hand-tuned gradients
  and it is the reason to do this at all.
- Sky's aerial-perspective haze replaces `fogExp2` for distance falloff. This is
  the visual risk point: our fog was tuned against a CSS gradient and a
  400-unit city, and AP haze is physical, so the city will need re-scaling in
  world units or the haze will read as either absent or soup.
- `<SkyNight>` / procedural stars replace `components/hero/stars.tsx`.
- The demo keeps a Leva `timeOfDay` 0–24 control; the existing 0–100 slider
  mapping is a fold-back concern, not a lab one.

**Open:** sky sets `scene.background` and `scene.environment` in `attach()`. The
real hero is `alpha: true` with a CSS gradient and the wordmark showing through.
Those are in tension and the answer probably decides how the fold-back looks.
Not a Stage 1 blocker — the lab canvas is opaque.

**Done when:** the sun moves on a real Paris arc, the city hazes correctly at
distance, and frame time is within a known delta of Stage 0.

### Stage 2 — FSR3

```ts
post.outputNode = upscale(composedColor, depthNode, velocityNode, camera, { ratio: 2 })
```

- FSR3 becomes the **sole temporal resolver**. Faraz's `traa(...)` comes out —
  two temporal resolvers stacked is ghosting.
- `scenePass.setResolutionScale(0.5)`, `QualityMode.Quality` first, then A/B.
- Order with sky's haze matters: haze composites onto scene color, so it must
  land *before* the upscale node consumes `composedColor`. Both want to own
  `renderPipeline.outputNode`, so this is where `<AutoHaze />` gets dropped in
  favour of `useSky()` + a hand-composed graph — the README documents exactly
  this path.
- Leva toggle for FSR3 on/off and a render-scale slider, so the demo can *show*
  the upscale rather than just benefit from it.

**Done when:** half-res render, full-res present, no visible ghosting on the
tower silhouette under camera rotation, and a real ms win over Stage 1.

### Stage 3 — SSGI

From `three/addons/tsl/display/SSGINode.js`. The upscaler repo's examples 06 and
10 already paid for these lessons — take them as given:

- **`ssgi.useTemporalFiltering` must be OFF under FSR3.** SSGI rotates its
  sampling pattern per frame expecting a downstream TRAA; that swing defeats
  FSR3's variance clip and produces ghost streaks off moving silhouettes. Their
  most recent commit is literally `fix(examples): disable SSGINode temporal
  filtering under FSR3`.
- With rotation off, SSGI is grainy on its own. Use three's documented no-TRAA
  recipe: static pattern + `DenoiseNode`, and let FSR3 converge the residual.
- Their measured options: `builtin` (stable, soft/weak), `spatial`
  (`recurrentDenoise` as spatial-only à-trous — cleaner, but à-trous edge halos
  and step-lines on flat walls). Start `builtin`, A/B via Leva.
- SSGI + denoise run at **reduced** resolution inside the same graph FSR3
  upscales. That is the whole architectural argument for this combination.

**Done when:** GI is visibly doing something on the tower ironwork and the city
blocks at dusk, without ghosting, at a frame time we'd accept on stage.

### Stage 4 — decide

Write down what folds back into `components/hero/`, what stays a lab curiosity,
and what needs upstream fixes first.

## Upstream bugs found in `@pmndrs/sky`

All three are **release blockers** for the pmndrs publish, and all three were
found by being the library's first real external consumer. `pmndrs/sky` is
currently **README-only** — the code isn't pushed — so these are written up here
rather than filed. They should become issues verbatim once it is.

Fixes 1 and 2 are applied in the local checkout
(`/Users/dex/Developer/SebH-TSL-Sky`, branch `feat/pmndrs-monorepo`) but
**deliberately not committed there** — Dennis's call.

### 1. `./react` entry throws `React is not defined` (blocker)

`build.config.ts` sets only `esbuild: { target }`. esbuild does **not** inherit
`jsx: "react-jsx"` from `tsconfig.json`, and its own default is the classic
transform — so `dist/react.mjs` was emitted as:

```js
return /* @__PURE__ */ React.createElement(SkyContext.Provider, { value: sky }, children)
```

…while the source only imports hooks and types from `react`. Every consumer of
`<Sky>` gets a runtime `ReferenceError` on first render. The React entry, as
built, has never worked.

**Fix:** `jsx: 'automatic'` in the esbuild options. `dist/react.mjs` then opens
with `import { jsx } from 'react/jsx-runtime'`.

**Note:** `dist/` is gitignored, so this is invisible until someone builds and
consumes it. The published `tsl-sky@0.1.4` is an entirely different, older shape
(ships raw `src/*.js`, no `dist`), so npm doesn't reveal it either.

### 2. `src/react/Sky.tsx` imports R3F's WebGL root entry (blocker)

`import { useFrame, useThree } from '@react-three/fiber'`. Two problems:

- It drags R3F's ~670 KB root bundle *and* three's WebGL build into a
  WebGPU-only app.
- Consumed from a linked checkout it hard-fails: the root entry's
  `WebGLCubeRenderTarget` import doesn't exist in the `three.webgpu.js` that
  resolves there — `Export WebGLCubeRenderTarget doesn't exist in target module`.

**Fix:** import from `@react-three/fiber/webgpu`. Safe for consumers on either
entry, because both share one context object via
`globalThis[Symbol.for('@react-three/fiber.context')]`.

### 3. React bindings never refresh the aerial-perspective LUT

The AP LUT depends on camera position and orientation and must be re-rendered
every frame. Nothing in the React path does it:

- `<Sky>`'s `useFrame` calls `sky.update(camera)` → `baker.update()`, which
  refreshes transmittance / multi-scatter / sky-view but **explicitly not AP**
  (`SkyAtmosphereBaker.ts:460`).
- `<AutoHaze>` only assigns `outputNode`.
- The vanilla README *does* call it, in its animation loop.

So `<Sky><AutoHaze/></Sky>` renders haze against a stale LUT that never tracks
the camera. Worked around here by calling `sky.updateAerialPerspective()` from
the demo's own `useFrame` (`components/hero-demo/fx.tsx`).

**Fix:** call it from `<Sky>`'s `useFrame` when AP is enabled.

### Also

- **npm name** — `@pmndrs/sky` 404s; npm has only the older `tsl-sky`. Deploying
  `/hero-demo` anywhere other than this machine needs the publish, or the vendor
  directory committed.
- Anything the port turns up in R3F v10 alpha — the branch already carries two
  documented alpha workarounds (`SPEC.md`: the Inspector import cycle, and the
  stale depth attachment on multi-canvas resize).

## Setup

- Worktree at `/Users/dex/Developer/paris-mini-site-hero`, branch `hero-demo`.
- **pnpm**, not yarn. Something ran `pnpm install` here mid-Stage-1, which
  rebuilt `node_modules` in pnpm's layout; the branch followed rather than
  fought it. `pnpm-lock.yaml` is gitignored because the repo's committed
  lockfile is still `yarn.lock`. Revisit before this merges.
- `@pmndrs/upscaler@0.2.0` and `leva` from npm.

### How `@pmndrs/sky` is consumed, and why it isn't a link

`pnpm sync:sky` copies the sky checkout's `dist/` + a trimmed `package.json`
into `vendor/pmndrs-sky/`, which `package.json` then depends on via
`link:./vendor/pmndrs-sky`. **Re-run it after every `pnpm build` in the sky
repo** — that is the one manual step this arrangement costs.

Linking the checkout directly was tried first and does not work. A linked
directory keeps its own `node_modules`, and every bare import inside the package
resolves *there*, not against the consuming app. That produced a second
`@react-three/fiber` (10.0.0-canary vs our alpha.3) and a second `three` — not
just duplicate weight but broken `instanceof` and a split TSL node registry —
and then failed outright on `WebGLCubeRenderTarget` (upstream bug 2 above).

Neither Turbopack lever fixes it: `resolveAlias` does not reach inside a linked
subtree, and widening `turbopack.root` to reach the sibling checkout silently
broke the existing Inspector alias (aliases resolve relative to the root). The
vendor directory sidesteps all of it by keeping the package inside the project
root, which is why `next.config.ts` is back to just the Inspector stub.

When `@pmndrs/sky` is published, delete `vendor/`, the script, and this section.

## Open questions

1. **World scale.** Sky is physical — atmosphere in kilometres, real solar
   position. Faraz's city is a 400-unit disc with 30-unit towers and the real
   Eiffel Tower is 330 m. Do we rescale the scene to metres so haze and AP are
   physically meaningful, or fudge sky's `apKmPerSlice` / `hazeStrength` against
   the existing arbitrary units? Rescaling is more work and much more correct,
   and it is the difference between "we used a sky library" and "the sky is
   right."
2. **Wordmark interleave at fold-back.** Sky wants `scene.background`; the hero
   wants a transparent canvas over a CSS gradient with the logotype behind. A
   `GroundedSkybox`/`SkyGround` render inside the canvas may just replace the CSS
   sky entirely and change the hero's whole look — which might be an improvement,
   but it's a design call, not a technical one.
3. **Faraz's `<Text>` is entirely commented out.** The PARIS `Text3D` letters in
   his `src/Text.tsx` are dead code. Do we want the 3D wordmark in the demo at
   all, given the real hero does the wordmark in DOM?
4. **Budget.** What's the target machine and target frame time for the
   conference? Every Stage-3 decision is really a question about that number.
