# Paris Workshop Site — Build Spec

Marketing site for the **R3F Workshop, Three.js Conf Paris, Sep 8–9 2026**.
Companion doc: [CONTENT.md](CONTENT.md) — section-by-section copy outlines and the
Notion↔site content deltas.

> **Status (2026-08-08).** On **R3F v10 alpha 3 / drei 11 alpha 5**, WebGPU entry
> (`@react-three/fiber/webgpu`). Hero is the primary canvas; three track solids, a
> cursor-driven gold tile grid, and a noise field render as secondary canvases sharing
> its renderer. Plus: motion layer, "Why now" section, fact corrections, gated attendee
> guide (§8).
>
> **Not visually verified.** Everything below typechecks, lints, and builds, and the
> page serves clean — but no one has looked at the WebGPU output in a browser yet. See
> §4 "What still needs eyes".

---

## 1. Source of truth

The **pmndrs Notion workspace** —
[🧊 R3F Workshop — Paris](https://app.notion.com/p/5870baf602168314b53701894049e9b3) —
holds the workshop planning material, and the site is downstream of it for *mechanics*
(prereqs, repo conventions, run-of-show shape, risks).

**It is stale on the event specifics.** The workshop moved to intermediate level, Day 1
is being re-written, and Day 2 went from four paths to three tracks. See
[CONTENT.md §1](CONTENT.md) for the delta and which pages need a write-back. Don't pull
level, curriculum, or track content from Notion without checking there first.

| Notion page | Feeds |
| --- | --- |
| [00 · Master Plan](https://app.notion.com/p/09f0baf60216838da23e013ebc5ad7e6) | Day 1 run of show, Day 2 path list, seat count, audience level |
| [01 · Prerequisites](https://app.notion.com/p/c370baf6021683958da1013edd909459) | "Come ready" section, FAQ hardware/setup answers |
| [03 · Day 1 Lesson Plans](https://app.notion.com/p/ac70baf6021682968053019620ca5703) | Day 1 block titles + bullets |
| [04 · Day 2 Path Outlines](https://app.notion.com/p/ca80baf6021683b2bf86815ae3f3f5a2) | The four path cards (hook, libs, ships, difficulty) |
| [05 · Organizer One-Pager](https://app.notion.com/p/fcc0baf60216834e843581ba440220f2) | Hero lede, overview framing |
| [11 · What You'll Build](https://app.notion.com/p/07d0baf602168301b9e781d26fe19804) | The new "What you'll build" section |
| [02 · Production Tracker](https://app.notion.com/p/7450baf6021682fbafdd01b8dc4e51c3) | Which media assets exist yet (gates the 3D work) |

### Sync model — MCP pull, committed to git

**Decision: manual pull via the Notion MCP, not a runtime integration.**

An agent session reads the pages above and rewrites `lib/content.ts`. The copy stays
a plain typed TS module — versioned, reviewable in a diff, zero runtime cost, no
Notion token in Vercel, no build-time network dependency, and it still renders if
Notion is down.

To make re-syncing cheap and auditable, every exported block in `lib/content.ts`
carries a provenance comment:

```ts
/** @notion 04 · Day 2 Path Outlines — 5870baf6…/ca80baf6-0216-83b2-bf86-815ae3f3f5a2 */
export const PATHS = [ … ] as const;
```

Re-sync is then one prompt: *"re-pull `lib/content.ts` from the Notion pages named in
its `@notion` tags and show me the diff."*

**When to revisit:** if conference organizers (outside the repo) need to edit copy
themselves. At that point move to a build-time fetch — a `scripts/pull-notion.ts`
writing `lib/content.generated.ts`, run in `prebuild` with `NOTION_TOKEN` in Vercel
env — keeping the generated file committed so builds never depend on the API. Do not
do runtime ISR fetching; this content changes a few times before September and never
after.

---

## 2. Stack and version bets

| | Current | Target | Note |
| --- | --- | --- | --- |
| Next | 16.3.0 | same | App Router. **Read `node_modules/next/dist/docs/` before writing any Next code** — this Next has breaking changes vs. training data (see `AGENTS.md`). |
| React | 19.2.8 | same | |
| `@react-three/fiber` | **9.7.0** | **10.x alpha 3** | The site claims to teach v10; it should run v10. Dennis is landing alpha 3. |
| `@react-three/drei` | 10.7.8 | latest compatible with R3F v10 | `View` is **not** used — a canvas per section replaces it (§4). |
| `three` | 0.185.1 | whatever alpha 3 pins | |
| Tailwind | v4 | same | Tokens in `app/globals.css`, dark-only. |

### The v10 / TSL bet — now a promotion dependency

This stopped being a nice-to-have. The promotion plan (CONTENT.md §2.2) puts a
**"made with R3F v10"** badge on the site and sells *"come get a preview of v10"* at
the workshop. The badge has to be true, so **the v10 upgrade is on the critical path**,
not a step-4 nicety.

Concretely that means:

- Move to `@react-three/fiber` v10 alpha as soon as alpha 3 is out. **Pin exactly**
  (`10.0.0-alpha.3`, no `^`) — it's an alpha, it will churn.
- Author section shaders in **TSL** rather than raw GLSL, rendered through
  `WebGPURenderer`. We are not targeting a WebGL backend (§4) — no-WebGPU gets posters
  — so TSL can use the full WebGPU feature set, compute included, rather than the
  lowest common denominator.
- Per the [R3F v10 Outline](https://app.notion.com/p/3aa0baf6021680b2b9c3d1f1828b9680),
  the WebGPU entry is `@react-three/fiber/webgpu` and exposes a `useUniform` hook.
  **Verify this against the actual alpha 3 API before building on it** — that doc is
  from Dec 2025 and predates the alphas.

**Risk + exit.** The badge and the shaders are separable, and should be treated that
way:

- **Upgrade to v10 first, on its own.** Hero scene green on alpha 3 = the badge is
  honest. This is the part promotion depends on.
- **TSL shaders second.** If alpha 3 fights us here, fall back to GLSL
  `ShaderMaterial` on whichever R3F version we're on. The backgrounds don't need TSL to
  look right; only our pride does.

A broken alpha in front of a Codrops audience is worse than no badge. If v10 isn't
stable by the Aug 15 push, ship on 9 and add the badge later.

---

## 3. Motion system

Goal: content settles into place as you scroll. Restrained — this is a page you read,
not a demo reel. Everything below is ~60 lines of code and **zero new dependencies**;
resist adding an animation library until something here genuinely can't express what
we want.

### Primitive

`lib/use-in-view.ts` — one `IntersectionObserver` (shared, not one per element) that
flips a `data-reveal` attribute on observed nodes.

`components/motion/reveal.tsx` — `<Reveal>` renders any element with `data-reveal`
and an optional `--i` index for stagger.

```css
/* app/globals.css */
[data-reveal] {
  opacity: 0;
  translate: 0 14px;
  transition:
    opacity 700ms cubic-bezier(0.16, 1, 0.3, 1),
    translate 700ms cubic-bezier(0.16, 1, 0.3, 1);
  transition-delay: calc(var(--i, 0) * 60ms);
}
[data-reveal="in"] { opacity: 1; translate: none; }
```

### Tokens

| Token | Value |
| --- | --- |
| Duration | 700ms |
| Easing | `cubic-bezier(.16, 1, .3, 1)` (expo-out) |
| Travel | 14px up |
| Stagger | 60ms per item, **capped at 6 items** (360ms max) |
| Trigger | threshold `0.18`, rootMargin `0px 0px -10% 0px` |
| Repeat | **once** — DOM content never re-hides on scroll up |

### Rules

- **`prefers-reduced-motion: reduce` disables all of it** — elements render in their
  final state with no transition. Not a lesser animation: none. The hero already
  honours this and the pattern extends.
- **No-JS renders visible.** The initial `opacity: 0` must be applied by the same JS
  that sets up the observer, or gated behind a `.js` class on `<html>` — never a bare
  CSS default, or a JS failure hides the whole page.
- DOM content animates **in only**. 3D content animates in *and* pauses out (§4).
- Never animate headings per-letter, never animate the FAQ accordion contents, never
  block reading on a delay > 360ms.

### Scroll-linked (second pass, optional)

- Section hairline rules draw in `scaleX: 0 → 1`.
- The existing `useScrollSpy` rail already tracks progress — feed it into the shader
  uniforms in §4 rather than adding a second scroll listener.

---

## 4. 3D system

### Architecture: WebGPU-first, a canvas per section

**A WebGPU `GPUDevice` is not bound to a canvas.** One adapter → one device, and any
number of canvases take a `GPUCanvasContext` configured against that same device. The
WebGL rule this spec was originally built around — ~8–16 hard-capped, isolated
contexts, each with its own resources and its own eviction risk — simply does not
apply. R3F v10 is where we get to act on that.

So: **each section owns a plain `<Canvas>` in normal document flow.** No fixed
full-screen canvas, no `<View>` scissor tracking, no `View.Port`, no transparent-`main`
hack, no z-index gymnastics. A section's 3D lives inside that section's markup and
layers with its DOM exactly the way any other element would.

What this buys beyond simplicity:

- **The hero stops being a special case.** Its wordmark sandwich (DOM behind, canvas,
  DOM in front) was the reason it couldn't join a shared canvas. Now that's just what
  every section can do if it wants.
- **Per-section frameloop control is trivial** — each canvas independently
  `frameloop="never"` when its section is off-screen. Far cleaner than culling inside
  a shared View render.
- **Independent failure.** One section's scene blowing up doesn't take the page's 3D
  with it.
- R3F already drives all roots from a **single global rAF**, so N canvases does not
  mean N render loops competing.

### Tiering: WebGPU or posters

Assume WebGPU. Don't build a parallel WebGL rendering path.

| Capability | What renders |
| --- | --- |
| `navigator.gpu` present | Full 3D, every section |
| WebGL only | **Static posters.** No degraded 3D path. |
| Neither / `prefers-reduced-motion` | Static posters |

This is the single biggest simplification available: no GLSL variants of every shader,
no dual-backend testing matrix, no lowest-common-denominator TSL. One target.

By September 2026 WebGPU is shipping across Chrome/Edge, Safari, and Firefox — and this
audience is 3D developers on current browsers, which is about the friendliest possible
population for that assumption. **Worth pulling real numbers before launch** rather
than trusting my read of it.

Cheap option worth one experiment: `WebGPURenderer` can fall back to a WebGL backend
on its own. If that fallback happens to look fine for free, keep it. The moment it
costs us a design constraint — and it will, the second we want compute — drop it and
serve posters instead.

### Future-forward, because we can

Things worth actually using, given we're WebGPU-only and promoting v10:

- **Compute shaders** for the background fields and any particle work. GPU-driven,
  and genuinely not possible on the WebGL path — which makes it the honest argument for
  the "come see v10" pitch rather than a reskin of what three could already do.
- **TSL everywhere**, as the one shader language on the site. If the Codrops piece
  happens, "the whole site is TSL on WebGPU, here's the source" *is* the article.
- **Storage buffers / large instancing** if the block city wants to get denser.

### How it actually works in alpha 3

Answered — v10 ships this as a first-class API, documented at
[`docs/webgpu/multi-canvas.mdx`](https://github.com/pmndrs/react-three-fiber/blob/v10/docs/webgpu/multi-canvas.mdx).

```tsx
// Primary — owns the one WebGPURenderer. components/hero/paris-scene.tsx
<Canvas id="main" renderer={{ alpha: true, antialias: true }}>

// Secondary — borrows it. components/three/section-canvas.tsx
<Canvas renderer={{ primaryCanvas: "main", scheduler: { after: "main", fps: 30 } }}>
```

Each canvas keeps its own scene graph, camera, events, and zustand store; only the
renderer and its GPU resources are shared. `scheduler.after` orders draws,
`scheduler.fps` rate-limits — section backdrops run at 24–45fps against the hero's 60.

Two constraints this puts on the page:

- **The primary must outlive every secondary.** The hero canvas may pause, but it must
  never unmount, or the sections below lose the renderer they borrow.
- **Secondaries must not mount before the primary registers.** `SectionCanvas` gates on
  `waitForPrimary("main")` and stays unmounted if it times out, which leaves the
  poster in place rather than erroring.

### Other v10 migration notes

- `@react-three/fiber/webgpu` is a **pure WebGPU entry** — no WebGL legacy, and node
  materials are auto-`extend`ed, so `<meshStandardNodeMaterial>` needs no setup. Import
  three from `three/webgpu`, never `three`, or the WebGL bundle comes along.
- **`state.clock` is gone.** Frame state is flat: `state.elapsed`, `state.delta`,
  `state.time`, `state.frame`.
- `state.gl` → `state.renderer`.
- The module touches `localStorage` at import time, so **nothing 3D can sit in the SSR
  graph**. `components/three/scenes.tsx` is the client-only boundary: sections import
  from it, and it `next/dynamic`s each scene with `ssr: false`.
- The React Compiler's `react-hooks/immutability` rule rejects writing `uniform.value`
  from `useFrame`. `components/three/**` is added to the existing eslint override that
  already covers `components/hero/**` for the same reason.

### Upstream bug: the Inspector import cycle

**Alpha 3's WebGPU entry can't be imported at all under Turbopack without a workaround.**

`@react-three/fiber/dist/webgpu/index.mjs` statically imports
`three/addons/inspector/Inspector.js`, and that module imports `REVISION` back out of
`three/webgpu` — a real cycle. Turbopack resolves `three/webgpu` to `undefined`
mid-evaluation, so the first import throws:

```
TypeError: Cannot read properties of undefined (reading 'REVISION')
  components/hero/paris-scene.tsx (4:1) @ module evaluation
```

Not version-fixable: three 0.185.1 is the latest and still has it.

**Workaround here:** `next.config.ts` aliases the Inspector to
`lib/three-inspector-stub.ts`, a no-op. R3F leaves `state.inspector` null unless you
explicitly enable it, so nothing is lost — verified by grepping the production build:
`RendererInspector` is absent, `three/webgpu` still bundled.

**The real fix is upstream** — make that import lazy (`await import()` behind whatever
enables the inspector) rather than static. Worth doing before v10 ships, since it
breaks every Turbopack app on the `/webgpu` entry. Delete the stub and the alias when
it lands.

### Upstream bug: stale depth attachment on multi-canvas resize

Filed: [three.js — pending]. Symptom, once per frame, forever:

```
THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError:
The depth stencil attachment [TextureView of Texture "depthBuffer"]
size (width: 380, height: 149) does not match the size of the other
attachments' base plane (width: 380, height: 148).
```

`WebGPUBackend._getDefaultRenderPassDescriptor` builds the depth-stencil attachment
view **once per canvas** and caches it on the renderer's per-canvas data, rebuilding
only when the sample count changes. The colour attachment is pulled fresh from
`context.getCurrentTexture()` every frame, and the swap chain tracks the canvas
element automatically. So the two only stay in step if something clears the cache on
resize.

Something does — `Renderer._onCanvasTargetResize` → `backend.updateSize()` — but
`Renderer` keeps **one** resize listener and `setCanvasTarget` moves it from the old
target to the new one on every swap. With N canvases sharing a renderer, only the
active one can hear its own resize. Every other one resizes silently and then renders
against a stale depth view forever. `updateSize()` compounds it by deleting
`getCanvasTarget()` — the active target, not the one that actually resized.

Two triggers had to line up here: the bug above, and R3F re-measuring section
canvases on scroll, where a fractional `getBoundingClientRect` flaps between e.g.
148.4 and 148.6.

**Workaround here**, both halves:
- `components/three/depth-attachment-sync.tsx` — mounted in every canvas including
  the hero. On a size change it calls `backend.updateSize()` from inside that
  canvas's own `useFrame`, where R3F has already made it the active target (its
  `setCanvasTarget` runs at the `start` scheduler phase), so each canvas invalidates
  exactly its own entry.
- `forceEven` on every canvas, plus `resize={{ scroll: false }}` on the secondaries —
  stops the sub-pixel flapping that set it off. The secondaries are
  `pointer-events: none`, so re-measuring on scroll bought nothing anyway.

**The real fix is upstream**: scope the resize listener per canvas target (and have
`updateSize` take the target that resized), or rebuild the depth view per frame
alongside the colour attachment. This will hit anyone using v10's multi-canvas mode
with more than one canvas size on the page.

### What still needs eyes

None of this has been seen rendering. Worth checking, roughly in order of how likely I
am to have got them wrong:

1. **Tile grid** — the flip angle, radius, and gold threshold are guesses. The grid
   sizing math (cells sized to overfill the section from `viewport`) is the most likely
   thing to be visibly off.
2. **Noise field** — blob scale and opacity were picked blind; it may be too strong or
   invisible.
3. **Hero on WebGPU** — it rendered on WebGL before. Materials and the `fogExp2` should
   carry over, but the time-of-day lighting is worth a scrub through.
4. Whether 5 canvases at once actually holds framerate on a mid-range laptop.

### Per-section treatment

| Section | Treatment | Priority |
| --- | --- | --- |
| Hero | Existing Paris scene (tower, block city, time-of-day slider) | shipped |
| Overview | Replace `/concept/city-wide.png` with a **live canvas** of the block city at mid-distance, slow orbit. Shares the hero's time-of-day via a small zustand store, so scrolling down keeps the light you left the hero in. | **P1** |
| Why now | **Compute-driven background field.** No object to photograph, and the one place where "this could not run on WebGL" is the point. | **P2** |
| What you'll build | **One small canvas per artifact.** The curriculum *is* the visual. Blocked on the Day 1 rewrite. | **P1** |
| Two days · tracks | Three track cards. **Static posters first** — the track repos don't exist yet. | P3 |
| Come ready (prereqs) | Background shader, low contrast, sits under the text. | **P2** |
| Venue | Currently a "map placeholder" box. Extruded 3D block-map, or a real static map. Cheapest honest answer wins. | P3 |
| FAQ | None. | — |
| Closer | Background shader, brighter sibling of the Come-ready one, palette tied to the hero's time-of-day. Bookends the page. | **P2** |

### Shader modules

`lib/shaders/` — one module per background, each exporting a TSL node material
factory. Shared uniform contract:

| Uniform | Source |
| --- | --- |
| `uTime` | `useFrame` clock, **stopped when the section is off-screen** |
| `uProgress` | 0–1 progress of *that section* through the viewport |
| `uTod` | Hero time-of-day, from the shared store |
| `uReduced` | `prefers-reduced-motion` → freeze at a good-looking `t` |

### Performance budget

Contexts are no longer the constraint. VRAM, bandwidth, and the initial bundle are.

- **`frameloop="never"` for any section not intersecting.** With a canvas per section
  this is per-section and exact — the main lever we have, and it costs nothing.
- `dpr={[1, 1.75]}` for section canvases; the hero keeps 2.
- **One shared asset cache.** An HDRI or GLTF used by three sections must upload once —
  pending verification question 2 above, this may be free or may need building.
- The 3D bundle is dynamically imported below the hero and must not enter the initial
  route JS. Budget: **≤ 400 KB gz**.
- Every canvas has a **static poster** — used for the no-WebGPU tier, reduced motion,
  and load. The hero already models this pattern.
- Escape hatch: `?no3d` renders posters everywhere. For debugging, and for presenting
  on a bad projector.
- **Measure on a mid-range laptop before the Aug 15 push.** A site that stutters is a
  worse advert for v10 than a site with fewer canvases.

### Accessibility

- All canvases `aria-hidden` and `pointer-events: none` unless deliberately
  interactive (the hero slider is the exception); nothing in them carries meaning the
  text doesn't.
- Poster `alt` describes the *subject*, not "a 3D canvas".
- Reduced motion is respected at the render-loop level, not just visually — and it
  drops to the poster tier, so it costs nothing to honour.

---

## 5. Information architecture

Current sections and the proposed change:

| # | Section | Change |
| --- | --- | --- |
| — | Hero | Lede reworked for the v10 preview hook; `made with R3F v10` badge |
| 01 | Overview | 3 tracks; add the catch-up promise; static image → live View |
| 02 | **Why now** | **New, shipped.** What WebGPU + v10 make possible; the agentic note is one card, not the thesis. See CONTENT.md §2.1. Shader backdrop — nothing to photograph. |
| 03 | ~~Outcomes~~ → **What you'll build** | **Replace.** Day 2 row first; Day 1 row waits on the curriculum rewrite. |
| 04 | Two days | Day 1 pending rewrite; Day 2 = **3 named tracks** |
| 05 | Instructors | Blocked on confirmation (§7) |
| 06 | Come ready | Mechanics pulled from Prerequisites, intermediate framing kept; shader backdrop |
| 07 | Venue | Map decision |
| 08 | FAQ | Add the agentic objection + the setup-broke question |
| — | Closer | Walk-away line + v10 hook; shader backdrop |

Section count goes 8 → 9. `SECTIONS` in `lib/content.ts` drives both the scroll-spy
rail and the nav, so adding the entry is enough — but check the rail doesn't get
cramped at 9 marks on mobile.

---

## 6. Build order

Two milestones: **this weekend** (Aug 8–9, Dennis's goal) and **Aug 15** (David's
re-push, and the Codrops window).

**Weekend — content and structure, no new 3D:**

1. ~~Motion layer~~ — **done**. `RevealGroup` + CSS; applied to Overview, Two days,
   Come ready. Extend to the rest as their copy lands.
2. **Fact corrections** — seats, hours, Node version, GPU line, repo lead time.
   Cheap, and they're wrong on a page people are about to be pointed at.
3. **"Why now"** section — new copy, no dependencies, and it's the
   piece David specifically asked for.
4. **Come ready** rewrite from the Prerequisites mechanics.
5. **FAQ** additions (agentic objection, setup-broke).
6. Day 1 + track names — **when Dennis's rewrite lands**.

**Toward Aug 15 — the things that make it worth linking:**

7. **R3F v10 alpha 3 upgrade**, hero green on it → the `made with R3F v10` badge
   becomes honest. Critical path for promotion (§2).
8. **Section canvas + View plumbing** — Overview View first, one View, proves the
   architecture end to end.
9. **Background shaders** — "Why now" and Closer. TSL if v10 landed,
   GLSL if not.
10. **OG image + teaser asset.** Currently missing entirely, and every cross-promotion
    link will render whatever's there.
11. "What you'll build" Views; Venue map; track art.

Steps 2–5 are unblocked right now. Step 7 gates 8–9.

---

## 7. Open decisions

1. ~~Which workshop is this?~~ **Resolved:** intermediate. Notion is the stale one.
2. **Day 1 curriculum + the 3 track names** — with Dennis. Gates two sections.
3. **Seats.** Capacity is ~40 (25 filled). Recommendation: publish `40` as capacity and
   make no availability claim — ~10 of the remaining 15 are earmarked for local
   students, so "15 available" would be wrong. See CONTENT.md §5.1.
4. ~~Instructors~~ **Resolved:** all four real; surnames pending for Ava and Faraz.
5. **v10 alpha 3** — go/no-go, and it now has a promotion deadline (§2).
6. **Venue map** — real map, 3D block map, or drop the box.
7. **Notion write-back** — update the six stale pages, or retire Notion as the source
   of truth for public-facing specifics?
8. **Attendee + resources routes** — §8. Deadline is ~Aug 18, ahead of the site's
   other remaining work.

---

## 8. Beyond the marketing page

Two routes worth adding. They're different products with different lifecycles, and
should not be the same page.

### `/attendees` — pre-event, gated · **built**

**Audience:** the ~40 registered. **Deadline: ~Aug 18**, when prerequisites ship — this
is a harder date than anything else left on the site.

Shipped as `/attendees/<code>`, statically generated for each code in
`ACCESS_CODES` (`lib/attendees.ts`), with `dynamicParams = false` so anything else
404s. `/attendees` itself is a code-entry form for people who remember the code but not
the URL. Both are `noindex`, and `app/robots.ts` disallows the path.

Six blocks: start here (clone/install/verify), what you need, how the day works
(checkpoints), the demos, when it breaks, on the day. Content pulled from Notion
01 · Prerequisites, 08 · Day 1 Attendee Guide, and 10 · Troubleshooting.

**Before it goes out:**

- Real `d1-workshop` repo URL — currently `<org>/d1-workshop`.
- Help-channel link — `HELP_CHANNEL.href` is `null`, renders a placeholder note.
- **The demos block is provisional** and marked as such on the page. It's the old
  beginner curriculum; it must be replaced or removed before this reaches attendees.
- 09 · Path Picker content, once the 3 tracks are named.

### `/resources` — during and after

**Audience:** the same people, time-shifted. Slides, per-demo repo links and branch
names, track outputs, the Sep 11 talk, where-to-go-next.

**Make this public after Sep 11.** It's the long tail — the thing Doobs and Codrops can
keep linking to, and the reason the site still has a reason to exist in October. Gated
during the event, opened after.

### No auth — an access code instead

40 people, nothing genuinely secret, and the site is 100% static and free to host.
Accounts, sessions, email delivery, and a database are a disproportionate surface for a
two-day event.

The code *is* the URL: `/attendees/paris2026`. One link in the confirmation email, no
form to fill, and it stays a static build with no server-side session. `supersecret`
also works, because Dennis asked. Adding, rotating, or removing codes is one array in
`lib/attendees.ts` — no other file knows about them.

Call it what it is: **obscurity, and proportionate here.** The worst case of a leak is
that someone reads setup instructions they didn't pay for. If that ever stops being
true — anything with attendee names, emails, or paid content — this needs real auth,
and the honest move is to say so rather than add a second password.

### This is where Notion *should* be the runtime source

The earlier decision — pull Notion at build time, commit to `lib/content.ts` — is right
for marketing copy: stable, wants review, changes rarely. It is exactly wrong for these
two routes, which change constantly and sometimes urgently. Nobody wants to redeploy at
09:15 on Sep 8 because a branch name changed.

So the split is principled:

| | Source | Cadence |
| --- | --- | --- |
| Marketing page | `lib/content.ts`, pulled from Notion by hand | Reviewed, committed |
| `/attendees`, `/resources` | **Notion API at request time, ISR** | Live, ~60s |

Needs a `NOTION_TOKEN` in Vercel env and a block renderer. Roughly a hundred lines.

**Tiering, if the weekend gets tight:** publish the Notion pages to the web and link
them. Off-brand and slower, but zero engineering, editable by anyone on the team, live
instantly — and it hits the Aug 18 date with no risk. Upgrade to the ISR version after
the push. Do not let a nice-to-have block the one hard deadline.

### Keep them plain

These get read on a phone in a hallway with bad wifi, or on a laptop that is currently
broken — that's the whole point of the troubleshooting page. **No canvases, no shaders,
no motion.** Site palette, fast, copy-pasteable commands.
