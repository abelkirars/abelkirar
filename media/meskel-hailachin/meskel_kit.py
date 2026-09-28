#!/usr/bin/env python3
"""Meskel Hailachin (መስቀል ኃይላችን) motion-design kit.

Renders transparent PNG overlays for a vertical 1080x1920 DaVinci Resolve
timeline: six gold Ethiopian-style crosses, a rays layer, a manuscript-style
frame, a title card and one lyric card per sung line.

Usage:  python3 meskel_kit.py [output_dir]
Needs:  pillow numpy scipy, and the fonts in ./fonts (Noto Serif Ethiopic).
"""
import math
import os
import sys
import zipfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "fonts")
W, H = 1080, 1920                 # vertical video frame
SS = 2                            # supersampling for smooth edges
CROSS_PX = 1600                   # size of the big square cross images
CROSS_CENTER = (540, 330)         # where crosses sit in the frame (above the head)
CROSS_HEIGHT = 380                # cross height in the frame, in pixels
TEXT_Y = (1398, 1474, 1560)       # call line, divider, response line

# ---------------------------------------------------------------- lyrics
RESPONSE = "መስቀል ኃይላችን"
REFRAIN = [
    ["መስቀል መስቀል ኃይላችን", "ጠላትን ማጥቂያችን"],
    ["በመስቀል እንመካለን", "እንድንበታለን"],
]
VERSES = [
    ["የክርስቲያን ጋሻ", "የክርስቲያን ጦር", "ዕፀ መስቀሉ ነው", "የማያስደፍር"],
    ["መድኃኒት የሚሆን", "ደሙ ፈሶበታል", "መስቀሉን ጥግ አርጎ", "እሱ ይፈውሳል"],
    ["ክርስቶስ በደሙ", "ስለቀደሰው", "መስቀል ላመኑበት", "ድል ማድረጊያ ነው"],
    ["የመለኮት ሥጋ", "የተፈተተበት", "መስቀል ኃይላችን ነው", "የምንድንበት"],
    ["ሕይወትን ለማግኘት", "ከሞት ለመዳን", "መመኪያ ኃይላችን", "መስቀል አለልን"],
]

# ---------------------------------------------------------------- colour
GOLD = [(0.00, (40, 22, 6)), (0.22, (112, 68, 16)), (0.45, (188, 136, 44)),
        (0.66, (234, 192, 100)), (0.84, (255, 228, 152)), (1.00, (255, 249, 226))]
ANTIQUE = [(0.00, (36, 26, 16)), (0.25, (98, 74, 42)), (0.50, (158, 128, 80)),
           (0.72, (204, 176, 122)), (0.90, (236, 216, 170)), (1.00, (250, 242, 218))]
RUBY = [(0.00, (28, 0, 4)), (0.35, (92, 4, 16)), (0.62, (156, 14, 32)),
        (0.85, (212, 50, 62)), (1.00, (255, 186, 186))]
WARM_GLOW = (255, 196, 96)
SMOKE = (34, 10, 6)


def ramp(t, stops):
    t = np.clip(t, 0, 1)
    xs = np.array([s[0] for s in stops])
    cs = np.array([s[1] for s in stops], float)
    return np.stack([np.interp(t, xs, cs[:, i]) for i in range(3)], -1)


def lighting(height, depth, light=(-0.5, -0.8, 0.9)):
    """Diffuse and specular terms for a height map lit from the top left."""
    gy, gx = np.gradient(height)
    nx, ny = -gx * depth, -gy * depth
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + 1.0)
    nx, ny, nz = nx * inv, ny * inv, inv
    L = np.array(light, float)
    L /= np.linalg.norm(L)
    Hv = L + np.array([0.0, 0.0, 1.0])
    Hv /= np.linalg.norm(Hv)
    diff = np.clip(nx * L[0] + ny * L[1] + nz * L[2], 0, 1)
    spec = np.clip(nx * Hv[0] + ny * Hv[1] + nz * Hv[2], 0, 1)
    return diff, spec


def metal(alpha, stops=GOLD, bevel=5.0, depth=55.0, spec=0.55, spec_pow=36,
          raised=(), height=None, sheen=0.12):
    """Shade a silhouette so it reads as polished, embossed metal."""
    if height is None:
        height = (ndi.gaussian_filter(alpha, bevel) * 0.65
                  + ndi.gaussian_filter(alpha, bevel * 3) * 0.35)
    for m, w in raised:
        height = height + w * ndi.gaussian_filter(m, bevel * 0.8)
    diff, sp = lighting(height, depth)
    h, w_ = alpha.shape
    yy, xx = np.mgrid[0:h, 0:w_]
    wave = 0.5 + 0.5 * np.sin((xx * 0.6 + yy) / max(h, w_) * math.pi * 2.2 + 0.6)
    t = 0.10 + 0.72 * diff + sheen * wave
    col = ramp(t, stops) + (sp ** spec_pow * spec * 255)[..., None] * np.array([1.0, 0.96, 0.86])
    return np.clip(col, 0, 255)


def engrave(col, alpha, inset, width=1.6, strength=0.55):
    """Cut a thin line that follows the outline, like engraved metalwork."""
    dist = ndi.distance_transform_edt(alpha > 0.5)
    g = np.exp(-((dist - inset) / width) ** 2)
    hl = np.exp(-((dist - inset - width * 1.8) / width) ** 2)
    return np.clip(col * (1 - strength * g)[..., None] + (hl * 38)[..., None], 0, 255)


# ---------------------------------------------------------------- compositing
class Layer:
    """Premultiplied RGBA accumulator."""

    def __init__(self, h, w):
        self.rgb = np.zeros((h, w, 3))
        self.a = np.zeros((h, w))

    def over(self, rgb, a, at=(0, 0)):
        a = np.clip(a, 0, 1)
        x, y = at
        hh, ww = a.shape
        H_, W_ = self.a.shape
        x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + ww, W_), min(y + hh, H_)
        if x0 >= x1 or y0 >= y1:
            return
        sa = a[y0 - y:y1 - y, x0 - x:x1 - x]
        rgb = np.broadcast_to(np.asarray(rgb, float), a.shape + (3,))[y0 - y:y1 - y, x0 - x:x1 - x]
        dr, da = self.rgb[y0:y1, x0:x1], self.a[y0:y1, x0:x1]
        self.rgb[y0:y1, x0:x1] = rgb * sa[..., None] + dr * (1 - sa[..., None])
        self.a[y0:y1, x0:x1] = sa + da * (1 - sa)

    def over_layer(self, other, at=(0, 0)):
        safe = np.where(other.a > 1e-6, other.a, 1)[..., None]
        self.over(other.rgb / safe, other.a, at)

    def image(self):
        safe = np.where(self.a > 1e-6, self.a, 1)[..., None]
        out = np.zeros(self.a.shape + (4,), np.uint8)
        out[..., :3] = np.clip(self.rgb / safe, 0, 255).astype(np.uint8)
        out[..., 3] = np.clip(self.a * 255, 0, 255).astype(np.uint8)
        return Image.fromarray(out, "RGBA")


def glow_and_shadow(layer, alpha, glow=0.55, glow_r=40, shadow=0.6, shadow_r=10,
                    glow_col=WARM_GLOW):
    layer.over(glow_col, np.clip(ndi.gaussian_filter(alpha, glow_r) * 1.6, 0, 1) * glow)
    layer.over((0, 0, 0), np.clip(ndi.gaussian_filter(alpha, shadow_r) * 1.3, 0, 1) * shadow)


# ---------------------------------------------------------------- drawing
C = (500.0, 500.0)


def rot(pts, deg, c=C):
    a = math.radians(deg)
    ca, sa = math.cos(a), math.sin(a)
    return [(c[0] + (x - c[0]) * ca - (y - c[1]) * sa,
             c[1] + (x - c[0]) * sa + (y - c[1]) * ca) for x, y in pts]


def up(dx, r, c=C):
    """Point in the frame of an arm pointing up: dx across, r outward."""
    return (c[0] + dx, c[1] - r)


class Mask:
    """Draw in a 1000x1000 design space onto a supersampled square canvas."""

    def __init__(self, px=CROSS_PX, margin=0.12, design=1000.0):
        self.px, self.N = px, px * SS
        self.s = self.N * (1 - 2 * margin) / design
        self.o = self.N * margin
        self.img = Image.new("L", (self.N, self.N), 0)
        self.d = ImageDraw.Draw(self.img)

    def P(self, pts):
        return [(self.o + x * self.s, self.o + y * self.s) for x, y in pts]

    def to_px(self, p):
        x, y = self.P([p])[0]
        return x / SS, y / SS

    def ppu(self):
        return self.s / SS

    def poly(self, pts, fill=255):
        self.d.polygon(self.P(pts), fill=fill)

    def circle(self, c, r, fill=255):
        (x, y), r = self.P([c])[0], r * self.s
        self.d.ellipse([x - r, y - r, x + r, y + r], fill=fill)

    def ring(self, c, r, w, fill=255):
        (x, y), R = self.P([c])[0], (r + w / 2) * self.s
        self.d.ellipse([x - R, y - R, x + R, y + R], outline=fill,
                       width=max(1, int(round(w * self.s))))

    def line(self, pts, w, fill=255, closed=False):
        pts = list(pts) + ([pts[0], pts[1]] if closed else [])
        self.d.line(self.P(pts), fill=fill, width=max(1, int(round(w * self.s))), joint="curve")

    def rect(self, x0, y0, x1, y1, fill=255):
        (a, b), (c, d) = self.P([(x0, y0), (x1, y1)])
        self.d.rectangle([min(a, c), min(b, d), max(a, c), max(b, d)], fill=fill)

    def crosslet(self, c, arm, w, deg=0, fill=255):
        x, y = c
        for b in (0, 90):
            self.poly(rot([(x - w / 2, y - arm), (x + w / 2, y - arm),
                           (x + w / 2, y + arm), (x - w / 2, y + arm)], deg + b, c=c), fill)

    def paste(self, other):
        self.img.paste(255, mask=other.img)

    def arr(self):
        return np.asarray(self.img.resize((self.px, self.px), Image.LANCZOS), np.float32) / 255.0


def trefoil(m, a, r_tip, r_lobe, r_side, side_dx, side_r, hole=0, c=C):
    tip = rot([up(0, r_tip, c)], a, c)[0]
    m.circle(tip, r_lobe)
    sides = [rot([up(dx, side_r, c)], a, c)[0] for dx in (-side_dx, side_dx)]
    for s in sides:
        m.circle(s, r_side)
    if hole:
        m.circle(tip, hole, 0)
        for s in sides:
            m.circle(s, hole * 0.8, 0)


# ---------------------------------------------------------------- crosses
def cross_refrain():
    """Refrain: the 'home' cross, trefoil arms joined by a halo ring."""
    m, raised = Mask(), Mask()
    m.circle(C, 92)
    for a in (0, 90, 180, 270):
        m.poly(rot([up(-52, 0), up(52, 0), up(75, 330), up(-75, 330)], a))
        trefoil(m, a, 372, 62, 50, 80, 322)
        m.poly(rot([up(-11, 415), up(11, 415), up(11, 452), up(-11, 452)], a))
        m.circle(rot([up(0, 460)], a)[0], 20)
    m.poly([up(0, 46), up(46, 0), up(0, -46), up(-46, 0)], 0)
    m.circle(C, 15)
    for a in (45, 135, 225, 315):
        m.circle(rot([up(0, 70)], a)[0], 11, 0)
    for a in (0, 90, 180, 270):
        m.poly(rot([up(-15, 132), up(15, 132), up(15, 300), up(-15, 300)], a), 0)
        m.circle(rot([up(0, 372)], a)[0], 19, 0)
        for dx in (-80, 80):
            m.circle(rot([up(dx, 322)], a)[0], 14, 0)
    for mm in (m, raised):
        mm.ring(C, 248, 34)
    for a in (45, 135, 225, 315):
        m.poly(rot([up(-11, 250), up(11, 250), up(11, 306), up(-11, 306)], a))
        trefoil(m, a, 326, 21, 15, 25, 306)
    alpha = m.arr()
    col = engrave(metal(alpha, raised=[(raised.arr(), 0.45)]), alpha, 7)
    return alpha, col, None


def cross_shield():
    """Verse 1 (shield, spear): lattice cross inside a studded round gasha."""
    m, lat, studs = Mask(), Mask(), Mask()
    for a in (0, 90, 180, 270):
        lat.poly(rot([up(-100, 0), up(100, 0), up(100, 322), up(120, 382),
                      up(-120, 382), up(-100, 322)], a))
    dist = ndi.distance_transform_edt(lat.arr() > 0.5) / lat.ppu()
    m.paste(lat)
    band, hd, step = 22, 15, 36
    for i in range(-12, 13):
        for j in range(-12, 13):
            if (i + j) % 2:
                continue
            x, y = 500 + i * step, 500 + j * step
            X, Y = lat.to_px((x, y))
            if dist[int(Y), int(X)] >= band + hd + 2 and math.hypot(x - 500, y - 500) > 88:
                m.poly([(x, y - hd), (x + hd, y), (x, y + hd), (x - hd, y)], 0)
    m.circle(C, 66)
    m.rect(489, 458, 511, 542, 0)
    m.rect(458, 489, 542, 511, 0)
    m.ring(C, 452, 40)
    m.ring(C, 392, 16)
    for k in range(24):
        studs.circle(rot([up(0, 452)], k * 15)[0], 13)
    alpha = m.arr()
    col = engrave(metal(alpha, raised=[(studs.arr(), 1.1)]), alpha, 6)
    # dark red leather face of the shield behind the gold
    face = Mask()
    face.circle(C, 450)
    fa = face.arr()
    yy, xx = np.mgrid[0:CROSS_PX, 0:CROSS_PX]
    r = np.hypot(xx - CROSS_PX / 2, yy - CROSS_PX / 2) / (CROSS_PX / 2)
    face_rgb = ramp(1 - r * 1.2, [(0, (34, 4, 6)), (0.6, (84, 12, 16)), (1, (128, 26, 26))])
    return alpha, col, (face_rgb, fa * 0.88)


def cross_axum():
    """Verse 2 (medicine, blood): Aksumite cross pattée with ruby enamel."""
    gold, arms, rim, gem = Mask(), Mask(), Mask(), Mask()
    for a in (0, 90, 180, 270):
        arc = [up(x, math.sqrt(445 ** 2 - x ** 2)) for x in np.linspace(150, -150, 25)]
        pts = rot([up(-42, 0), up(42, 0)] + arc, a)
        arms.poly(pts)
        gold.poly(pts)
    gold.ring(C, 452, 30)
    gold.ring(C, 424, 8)
    gold.circle(C, 82)
    for a in (45, 135, 225, 315):
        gold.circle(rot([up(0, 452)], a)[0], 18)
    alpha = gold.arr()
    col = engrave(metal(alpha), alpha, 5, strength=0.4)
    dist = ndi.distance_transform_edt(arms.arr() > 0.5) / arms.ppu()
    enamel = np.clip((dist - 24) * arms.ppu() / 1.5, 0, 1)
    rim.circle(C, 82)
    ra = rim.arr()
    gem.circle(C, 58)
    ga = gem.arr()
    layer = Layer(CROSS_PX, CROSS_PX)
    layer.over(col, alpha)
    layer.over(metal(enamel, RUBY, bevel=4, depth=40, spec=0.9, spec_pow=60), enamel)
    layer.over((0, 0, 0), np.clip(ndi.gaussian_filter(ra, 6) * 1.2, 0, 1) * 0.5 * (1 - ra))
    layer.over(engrave(metal(ra), ra, 4), ra)
    yy, xx = np.mgrid[0:CROSS_PX, 0:CROSS_PX]
    R = 58 * gem.ppu()
    rr = np.hypot(xx - CROSS_PX / 2, yy - CROSS_PX / 2) / R
    dome = np.sqrt(np.clip(1 - rr ** 2, 0, 1)) * R * 0.02
    layer.over(metal(ga, RUBY, height=dome, depth=60, spec=1.0, spec_pow=50, sheen=0.05), ga)
    safe = np.where(layer.a > 1e-6, layer.a, 1)[..., None]
    return layer.a, layer.rgb / safe, None


def cross_gondar():
    """Verse 3 (victory): Gondar-style cross, lozenge plates and crosslets."""
    m, raised = Mask(), Mask()
    for a in (0, 90, 180, 270):
        m.poly(rot([up(-48, 0), up(48, 0), up(48, 262), up(-48, 262)], a))
        m.poly(rot([up(0, 236), up(158, 356), up(0, 478), up(-158, 356)], a))
        for p, q in (((158, 356), (0, 478)), ((-158, 356), (0, 478))):
            ex, er = q[0] - p[0], q[1] - p[1]
            ln = math.hypot(ex, er)
            n = (er / ln, -ex / ln)
            if n[1] < 0:
                n = (-n[0], -n[1])
            for t in (0.28, 0.62):
                cx, cr = p[0] + ex * t + n[0] * 22, p[1] + er * t + n[1] * 22
                c = rot([up(cx, cr)], a)[0]
                m.poly(rot([up(cx - 7, cr - 22 * n[1]), up(cx + 7, cr - 22 * n[1]), up(cx + 7, cr), up(cx - 7, cr)], a))
                m.crosslet(c, 24, 15, a + math.degrees(math.atan2(n[0], n[1])))
                m.circle(c, 12)
        m.crosslet(rot([up(0, 504)], a)[0], 27, 16, a)
        m.circle(rot([up(0, 504)], a)[0], 13)
        m.poly(rot([up(0, 290), up(88, 357), up(0, 424), up(-88, 357)], a), 0)
        m.poly(rot([up(-8, 285), up(8, 285), up(8, 430), up(-8, 430)], a))
        m.poly(rot([up(-92, 349), up(92, 349), up(92, 365), up(-92, 365)], a))
    for mm in (m, raised):
        s = 215
        mm.line([(500 - s, 500 - s), (500 + s, 500 - s), (500 + s, 500 + s), (500 - s, 500 + s)], 18, closed=True)
        mm.line([up(0, 300), up(300, 0), up(0, -300), up(-300, 0)], 18, closed=True)
        mm.poly([up(0, 92), up(92, 0), up(0, -92), up(-92, 0)])
    m.circle(C, 34, 0)
    m.circle(C, 16)
    for a in (0, 90, 180, 270):
        m.circle(rot([up(0, 60)], a)[0], 9, 0)
    alpha = m.arr()
    col = engrave(metal(alpha, raised=[(raised.arr(), 0.5)]), alpha, 5, strength=0.45)
    return alpha, col, None


def cross_processional():
    """Verse 4 (the Body broken): quiet processional cross on its staff."""
    m = Mask()
    hc = (500.0, 300.0)
    m.rect(468, 110, 532, 470)
    m.rect(320, 268, 680, 332)
    for a in (0, 90, 270):
        trefoil(m, a, 222, 40, 32, 50, 194, hole=12, c=hc)
    m.circle((500, 496), 46)
    m.rect(470, 540, 530, 558)
    m.rect(485, 556, 515, 944)
    m.rect(474, 760, 526, 776)
    m.poly([(485, 944), (515, 944), (500, 992)])
    m.crosslet(hc, 26, 10, fill=0)
    for a in (0, 90, 270):
        m.poly(rot([up(-7, 62, hc), up(7, 62, hc), up(7, 150, hc), up(-7, 150, hc)], a, hc), 0)
    alpha = m.arr()
    col = engrave(metal(alpha, ANTIQUE, spec=0.35), alpha, 5, strength=0.4)
    return alpha, col, None


def petal(cx, cy, length, width, deg, start=0.0):
    pts = []
    for u in np.linspace(0, math.pi, 18):
        d = start + length * (1 - math.cos(u)) / 2
        wv = width / 2 * math.sin(u) ** 0.8
        pts.append((d, wv))
    pts += [(d, -wv) for d, wv in reversed(pts)]
    a = math.radians(deg)
    return [(cx + d * math.cos(a) - wv * math.sin(a), cy + d * math.sin(a) + wv * math.cos(a)) for d, wv in pts]


def draw_flowers(canvas, flowers, leaves):
    """Adey Abeba (Meskel daisies) and leaves, drawn on an RGBA design canvas."""
    d = ImageDraw.Draw(canvas)
    P = canvas.info["P"]
    for (x, y, L, Wd, deg) in leaves:
        d.polygon(P(petal(x, y, L, Wd, deg)), fill=(34, 92, 26, 255))
        d.polygon(P(petal(x, y, L * 0.92, Wd * 0.55, deg, L * 0.04)), fill=(58, 128, 40, 255))
        d.line(P(petal(x, y, L * 0.9, 0.001, deg, L * 0.05)[:18]), fill=(110, 170, 70, 255), width=3)
    for (x, y, R, deg0) in flowers:
        for k in range(8):
            deg = deg0 + k * 45
            d.polygon(P(petal(x, y, R, R * 0.46, deg, R * 0.12)), fill=(214, 128, 0, 255))
            d.polygon(P(petal(x, y, R * 0.93, R * 0.36, deg, R * 0.14)), fill=(246, 178, 8, 255))
            d.polygon(P(petal(x, y, R * 0.8, R * 0.2, deg, R * 0.3)), fill=(255, 214, 52, 255))
        for rr, colr in ((0.30, (120, 52, 4)), (0.24, (168, 80, 6)), (0.15, (96, 40, 2))):
            (px, py), = P([(x, y)])
            s = canvas.info["s"] * R * rr
            d.ellipse([px - s, py - s, px + s, py + s], fill=colr + (255,))
        for k in range(10):
            a = math.radians(k * 36 + deg0)
            (px, py), = P([(x + math.cos(a) * R * 0.2, y + math.sin(a) * R * 0.2)])
            s = canvas.info["s"] * R * 0.045
            d.ellipse([px - s, py - s, px + s, py + s], fill=(250, 170, 30, 255))


def cross_demera():
    """Verse 5 (life): Meskel cross crowned with Adey Abeba flowers."""
    m = Mask()
    c = (500.0, 370.0)
    m.rect(446, 110, 554, 900)
    m.rect(210, 316, 790, 424)
    for a in (0, 90, 270):
        trefoil(m, a, 300, 60, 46, 74, 256, hole=16, c=c)
    trefoil(m, 180, 562, 60, 46, 74, 518, hole=16, c=c)
    m.circle(c, 70)
    alpha = m.arr()
    col = engrave(metal(alpha), alpha, 7)
    flowers = [(c[0], c[1], 92, 10)]
    flowers += [(c[0] + 128 * math.cos(math.radians(30 + 60 * k)),
                 c[1] + 128 * math.sin(math.radians(30 + 60 * k)), 56, 20 * k) for k in range(6)]
    flowers += [(500, 70, 50, 5), (130, 370, 50, 25), (870, 370, 50, 15), (500, 932, 46, 0)]
    leaves = [(c[0], c[1], 200, 50, 60 * k) for k in range(6)]
    for (x, y, _, _) in flowers[7:]:
        leaves += [(x, y, 96, 30, -60), (x, y, 96, 30, -120), (x, y, 90, 28, 60), (x, y, 90, 28, 120)]
    deco = Image.new("RGBA", (m.N, m.N), (0, 0, 0, 0))
    deco.info["P"] = m.P
    deco.info["s"] = m.s
    draw_flowers(deco, flowers, leaves)
    deco = np.asarray(deco.resize((CROSS_PX, CROSS_PX), Image.LANCZOS), np.float32)
    da = deco[..., 3] / 255.0
    layer = Layer(CROSS_PX, CROSS_PX)
    layer.over(col, alpha)
    layer.over((0, 0, 0), np.clip(ndi.gaussian_filter(da, 8) * 1.3, 0, 1) * 0.55 * (1 - da))
    d_diff, d_spec = lighting(ndi.gaussian_filter(da, 3), 25)
    layer.over(np.clip(deco[..., :3] * (0.72 + 0.4 * d_diff)[..., None]
                       + (d_spec ** 30 * 60)[..., None], 0, 255), da)
    safe = np.where(layer.a > 1e-6, layer.a, 1)[..., None]
    return layer.a, layer.rgb / safe, None


def rays():
    """Soft gold rays for behind the victory cross."""
    m_long, m_short = Mask(), Mask()
    for k in range(48):
        long_ = k % 2 == 0
        r0, r1, w0 = 250, (640 if long_ else 500), (20 if long_ else 12)
        (m_long if long_ else m_short).poly(rot([up(-w0 / 2, r0), up(w0 / 2, r0), up(0, r1)], k * 7.5))
    yy, xx = np.mgrid[0:CROSS_PX, 0:CROSS_PX]
    ctr = Mask().to_px(C)
    r = np.hypot(xx - ctr[0], yy - ctr[1]) / Mask().ppu()
    fade = np.clip(1 - (r - 250) / 420, 0, 1) ** 1.3
    a = np.clip((m_long.arr() + m_short.arr() * 0.8) * fade, 0, 1)
    layer = Layer(CROSS_PX, CROSS_PX)
    layer.over(WARM_GLOW, 0.35 * np.exp(-(r / 380) ** 2))
    layer.over((255, 214, 130), np.clip(ndi.gaussian_filter(a, 8) * 1.4, 0, 1) * 0.5)
    layer.over((255, 236, 186), a * 0.85)
    return layer


def render_cross(fn, glow=0.55, glow_r=40, shadow=0.6):
    alpha, col, backing = fn()
    layer = Layer(CROSS_PX, CROSS_PX)
    glow_and_shadow(layer, alpha, glow=glow, glow_r=glow_r, shadow=0)
    if backing is not None:
        layer.over(*backing)
    layer.over((0, 0, 0), np.clip(ndi.gaussian_filter(alpha, 10) * 1.3, 0, 1) * shadow)
    layer.over(col, alpha)
    return layer


def resize_layer(layer, size):
    img = layer.image().resize((size, size), Image.LANCZOS)
    arr = np.asarray(img, np.float32)
    out = Layer(size, size)
    out.over(arr[..., :3], arr[..., 3] / 255.0)
    return out


def ready_frame(cross_layer, extra_below=None):
    """Place a cross above the singer's head on a full 1080x1920 frame."""
    size = int(round(CROSS_PX * CROSS_HEIGHT / (CROSS_PX * 0.76)))
    frame = Layer(H, W)
    yy, xx = np.mgrid[0:H, 0:W]
    cx, cy = CROSS_CENTER
    rr = np.hypot((xx - cx) / 1.0, (yy - cy) / 1.05) / (CROSS_HEIGHT * 0.9)
    frame.over(SMOKE, 0.5 * np.exp(-rr ** 1.8))
    at = (cx - size // 2, cy - size // 2)
    if extra_below is not None:
        frame.over_layer(resize_layer(extra_below, size), at)
    frame.over_layer(resize_layer(cross_layer, size), at)
    return frame


# ---------------------------------------------------------------- text
def font(size, weight=b"Bold"):
    f = ImageFont.truetype(os.path.join(FONTS, "NotoSerifEthiopic.ttf"), size)
    f.set_variation_by_name(weight)
    return f


def text_mask(text, size, weight, max_w=960, stroke=0):
    while True:
        f = font(size * SS, weight)
        l, t, r, b = f.getbbox(text, stroke_width=stroke * SS)
        if (r - l) / SS <= max_w or size <= 30:
            break
        size -= 2
    pad = 60 * SS
    img = Image.new("L", (r - l + 2 * pad, b - t + 2 * pad), 0)
    ImageDraw.Draw(img).text((pad - l, pad - t), text, font=f, fill=255,
                             stroke_width=stroke * SS, stroke_fill=255)
    img = img.resize((img.width // SS, img.height // SS), Image.LANCZOS)
    return np.asarray(img, np.float32) / 255.0


def put_text(frame, text, cy, style):
    if style == "gold":
        a = text_mask(text, 94, b"Black")
        col = metal(a, bevel=1.6, depth=22, spec=0.6, spec_pow=24, sheen=0.1)
        glow, shadow = 0.5, 0.9
    else:
        a = text_mask(text, 76, b"SemiBold")
        h = a.shape[0]
        g = np.linspace(0, 1, h)[:, None, None]
        col = np.broadcast_to((1 - g) * np.array([255, 250, 238]) + g * np.array([232, 212, 166]), a.shape + (3,))
        glow, shadow = 0.18, 0.95
    hh, ww = a.shape
    at = ((W - ww) // 2, int(cy - hh / 2))
    tmp = Layer(hh, ww)
    tmp.over(WARM_GLOW, np.clip(ndi.gaussian_filter(a, 14) * 1.6, 0, 1) * glow)
    sh = ndi.shift(ndi.gaussian_filter(a, 5), (3, 0), order=1)
    tmp.over((0, 0, 0), np.clip(sh * 1.6, 0, 1) * shadow)
    tmp.over((20, 8, 2), np.clip(ndi.grey_dilation(a, size=3) - a, 0, 1) * 0.8)
    tmp.over(col, a)
    frame.over_layer(tmp, at)


def ornament_mask(cx, cy, half=150, scale=1.0):
    """Thin gold divider with a small cross in the middle."""
    img = Image.new("L", (W * SS, H * SS), 0)
    d = ImageDraw.Draw(img)
    s = SS * scale
    for sgn in (-1, 1):
        x0, x1 = cx + sgn * 34 * scale, cx + sgn * half * scale
        d.line([(x0 * SS, cy * SS), (x1 * SS, cy * SS)], fill=255, width=int(3 * s))
        d.ellipse([(x1 - sgn * 0 - 5 * scale) * SS, (cy - 5 * scale) * SS,
                   (x1 + 5 * scale) * SS, (cy + 5 * scale) * SS], fill=255)
        dx = cx + sgn * 24 * scale
        d.polygon([((dx - 6 * scale) * SS, cy * SS), (dx * SS, (cy - 6 * scale) * SS),
                   ((dx + 6 * scale) * SS, cy * SS), (dx * SS, (cy + 6 * scale) * SS)], fill=255)
    for (w_, h_) in ((5, 16), (16, 5)):
        d.rectangle([(cx - w_ * scale) * SS, (cy - h_ * scale) * SS,
                     (cx + w_ * scale) * SS, (cy + h_ * scale) * SS], fill=255)
    return np.asarray(img.resize((W, H), Image.LANCZOS), np.float32) / 255.0


def put_ornament(frame, cy, half=150, scale=1.0):
    a = ornament_mask(W // 2, cy, half, scale)
    frame.over(WARM_GLOW, np.clip(ndi.gaussian_filter(a, 8) * 1.8, 0, 1) * 0.45)
    frame.over((0, 0, 0), np.clip(ndi.gaussian_filter(a, 3) * 1.5, 0, 1) * 0.6)
    frame.over(metal(a, bevel=1.0, depth=12, spec=0.4), a)


def text_backdrop(frame, cy, height):
    """Soft dark cloud so the words read over the white shirt."""
    yy, xx = np.mgrid[0:H, 0:W]
    rr = np.hypot((xx - W / 2) / (W * 0.62), (yy - cy) / height)
    frame.over(SMOKE, 0.58 * np.exp(-rr ** 2.4))


def lyric_card(call=None, lines=None):
    frame = Layer(H, W)
    c, o, r = TEXT_Y
    if lines:                              # refrain: two gold lines
        text_backdrop(frame, (c + r) / 2 - 20, 250)
        put_ornament(frame, c - 92)
        put_text(frame, lines[0], c - 8, "gold")
        put_text(frame, lines[1], r + 8, "gold")
    else:                                  # verse: call line + sung response
        text_backdrop(frame, (c + r) / 2, 230)
        put_text(frame, call, c, "ivory")
        put_ornament(frame, o, half=130)
        put_text(frame, RESPONSE, r, "gold")
    return frame


def title_card():
    frame = Layer(H, W)
    c, o, r = TEXT_Y
    text_backdrop(frame, c + 30, 260)
    put_ornament(frame, c - 70, half=200, scale=1.2)
    a = text_mask(RESPONSE, 128, b"Black", max_w=980)
    col = metal(a, bevel=2.2, depth=24, spec=0.7, spec_pow=24)
    hh, ww = a.shape
    tmp = Layer(hh, ww)
    tmp.over(WARM_GLOW, np.clip(ndi.gaussian_filter(a, 22) * 1.6, 0, 1) * 0.6)
    tmp.over((0, 0, 0), np.clip(ndi.shift(ndi.gaussian_filter(a, 6), (4, 0), order=1) * 1.6, 0, 1) * 0.9)
    tmp.over(col, a)
    frame.over_layer(tmp, ((W - ww) // 2, int(c + 40 - hh / 2)))
    put_ornament(frame, c + 150, half=200, scale=1.2)
    return frame


# ---------------------------------------------------------------- frame
def frame_overlay():
    """Whole-video overlay: soft top/bottom shade, vignette, manuscript border."""
    frame = Layer(H, W)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    top = 0.7 * np.clip(1 - yy / 860, 0, 1) ** 1.4
    bottom = 0.72 * np.clip((yy - 1080) / 840, 0, 1) ** 1.35
    rr = np.hypot((xx - W / 2) / (W * 0.62), (yy - H / 2) / (H * 0.58))
    vign = 0.38 * np.clip((rr - 0.55) / 0.6, 0, 1) ** 1.5
    frame.over(SMOKE, 1 - (1 - top) * (1 - bottom) * (1 - vign))

    img = Image.new("L", (W * SS, H * SS), 0)
    d = ImageDraw.Draw(img)
    S = lambda v: v * SS  # noqa: E731
    o_in, i_in = 24, 46
    d.rectangle([S(o_in), S(o_in), S(W - o_in), S(H - o_in)], outline=255, width=S(3))
    d.rectangle([S(i_in), S(i_in), S(W - i_in), S(H - i_in)], outline=255, width=S(2))
    mid = (o_in + i_in) / 2 + 1
    def diamond(x, y, r):
        d.polygon([(S(x), S(y - r)), (S(x + r), S(y)), (S(x), S(y + r)), (S(x - r), S(y))], fill=255)
    def dot(x, y, r):
        d.ellipse([S(x - r), S(y - r), S(x + r), S(y + r)], fill=255)
    for k, x in enumerate(range(90, W - 80, 30)):
        for y in (mid, H - mid):
            (diamond if k % 2 == 0 else dot)(x, y, 5 if k % 2 == 0 else 2.5)
    for k, y in enumerate(range(90, H - 80, 30)):
        for x in (mid, W - mid):
            (diamond if k % 2 == 0 else dot)(x, y, 5 if k % 2 == 0 else 2.5)
    for (x, y) in ((mid, mid), (W - mid, mid), (mid, H - mid), (W - mid, H - mid)):
        for (w_, h_) in ((5, 22), (22, 5)):
            d.rectangle([S(x - w_), S(y - h_), S(x + w_), S(y + h_)], fill=255)
        dot(x, y, 9)
        for ang in range(4):
            a = math.radians(ang * 90)
            dot(x + 22 * math.cos(a), y + 22 * math.sin(a), 5)
    for y in (mid, H - mid):
        d.rectangle([S(W / 2 - 60), S(y - 8), S(W / 2 + 60), S(y + 8)], fill=0)
        diamond(W / 2, y, 14)
        for sgn in (-1, 1):
            diamond(W / 2 + sgn * 30, y, 7)
            dot(W / 2 + sgn * 48, y, 4)
    a = np.asarray(img.resize((W, H), Image.LANCZOS), np.float32) / 255.0
    frame.over(WARM_GLOW, np.clip(ndi.gaussian_filter(a, 6) * 1.6, 0, 1) * 0.35)
    frame.over((0, 0, 0), np.clip(ndi.gaussian_filter(a, 2.5) * 1.4, 0, 1) * 0.5)
    frame.over(metal(a, bevel=1.0, depth=14, spec=0.5), a)
    return frame


# ---------------------------------------------------------------- output
CROSSES = [
    ("cross 1 - refrain", cross_refrain, {}),
    ("cross 2 - verse 1 (shield)", cross_shield, {}),
    ("cross 3 - verse 2 (red, healing)", cross_axum, {"glow": 0.45}),
    ("cross 4 - verse 3 (victory)", cross_gondar, {"glow": 0.7}),
    ("cross 5 - verse 4 (quiet)", cross_processional, {"glow": 0.3, "glow_r": 30}),
    ("cross 6 - verse 5 (life)", cross_demera, {"glow": 0.55}),
]


def save(layer, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    layer.image().save(path, optimize=True)
    print("wrote", os.path.relpath(path, HERE))


def main(out_dir):
    kit = os.path.join(out_dir, "Meskel Hailachin kit")
    save(frame_overlay(), os.path.join(kit, "1 frame - whole video.png"))
    save(title_card(), os.path.join(kit, "2 title.png"))

    ray_layer = rays()
    save(ray_layer, os.path.join(kit, "big crosses", "rays.png"))
    for name, fn, kw in CROSSES:
        layer = render_cross(fn, **kw)
        save(layer, os.path.join(kit, "big crosses", name + ".png"))
        below = ray_layer if fn is cross_gondar else None
        save(ready_frame(layer, below), os.path.join(kit, "3 crosses", name + ".png"))

    n = 1
    for i, lines in enumerate(REFRAIN):
        save(lyric_card(lines=lines),
             os.path.join(kit, "4 lyrics", f"lyric {n:02d} - refrain {'AB'[i]}.png"))
        n += 1
    for v, verse in enumerate(VERSES, 1):
        for li, call in enumerate(verse, 1):
            save(lyric_card(call=call),
                 os.path.join(kit, "4 lyrics", f"lyric {n:02d} - verse {v} line {li}.png"))
            n += 1
    write_readme(kit)
    return kit


README = """MESKEL HAILACHIN (መስቀል ኃይላችን) - MOTION DESIGN KIT
For DaVinci Resolve. Vertical video, 1080 x 1920.
All pictures are PNG with a see-through background.

WHAT IS IN THIS FOLDER
  1 frame - whole video.png   Gold border and soft dark edges. Use it over the WHOLE video.
  2 title.png                 The song title. Use it for the first 3-5 seconds.
  3 crosses                   6 crosses, already placed above your head:
      cross 1 - refrain                  every refrain
      cross 2 - verse 1 (shield)         verse 1
      cross 3 - verse 2 (red, healing)   verse 2
      cross 4 - verse 3 (victory)        verse 3 (with gold rays)
      cross 5 - verse 4 (quiet)          verse 4
      cross 6 - verse 5 (life)           verse 5 (Meskel flowers)
  4 lyrics                    One picture for each sung line. Each verse picture also
                              shows the answer "መስቀል ኃይላችን".
  big crosses                 Big square versions of the crosses and the rays,
                              for the start, the ending, or your own layouts.

HOW TO USE (DaVinci Resolve, Edit page)
  1. Drag this whole folder from File Explorer into the Media Pool (top left in Resolve).
  2. Track V1 = your video.
  3. Track V2 = "1 frame - whole video". Click it, press Ctrl + D and type the length
     of your video (for example 00:02:53:00), then OK.
  4. Track V3 = the crosses. Put each cross where its part of the song starts.
  5. Track V4 = the lyrics. Put each lyric picture where you sing that line.
  6. Soft fade in and out: click a picture, then press Ctrl + T.
  Tip: to make a new track, drag a picture ABOVE the top track.

LYRICS IN EACH PICTURE
"""


def write_readme(kit):
    rows = []
    n = 1
    for i, lines in enumerate(REFRAIN):
        rows.append(f"  lyric {n:02d} - refrain {'AB'[i]}:  " + " / ".join(lines))
        n += 1
    for v, verse in enumerate(VERSES, 1):
        for li, call in enumerate(verse, 1):
            rows.append(f"  lyric {n:02d} - verse {v} line {li}:  {call} - {RESPONSE}")
            n += 1
    with open(os.path.join(kit, "README.txt"), "w", encoding="utf-8-sig", newline="\r\n") as f:
        f.write(README + "\n".join(rows) + "\n")


def zip_dir(path, zip_path):
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for root, _, files in os.walk(path):
            for f in sorted(files):
                full = os.path.join(root, f)
                z.write(full, os.path.relpath(full, os.path.dirname(path)))
    print("wrote", zip_path)


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "out")
    kit_dir = main(out)
    zip_dir(kit_dir, os.path.join(out, "Meskel-Hailachin-kit.zip"))
