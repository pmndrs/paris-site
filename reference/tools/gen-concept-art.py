#!/usr/bin/env python3
"""
Generates the three concept plates the site references.

These are STAND-INS. The originals live in the Claude Design project
"Poimandres R3F Workshop Site" under concept/ but exceed the 256 KiB
read cap of the design MCP, so they come back truncated. Export them
from the design project and overwrite the files in concept/ — the
filenames and aspect ratios below match the originals exactly, so
nothing else needs to change.

  concept/city-wide.png     811 x 576    block city, mid distance
  concept/city-far.png      811 x 300    block city, far distance
  concept/tower-cutout.png  584 x 1002   tower silhouette, transparent bg

Run:  python3 tools/gen-concept-art.py
"""

import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "concept")


def lerp(a, b, t):
    return a + (b - a) * t


def mix(c1, c2, t):
    return tuple(int(round(lerp(c1[i], c2[i], t))) for i in range(3))


def city(width, height, rows, horizon, seed, haze, window_rate, name):
    """Blocky skyline receding into haze. Alpha fades to nothing at the top."""
    rnd = random.Random(seed)
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    near = (26, 27, 32)
    far = (92, 98, 120)
    base_y = int(height * horizon)

    # Back rows first so nearer rows overlap them.
    for r in range(rows):
        depth = 1.0 - (r / max(1, rows - 1))  # 1.0 = farthest, 0.0 = nearest
        colour = mix(near, far, depth * haze)
        row_base = int(lerp(base_y, height, (1.0 - depth) * 0.55))
        max_h = height * lerp(0.16, 0.46, 1.0 - depth)
        min_w = int(lerp(10, 34, 1.0 - depth))
        max_w = int(lerp(30, 78, 1.0 - depth))

        x = -rnd.randint(0, max_w)
        while x < width:
            w = rnd.randint(min_w, max_w)
            h = int(max_h * lerp(0.30, 1.0, rnd.random() ** 1.5))
            top = row_base - h
            d.rectangle([x, top, x + w, height], fill=colour + (255,))

            # A few blocks get a setback cap, which is what makes them read as buildings.
            if rnd.random() < 0.30 and w > min_w + 8:
                cw = int(w * rnd.uniform(0.35, 0.7))
                cx = x + (w - cw) // 2
                ch = int(h * rnd.uniform(0.08, 0.22))
                d.rectangle([cx, top - ch, cx + cw, top], fill=colour + (255,))

            # Lit windows — sparser and dimmer the farther back the row is.
            if depth < 0.75:
                lit = mix(colour, (255, 226, 170), 0.85)
                step_x, step_y = 7, 10
                for wy in range(top + 8, height - 4, step_y):
                    for wx in range(x + 5, x + w - 4, step_x):
                        if rnd.random() < window_rate * (1.0 - depth):
                            d.rectangle([wx, wy, wx + 1, wy + 2], fill=lit + (255,))

            x += w + rnd.randint(2, 9)

    img = img.filter(ImageFilter.GaussianBlur(0.4))

    # Vertical alpha ramp: solid at the base, gone above the horizon.
    alpha = img.getchannel("A")
    ramp = Image.new("L", (width, height))
    rd = ImageDraw.Draw(ramp)
    fade_top = int(base_y - height * 0.22)
    for y in range(height):
        if y < fade_top:
            v = 0
        else:
            v = int(255 * min(1.0, (y - fade_top) / max(1.0, (height - fade_top) * 0.45)))
        rd.line([(0, y), (width, y)], fill=v)
    from PIL import ImageChops
    img.putalpha(ImageChops.darker(alpha, ramp))

    img.save(os.path.join(OUT, name))
    print("wrote", name, img.size)


def tower(width, height, name):
    """
    Lattice tower silhouette on a transparent background.

    The hero stacks white letters BEHIND this and white letters IN FRONT of it,
    so the tower has to sit in the mid-tones: light enough to read against #000,
    dark enough that the white type on top of it still reads.
    """
    ss = 3  # supersample
    W, H = width * ss, height * ss
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    cx = W / 2
    ground = H * 0.995
    top_y = H * 0.075          # tip of the shaft; the mast goes above it
    span = ground - top_y

    deck1 = ground - span * 0.235   # first platform
    deck2 = ground - span * 0.520   # second platform

    iron_dark = (54, 54, 64)
    iron_light = (128, 130, 150)

    def outer(y):
        """Half-width of the silhouette. Splayed legs, waist, slim shaft."""
        t = max(0.0, min(1.0, (ground - y) / span))
        return W * (0.455 * math.exp(-3.30 * t) + 0.013)

    def inner(y):
        """Half-width of the arch void between the legs. Zero above deck 1."""
        if y <= deck1:
            return 0.0
        f = (y - deck1) / (ground - deck1)          # 0 at the deck, 1 at ground
        return outer(y) * 0.66 * math.sqrt(max(0.0, 1.0 - (1.0 - f) ** 2))

    # Body, drawn one scanline at a time so the arch falls out of the profile
    # instead of having to be carved back out afterwards.
    y = ground
    while y > top_y:
        t = (ground - y) / span
        col = mix(iron_dark, iron_light, t ** 0.7) + (255,)
        o, i = outer(y), inner(y)
        if i <= 1.0:
            d.rectangle([cx - o, y - ss, cx + o, y], fill=col)
        else:
            d.rectangle([cx - o, y - ss, cx - i, y], fill=col)
            d.rectangle([cx + i, y - ss, cx + o, y], fill=col)
        y -= ss

    # Lattice: cut diagonals out of the body so it reads as ironwork, not a slab.
    mask = Image.new("L", (W, H), 255)
    md = ImageDraw.Draw(mask)
    band = H * 0.019
    lw = max(1, int(ss * 1.1))
    y = ground
    while y > top_y:
        o = outer(y)
        n = max(2, int(o / (W * 0.030)))
        for k in range(-n, n + 1):
            x = cx + (k / n) * o
            md.line([(x - o * 0.45, y), (x + o * 0.45, y - band)], fill=0, width=lw)
            md.line([(x + o * 0.45, y), (x - o * 0.45, y - band)], fill=0, width=lw)
        y -= band

    from PIL import ImageChops
    img.putalpha(ImageChops.darker(img.getchannel("A"), mask))

    # Decks and mast go on after the lattice so they stay solid.
    d2 = ImageDraw.Draw(img)
    for y, over, thick in ((deck1, 1.16, 0.011), (deck2, 1.22, 0.008)):
        o = outer(y) * over
        th = H * thick
        d2.rectangle([cx - o, y - th, cx + o, y + th * 0.5], fill=iron_dark + (255,))
    d2.rectangle([cx - W * 0.005, top_y - H * 0.055, cx + W * 0.005, top_y + H * 0.02],
                 fill=iron_light + (255,))

    img = img.resize((width, height), Image.LANCZOS)
    img.save(os.path.join(OUT, name))
    print("wrote", name, img.size)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    city(811, 576, rows=5, horizon=0.42, seed=7, haze=0.85, window_rate=0.09, name="city-wide.png")
    city(811, 300, rows=4, horizon=0.34, seed=21, haze=1.0, window_rate=0.05, name="city-far.png")
    tower(584, 1002, "tower-cutout.png")
