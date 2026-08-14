# Site copy & ship checklist

The one place to edit words and track what's missing.

**How this file relates to the others.** [CONTENT.md](CONTENT.md) is the _reasoning_ —
positioning, pillars, where the truth lives. [SPEC.md](SPEC.md) is the build. This file is
the **working copy deck**: what each section says, what it should say, and what is still
missing. `lib/content.ts` stays the runtime source of truth — edit here, and syncing it into
`lib/content.ts` is one prompt and lands as a reviewable diff.

**Last updated: 2026-08-14.**

---

## 1. Contradictions on the live page

These are wrong _today_, and they are the cheapest credibility to lose.

| What                                | Where                       | Says                                                                                            |
| ----------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------- |
| **Seats — three different numbers** | hero lede                   | "Thirty seats"                                                                                  |
|                                     | FACTS strip                 | `40`                                                                                            |
|                                     | closer                      | "Forty seats"                                                                                   |
|                                     | day-two tracks              | 10 + 10 + 10 = 30                                                                               |
| **Level vs the FAQ**                | FACTS strip                 | Level `Intermediate`                                                                            |
|                                     | FAQ "never written 3D code" | "That is the intended starting point"                                                           |
| **Conference dates**                | venue table                 | `Conference Sep 10 – 11` — CONTENT.md §07 says Notion only ever references a talk on **Sep 11** |

**Decide:** capacity is 40 with 30 in tracks (10 float / staff?), or capacity is 30?
Whatever it is, one number, three places.

**Decide:** the FAQ answer has to stop promising beginners a soft landing now that the level
moved. Draft in §5 below — needs your sign-off, it's a policy call not a copy call.

---

## 2. Ship checklist

### Blocked on Dennis

- [ ] **Track themes ×3** — renders as `Track theme TBC` on the page today
- [ ] **Track C lead** — renders as `Lead TBC`
- [ ] **Day 1 curriculum** — being rewritten for the intermediate level; current blocks are the old draft
- [ ] Surnames for Ava and Faraz
- [ ] Kris's libraries, by name (see §6)

### Not blocked — buildable now

- [ ] **OG image** — highest value item left. `app/` has only a favicon, so every share
      is a blank card. Matters most if the Doobs / Codrops cross-promo lands.
- [ ] **Instructor photos** — four headshots. Bigger credibility win than socials.
- [ ] **Instructor socials** — GitHub / X per person. "Core pmndrs contributor" is a
      claim; a link makes it evidence.
- [ ] Verify the conference dates row
- [ ] Resolve the seat count

### Already done

- [x] Every section toggleable from the footer, defaults = the ship state
- [x] Demos: flip grid, magic box, grain gradient, blending cube, takehome grid, block city
- [x] `?no3d` and reduced-motion fall back to posters

---

## 3. The verbosity fix

Not fewer sections — **fewer words in the same sections.** Every row is carrying a demo or a
job, so the page keeps its shape and stops repeating itself.

| Section     | Verdict                                                                | Demo behind it                            |
| ----------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| Hero        | keep                                                                   | tower + block city                        |
| Overview    | **cut to one sentence** — its two paragraphs are a summary of Two days | block city                                |
| Why now     | trim cards ~40%                                                        | flip grid                                 |
| Outcomes    | one line per card                                                      | magic box · blending cube · takehome grid |
| Two days    | keep in full — this is where the detail belongs                        | —                                         |
| Instructors | keep, fix roles (§6)                                                   | grain gradient (in closer)                |
| Come ready  | keep, already tight                                                    | —                                         |
| Venue       | keep, fix dates                                                        | —                                         |
| FAQ         | keep, fix one answer, drop two questions                               | —                                         |
| Closer      | keep, fix seats                                                        | grain gradient                            |

The rule that makes this work: **each idea gets one home.** "One day learning, one day
building" currently appears in the hero lede, in Overview's two paragraphs, and again in Two
days with a timetable. It belongs in Two days; the hero gets the one-line version; Overview
stops repeating it.

---

## 4. The mini version

Yes, it works — and **the dates are already in the hero**, in the kicker
(`September 8 & 9, 2026 · Gobelins, Paris`).

What the mini version is missing is not dates, it's:

- **Level.** `Intermediate` is the positioning and it only exists in the FACTS strip.
  One line under the hero lede fixes it.
- **A CTA at the end.** The hero has a Register button and the sticky header has one once
  you scroll, so it isn't CTA-less — but someone who reads to the bottom hits the footer and
  finds only links. Adding one to the footer closes the loop. _(Small, not yet done.)_

On staged reveal: the section switch already is that mechanism, with one caveat worth
knowing — the toggles are per-browser (localStorage), so they're a **dev** control, not a
publishing one. To ship a smaller site publicly and expand later, change `SHORT_VERSION` in
`lib/sections.ts` and deploy. Adding a section to the public site is a one-line commit.

---

## 5. Section copy

Current text, then the proposal. Edit the proposals — they're what gets synced.

### Hero

- **Kicker:** `September 8 & 9, 2026 · Gobelins, Paris` — keep
- **Title:** `Advanced React` / `Three Fiber` — keep
- **Lede now:** "One day learning React Three Fiber v10 and the pmndrs ecosystem, one day
  building with it. Thirty seats."
- **Lede proposed:** "One day learning React Three Fiber v10 and the pmndrs ecosystem, one
  day building with it. Intermediate level, ⟨N⟩ seats."
  → carries the level, and fixes the seat number once you pick one.

### Overview

- **Now:** two paragraphs (~70 words) restating day one / day two, plus the FACTS strip.
- **Proposed (one paragraph):**
  > Day one is teaching: React Three Fiber v10, then the pmndrs ecosystem around it. Day two
  > is a hackathon — three tracks, a lead on each, something running by the end of the
  > afternoon.
- FACTS strip stays. Block city stays.

### Why now

Heading and lede keep. Cards trimmed:

- **01 · React is the fastest way to build 3D** — "You already have components, hooks and
  state. R3F maps them straight onto the scene graph, so what you're learning is the 3D, not
  another framework."
- **02 · The ecosystem is the multiplier** — "drei, rapier, postprocessing, gltfjsx. Knowing
  which one to reach for is most of the job, and two days with the people who build them is a
  shortcut you can't read your way to."
- **03 · You will write the code** — "Bring your agent, we use them too. But you'll type it,
  break it and fix it, because you can't direct a tool through a domain you can't read."

### Outcomes

Heading keeps. One line per card:

- **01 · A working v10 setup** — "R3F v10 running on your machine, configured the way we'd
  start a real project."
- **02 · The ecosystem in your head** — "Which pmndrs library solves which problem."
- **03 · The demos, not just the notes** — "Every demo from day one, running and yours —
  including the ones on this page."

### Two days

Keep as-is. This is the section the others were duplicating, so it earns the detail.
Blocked on the Day 1 rewrite and the three track themes.

- Confirm hours: site says 09:30–17:30, the organizer one-pager says ≈09:00–17:00.

### Instructors

See §6.

### Come ready

Keep. Already the tightest section on the page.

### Venue

Keep. **Fix the `Conference Sep 10 – 11` row.**

### FAQ

Keep, with two changes.

- **Rewrite** — currently: _"What if I have never written 3D code?" → "That is the intended
  starting point."_ That contradicts `Level: Intermediate`. Proposed:

  > **How much 3D do I need?**
  > None, but the pace assumes React fluency and moves quickly. This is an intermediate
  > workshop: if you've never opened a 3D scene you'll get far more out of it after a weekend
  > with the docs.

  ⚠️ **Policy call, not copy — needs your sign-off.** It turns some people away.

- **Drop** "Will the recordings be available?" and "Is lunch included?" — or move both to the
  registration confirmation email, where they actually matter.

### Closer

Keep. Fix the seat count. Heading and CTA unchanged.

---

## 6. The team

**"Assistant" is out.** It reads as a hierarchy label where what the page actually needs is a
credential — and the credentials here are strong. Proposal: drop the role hierarchy entirely,
give everyone a credential line, and move who-does-what-on-the-day into the bio.

| Name             | Credential line               | Bio                                                           |
| ---------------- | ----------------------------- | ------------------------------------------------------------- |
| Dennis Smolek    | `pmndrs core · wrote R3F v10` | Builds production R3F for a living. Leads a track on day two. |
| Kris Baumgartner | `pmndrs core · ⟨libs⟩`        | ⟨needs the library names⟩ Leads a track on day two.           |
| Faraz ⟨surname⟩  | `pmndrs contributor`          | On hand through both days for setup and one-to-one help.      |
| Ava ⟨surname⟩    | `⟨interactive developer?⟩`    | On hand through both days for setup and one-to-one help.      |

**Needed:**

- [ ] Which libraries for Kris — "a ton of other libs" needs two or three names to land
- [ ] Ava's credential — "interactive developer" works, but is there a stronger one?
- [ ] Surnames for both
- [ ] Photos, and a GitHub / X link each

**Worth saying out loud on the page:** you wrote v10 and the site is the first public thing
built on it. That's the single strongest credential here and right now it appears nowhere.

---

## 7. Open decisions

1. Seat count — one number (§1)
2. FAQ level answer — sign-off on turning beginners away (§5)
3. Conference dates row (§1)
4. Kris's libraries, Ava's credential, both surnames (§6)
5. Track themes ×3 and Track C's lead (§2)
6. Day 1 curriculum rewrite (§2)
7. Drop the recordings / lunch FAQs, or keep them? (§5)
