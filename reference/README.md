# Paris workshop mini-site

Advanced React Three Fiber — the PMNDRS workshop at Gobelins, Paris, September 8–9 2026.

Imported from the Claude Design project **Poimandres R3F Workshop Site**
(`d0737831-c1d0-4094-abe0-7e24d71f62a8`) and implemented as a plain static site —
no build step, no dependencies.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The workshop page. Ported from `Paris Workshop.dc.html`. |
| `mobile-preview.html` | The requested deliverable — five live 390 × 844 frames of `index.html`, each scrolled to a different section. Ported from `Mobile Preview.dc.html`. |
| `assets/styles.css` | All styling. The design doc's inline styles, lifted into classes. |
| `assets/main.js` | Interaction: time-of-day scrubber, glint field, scroll progress rail, section markers, FAQ accordion. |
| `concept/*.png` | Background plates. **Placeholders** — see below. |
| `tools/gen-concept-art.py` | Regenerates the placeholder plates. |

## Running it

`mobile-preview.html` reads into its iframes to scroll them, which browsers block
over `file://`. Serve the folder instead:

```sh
npx serve .           # or: python3 -m http.server 4321
```

Then open `/index.html` or `/mobile-preview.html`. The preview page shows a warning
banner if same-origin access is unavailable, rather than silently rendering five
unscrolled frames.

## The concept images are placeholders

`concept/city-wide.png`, `concept/city-far.png`, and `concept/tower-cutout.png` are
**generated stand-ins**, not the originals.

The originals are in the design project but each exceeds the 256 KiB read cap on the
design MCP's `get_file`, so they come back truncated — only 21%, 46%, and 76% of the
scanlines survive respectively, which is not enough to use. The stand-ins match the
originals' filenames and pixel dimensions exactly, so exporting the real files from
the design project and dropping them into `concept/` is the whole swap; nothing else
needs to change.

Run `python3 tools/gen-concept-art.py` (requires Pillow) to rebuild the stand-ins.

## What carried over from the design doc

The design doc was a `.dc.html` component — a template plus a `DCLogic` class. The
logic ported to vanilla JS one-to-one:

- **Time of day** — the scrubber picks one of four sky gradients at the same
  thresholds (`.2 / .45 / .7`), and drives city opacity `0.42 + t * 0.38` and glint
  opacity `0.95 - t * 0.75` through CSS custom properties.
- **Glints** — 16 dots placed by the doc's `Math.sin` hash, so the star field is
  identical on every load and matches across the five preview frames.
- **Header** — hidden until scroll passes `max(400, vh) * 0.55`, then the progress
  rail fills and the seven section markers sit at their proportional document
  offsets, the current one picked out in white.
- **FAQ** — exclusive accordion, first item open, click-to-close.

Two things were changed rather than copied, both fixing defects visible in the
original:

- The nav strip's edge mask faded the first and last links even when the strip
  wasn't scrollable, rendering them as "Dverview" and "FAC". Matching inline padding
  now keeps them clear of the fade.
- Sections carry `scroll-margin-top` so a nav-link jump doesn't park the section
  eyebrow behind the fixed header.

The design doc's two editable props (`registerUrl`, `sparkles`) became the hardcoded
`https://threejs.paris/` links (marked `data-register`) and an always-on glint field.

## Status

Verified in headless Chrome at 390 / 768 / 1024 / 1440 px: no horizontal overflow,
progress rail reaches 100%, active section tracking correct, accordion state correct,
and all five preview frames land exactly on their section offsets with the header
hidden on frame 01 as specified.
