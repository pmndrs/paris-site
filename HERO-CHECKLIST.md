# Hero — human checklist

What's left needs eyes, taste, or hardware — none of it is codeable from here.
Run your own `pnpm dev` (no agent servers are up; ports are free). The
full-knob version lives at `/demos/paris-hero` (controls top-right, info
bottom-left); the frozen-config version is the hero on `/`.

Since the first pass (2026-08-21): `hero-uniforms` folded back in, so
`hero-demo` is the only branch. Landed and headless-verified — the FSR resize
smear (pin now tracks the drawing buffer), the Metal query-set OOM on graph
toggles (replaced FSR node now disposed), fog knobs via `useUniforms` raw
values, scheduler via `useFrame()`, your always-mounted glow light, main
merged through the Why retitle, and `SectionLink` for the two-days buttons.

## 1 · Visual pass (blocks the merge to main)

- [ ] **Hero on `/`** — scene fades in over the CSS gradient, tower framed,
      lettering readable, copy legible over the city. Judge the
      shader-compile wait on a cold load.
- [ ] **Resize the window on `/`** — this was the smeared-city bug. It should
      now snap back to a crisp frame within a frame or two, any size, both
      directions. Fixed + verified headless; wants real-window eyes.
- [ ] **Toggle fog off / haze on repeatedly** in `/demos/paris-hero` — the
      `GPUOutOfMemoryError (upscale-timer-N)` came from ~4 leaked FSR nodes
      exhausting Metal's query-set pool. Hammer the toggles well past four
      rebuilds; the error should never appear now.
- [ ] **Haze A/B** — you saw haze-on/fog-off on the experiment server and
      didn't call it. Flip `sky/haze` + `sky/fog` in the panel and decide if
      haze earns its ~half-frame cost anywhere (see §2).
- [ ] **"See the two days"** — on a fresh profile (short version, no stored
      sections) the hero button should reveal the section and scroll to it;
      with the section already on, it's a plain smooth-scroll. Same for the
      closer's "Review the two days".
- [ ] **Why section** — now titled "WebGPU is here, behind an API you already
      know" (main's retitle, merged). Confirm it reads right over the flip
      grid.
- [ ] **FSR ghosting** — orbit at renderScale 1.5; watch tower edges for
      smearing. Compare renderScale 1 (TRAA path, fsr off). The lettering
      no longer rides the resolver: it renders in its own display-res pass
      composited afterwards, and the tower portals a depth-only twin into
      that pass so the interleave is one depth test at display resolution —
      judge the glyph edges and the cut through the ironwork instead.
- [ ] **Letter layering** (`letter-intersect`) — every quad sits on the
      tower's axis plane (so all six are the same size) and layering is
      authored per band in `layer` (`LETTERS`, lettering.tsx): the antenna
      threads the P, M behind, N in front, D behind, the R's bowl behind
      with its leg in front, the S's upper curve in front with its lower
      bowl behind. Watch a full spin: the woven letters should keep the same
      relationship in every pose (their bands clear the sweep envelope), and
      no letter should flicker between layers. The taste calls are each
      letter's `layer` z's and the band positions.
- [ ] **TOD sweep on `/`** — drag the slider 0→100; exposure curve through
      midday should never blow out or crush. (Curve: 40 at night → 12 at 13h.)
- [ ] **Reduced motion** — with OS reduced-motion on: no auto-rotate, demand
      frameloop, page still presentable, SectionLink scroll jumps instead of
      gliding.
- [ ] **Scroll-away pause** — hero off-screen stops its render job (fans/GPU
      calm down); section canvases below still animate. (Now goes through
      `useFrame()`'s scheduler — same singleton, worth one re-check.)
- [ ] **Stars** — the instanced celestial dome (`hero-demo/stars.tsx`) now has
      real bright-star anchors, a field concentrated along the IAU galactic
      plane, and a sparse two-draw-call Milky Way veil, all oriented for Paris
      on the workshop date. Knobs live under `sky/stars`. Sweep `timeOfDay` and
      watch stars arrive in magnitude order while the seasonal sky rises; the
      shipping default (20.4h) should be a handful of pinpricks, not a bare sky,
      and midnight should reveal a subtle diagonal veil rather than a pasted
      galaxy photograph. Then check them **on a
      non-retina screen** — sizing is pinned to raster pixels precisely
      because a viewport-relative quad went sub-pixel and vanished at dpr 1,
      and the fix makes stars physically chunkier there. Watch for crawling
      while the camera orbits.

## 2 · Taste calls (say the word, I bake them in)

- [ ] Final `letterSize` / `letterSpread` (current defaults 5 / 0.8).
- [ ] Default `towerMode` for the hero: glow · metal · sparkle.
- [ ] `beacon` on the hero: currently **off**.
- [ ] Haze vs sky-fog as the shipped look: currently fog on / haze off (the
      per-frame AP LUT update costs ~half the frame: 85 vs 165 fps measured).
- [ ] Park: keep or drop (it was flagged "may suck" — it stayed).
- [ ] Fog defaults: density 0.3 / height 300 / horizon clamp on.
- [ ] Star defaults: count 4200 / intensity 2.8 / size 5.25 / twinkle 0.28.
      Intensity was picked between "reads as dust" (2) and "asks to be looked
      at" (4) on this display; it is the one number most likely to want your
      eyes. The twilight ramp opens at sun elevation +1° rather than the real
      −6°, which is the one place physics was bent to keep the shipping frame
      from being empty — say the word and it goes back.

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
      `git merge hero-demo` (fast-forwards; this branch contains main through
      the Why retitle). Or tell me and I'll do it.
- [ ] Deploy + smoke-test the deployed hero.
- [ ] Land pmndrs/sky **PR #6** (StrictMode dispose fix). The fix is vendored
      here, so nothing blocks on it — but until it lands, `pnpm sync:sky`
      from an unpatched checkout would regress the sky controls.

## 5 · Cleanup decisions

- [ ] Old hero files now unused: `components/hero/paris-scene.tsx` + its
      city/stars/tower. Delete or keep as reference?
- [ ] `r185-ssgi-fsr/` (untracked test bench) — keep local, or gitignore it?
- [ ] Rebuild leak, remainder: the replaced FSR node is now disposed (that was
      the only exhaustible resource), but the rest of a replaced graph still
      leaks per rebuild — fiber #3854 plus our bloom/traa/ssgi nodes. Fine
      for a hand-driven lab panel; decide whether full graph disposal is
      worth building before shipping anything that rebuilds in the wild.
- [ ] Real aerial-perspective haze stays off (≈half a frame per LUT update).
      Future option: budget it (update every Nth frame). Park or pursue?
