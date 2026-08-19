# Hero — human checklist

What's left needs eyes, taste, or hardware — none of it is codeable from here.
Dev server: `pnpm dev` → http://localhost:3111. The full-knob version lives at
`/demos/paris-hero` (controls top-right, info bottom-left); the frozen-config
version is the hero on `/`.

## 1 · Visual pass (blocks the merge to main)

- [ ] **Hero on `/`** — scene fades in over the CSS gradient, tower framed,
      lettering readable, copy/gradient legible over the city. Judge the
      shader-compile wait on a cold load.
- [ ] **`/demos/paris-hero`** — panel opens, every folder's controls respond,
      perf readout ticks.
- [ ] **Node-hook refactor regression check** (uncommitted change, 2026-08-19):
      water shimmer + sky reflection on the river, sparkle mode glitters,
      beacon beams look unchanged, fog sliders still live. Same pixels as
      before is the pass condition.
- [ ] **FSR ghosting** — orbit at renderScale 1.5; watch tower edges and the
      lettering for smearing. Compare renderScale 1 (TRAA path, fsr off).
- [ ] **TOD sweep on `/`** — drag the slider 0→100; exposure curve through
      midday should never blow out or crush. (Curve: 40 at night → 12 at 13h.)
- [ ] **Reduced motion** — with OS reduced-motion on: no auto-rotate, demand
      frameloop, page still presentable.
- [ ] **Scroll-away pause** — hero off-screen stops the render loop (fans/GPU
      calm down); section canvases below still animate.

## 2 · Taste calls (say the word, I bake them in)

- [ ] Final `letterSize` / `letterSpread` (current defaults 2.4 / 0.8).
- [ ] Default `towerMode` for the hero: glow · metal · sparkle.
- [ ] `beacon` on the hero: currently **off**.
- [ ] Park: keep or drop (it was flagged "may suck" — it stayed).
- [ ] Fog defaults: density 0.3 / height 300 / horizon clamp on.

## 3 · Hardware & perf (needs machines I don't have)

- [ ] **Weaker GPU**: the canvas requests
      `maxColorAttachmentBytesPerSample: 64` for the 5-attachment MRT. On
      adapters that don't offer it, device creation fails → fallback poster.
      Decide if that's acceptable or if the degrade path (drop the diffuse
      attachment, lose SSGI) is worth building.
- [ ] **Mobile**: completely unmeasured. Perf, thermals, and whether the hero
      should even attempt WebGPU there.
- [ ] **Cold-load compile time** on the landing page, on a mid machine — is
      the gradient-covered wait acceptable for a marketing page?

## 4 · Ship

- [ ] Merge: in `/Users/dex/Developer/paris-mini-site` run
      `git merge hero-demo` (fast-forwards; this branch already contains
      main). Or tell me and I'll do it.
- [ ] Deploy + smoke-test the deployed hero.
- [ ] Land pmndrs/sky **PR #6** (StrictMode dispose fix). The fix is vendored
      here, so nothing blocks on it — but until it lands, `pnpm sync:sky`
      from an unpatched checkout would regress the sky controls.

## 5 · Cleanup decisions

- [ ] Old hero files now unused: `components/hero/paris-scene.tsx` + its
      city/stars/tower. Delete or keep as reference?
- [ ] `r185-ssgi-fsr/` (untracked test bench) — keep local, or gitignore it?
- [ ] Real aerial-perspective haze stays off (≈half a frame per LUT update).
      Future option: budget it (update every Nth frame). Park or pursue?
