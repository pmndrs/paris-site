# Content Outlines

Section-by-section copy plan for the Paris workshop site. Build/architecture plan
lives in [SPEC.md](SPEC.md).

**Last updated: 2026-08-07.**

---

## 1. Where the truth lives

Notion was the original source of truth, but the event has moved on and **Notion is
now stale on the specifics**. Current state:

| Fact | Truth | Notion says |
| --- | --- | --- |
| **Level** | **Intermediate** — moved deliberately | "beginner→advanced", "no 3D experience assumed" ❌ stale |
| **Day 2 groups** | **3 tracks** | 4 paths ❌ stale |
| **Day 1 curriculum** | **being re-written** for the intermediate level | hello → mini → models → physics ❌ stale |
| Capacity | ~40 (25 filled, ~15 open) | "up to 40" ✅ |
| Dates | Sep 8–9, talk Sep 11 | ✅ |
| Venue | Gobelins, Paris | ✅ |
| Prereqs mechanics | checkpoint branches, warm-your-cache | ✅ (level framing needs a pass) |

**So: the site's "Advanced / Intermediate" framing was right and Notion's beginner
framing is the outdated one.** An earlier draft of this doc recommended the opposite —
that recommendation is withdrawn.

Notion pages needing a write-back: **00 · Master Plan** (§2 audience, §3 Day 1 table,
the 4-path table), **01 · Prerequisites** (the "no 3D experience assumed" callout),
**03 · Day 1 Lesson Plans** (pending Dennis's rewrite), **04 · Day 2 Path Outlines**
(4 → 3), **05 · Organizer One-Pager**, **11 · What You'll Build**.

Sync stays as agreed: pull copies into `lib/content.ts` now, re-sync on change. Each
export carries a `@notion <page-id>` provenance comment so a re-pull is one prompt and
lands as a reviewable diff.

---

## 2. The three new promotion pillars

From the David alignment call (2026-08-07). Not in Notion yet.

### 2.1 Forward-looking framing — *not* an agentic site

**The vibe is "building the future with R3F."** Not "learn to code despite AI."

The agentic point is how we *open a conversation* — a way in, and a fair objection to
answer — but it must not become the site's identity. A first draft of §4.02 made the
whole section a defence of learning against agents; that was wrong and has been
rewritten. The site should read confident and forward, not reactive.

The correct proportion:

- **Lead with what's newly possible.** WebGPU shipped. v10 puts it behind an API people
  already know. Work that used to need a graphics team is turning into components.
- **The ecosystem is the multiplier** — drei, rapier, postprocessing, gltfjsx. Knowing
  which one to reach for is most of the job, and two days with the people who build
  them is a shortcut you can't read your way to.
- **Then, briefly: you'll write the code.** Bring your agent, we use them too — but you
  type it, break it, and fix it, because you can't direct a tool through a domain you
  can't read. **One card. Not the thesis.**

Same rule in the FAQ: the question is phrased *"Can I use an agent during the
workshop?"* — answer "yes, and we will be" — rather than "why take this when an agent
can write R3F for me", which concedes the frame before answering it.

### 2.2 R3F v10, front and centre

Two distinct claims, both David's:

- **"Made with R3F v10"** — a badge on the site. Which means the site has to actually
  run v10 (see [SPEC.md §2](SPEC.md)). This turns the v10 upgrade from a nice-to-have
  into a promotion dependency.
- **"Come get a preview of R3F v10"** — a hero/overview line. Attendees get the new
  version from the people shipping it, before it's out.

This also resolves the old positioning tension cleanly: v10 is the *credential and the
hook*, intermediate is the *level*.

### 2.3 Cross-promotion — raises the bar

David can coordinate with **Doobs** and **Codrops**, including a possible **Codrops
article**. That's a rare slot and it changes the standard the site is held to: a
Codrops audience will read the source. The 3D/shader work in SPEC §4 is what makes the
site worth writing about, so it moves up in priority — but a broken alpha is worse than
no badge.

**Assets this needs:** a proper OG image, a teaser clip/still, and a site that survives
being linked from a design-and-code audience on a mid-range laptop.

---

## 3. Timeline

| When | What |
| --- | --- |
| **Aug 8–9 (this weekend)** | Site + content — Dennis's goal |
| Aug 10–15 | Soft release / teasers fine. Europeans on vacation, low conversion expected either way. |
| **~Aug 15** | David re-pushes when people are back in a buying mood. **Site should be solid by here**, and it's the natural window for the Codrops piece. |
| ~Aug 18 | Prerequisites must ship to attendees (per Notion) |
| Aug 25 – Sep 1 | Track leads dry-run their tracks |
| Sep 8–9 | Workshop · Sep 11 talk |

Sales pressure is genuinely low: 25 of ~40 seats are already filled, ~10 of the
remainder are earmarked for local students, and David expects the rest to come from
people already attending the conference, close to the date. **The site's job is
credibility and promotion, not conversion urgency.** Don't put a countdown on it.

---

## 4. Section outlines

Proposed IA — 8 sections plus hero and closer. "Outcomes" is replaced, agentic is new.

### Hero

- **Kicker:** `September 8 & 9, 2026 · Gobelins, Paris`
- **Title:** `Advanced React` / `Three Fiber` — unchanged, it was right.
- **Lede:** rework to carry the v10 preview hook. Something like: two days on React
  Three Fiber and the pmndrs ecosystem — one learning it, one building with it. First
  public look at v10, from the people shipping it.
- **New:** a small `made with R3F v10` badge, near the top bar or the CTA row. It should
  be a link — to the v10 release/PR — not just a sticker.
- Seats line: see §5.1, don't publish a live availability count.
- Time-of-day slider stays.

### 01 · Overview

Structure survives; copy needs a light pass once Day 1 is re-written. Keep the
two-paragraph teaching-day / build-day split, correct to **3 tracks**.

Add a third paragraph — the catch-up promise, which is missing and is the most
reassuring thing you can tell a mixed room: every demo is a chain of runnable
checkpoints, so falling behind costs you one command, not the afternoon.

FACTS strip: Dates `Sep 8 & 9` · Format `In person` · Seats `40` · Level `Intermediate`

### 02 · Why now — **NEW, shipped**

Per §2.1. Placed high, right after Overview.

- **Eyebrow:** `02 · Why now`
- **Heading:** *"WebGPU is here. v10 makes it something you can ship."*
- **Lede:** WebGPU shipped; v10 puts it behind an API you already know; the parts of 3D
  that used to need a graphics team are turning into components.
- **Three cards:** React is the fastest way to build 3D · the ecosystem is the
  multiplier · you will write the code (the agentic note, contained to one card).
- **Visual:** background shader — no object to photograph, and the one place where
  "this could not run on WebGL" is the point.
- Doubles as the natural home for the **v10 preview** hook, which resolves the old
  positioning tension: v10 is the credential, intermediate is the level.

### 03 · What you'll build

Still worth adding, but **the Day 1 half is on hold** until the intermediate rewrite
lands — the old beginner artifacts (first scene, spinning cube) are the wrong altitude
now. The Day 2 half can be drafted as soon as the 3 tracks are named.

Ship the section shell + the Day 2 row first; fill Day 1 after.

### 04 · Two days

- **Day 1** — pending the rewrite. Existing two half-day blocks stay as a placeholder.
- **Day 2** — 3 tracks. Currently "Track theme TBC" ×3 with leads Dennis / Kris / TBC.
  Naming these is the single highest-value content unblock on the page after Day 1.
- Correct the hours once confirmed — site says 09:30–17:30, the organizer one-pager
  says ≈09:00–17:00.

### 05 · Instructors

See §5.2 — the "name TBC" placeholders are a live risk.

### 06 · Come ready

Keep the current intermediate framing (it's correct). Pull the *mechanics* from Notion
01 · Prerequisites, which are still accurate and better than what's on the site:

- **The rule that matters:** run the install once on your own network before you
  travel. Forty people pulling `node_modules` over conference wifi is the only thing
  that reliably wrecks a hands-on day.
- **Confidence line:** if `pnpm dev` shows the scene at home, you're done.
- **Fix:** Node `22 LTS (20+ works)`; pnpm via `corepack enable`, npm fine too; repo
  sent **~3 weeks ahead**, not one week.
- **Drop** "discrete GPU preferred" — replace with: any laptop from the last few years;
  what actually matters is hardware acceleration being on.
- **Visual:** background shader.

### 07 · Venue

Verify the "Conference Sep 10 – 11" row — Notion only ever references a talk on Sep 11.
Map placeholder decision in SPEC §7.

### 08 · FAQ

- Rewrite the "never written 3D code" answer for the intermediate level — it currently
  promises the opposite of where the workshop landed.
- **Add: "Why take this when an agent can write R3F for me?"** — the short version of
  §02, in the FAQ where objections get looked for.
- **Add: "What if my setup breaks on the day?"** → CodeSandbox browser mirrors.
- Correct the hardware answer per §06.

### Closer

Walk-away line + the v10 hook again. Background shader.

---

## 5. Open questions

### 5.1 How do we talk about seats?

25 of ~40 filled; ~10 of the remaining 15 earmarked for local students, so genuine
public availability is closer to **5**. Publishing "15 seats available" would be wrong,
and publishing a live count means maintaining it.

**Recommendation:** the FACTS strip says `40` as capacity, and the site makes no
availability claim at all. Revisit only if David wants a scarcity signal.

Also: **is the local-student allocation public?** It's a good story and on-brand, but
it's David's to announce, not ours to leak.

### 5.2 Instructors — resolved

All four are real. The `· name TBC` role labels are removed; first names ship as-is
until Dennis has surnames for Ava and Faraz. Remaining gap: **track leads** for the 3
tracks, which is part of §5.3.

### 5.3 Day 1 + track names

Both blocked on Dennis. They gate §03 and §04. Everything else in this doc is
actionable now.

### 5.4 Notion write-back

Six pages are stale (§1). Want me to update them, or is Notion being retired as the
source of truth for the public-facing specifics?
