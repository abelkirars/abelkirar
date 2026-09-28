#!/usr/bin/env python3
"""Preview JPGs of the Meskel Hailachin kit.

Usage:  python3 make_previews.py STILL [output_dir]
STILL is any 9:16 frame grab of the video; it is only used as a backdrop.
Run meskel_kit.py first so the kit exists in output_dir.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

import meskel_kit as K


def compose(still, layers):
    bg = still.copy()
    for layer in layers:
        bg.alpha_composite(layer)
    return bg.convert("RGB")


def main(still_path, out):
    kit = os.path.join(out, "Meskel Hailachin kit")

    def P(*p):
        return Image.open(os.path.join(kit, *p)).convert("RGBA")

    still = (Image.open(still_path).convert("RGB").resize((K.W, K.H), Image.LANCZOS)
             .filter(ImageFilter.GaussianBlur(2)).convert("RGBA"))
    label_font = ImageFont.load_default(size=34)

    # 1. how it looks: title, refrain, verse 1, verse 3
    frame = P("1 frame - whole video.png")
    shots = [
        [frame, P("2 title.png")],
        [frame, P("3 crosses", "cross 1 - refrain.png"), P("4 lyrics", "lyric 01 - refrain A.png")],
        [frame, P("3 crosses", "cross 2 - verse 1 (shield).png"), P("4 lyrics", "lyric 03 - verse 1 line 1.png")],
        [frame, P("3 crosses", "cross 4 - verse 3 (victory).png"), P("4 lyrics", "lyric 14 - verse 3 line 4.png")],
    ]
    sheet = Image.new("RGB", (K.W * 4 + 60, K.H), (0, 0, 0))
    for i, layers in enumerate(shots):
        sheet.paste(compose(still, layers), (i * (K.W + 20), 0))
    sheet.resize((sheet.width * 2 // 5, sheet.height * 2 // 5), Image.LANCZOS).save(
        os.path.join(out, "preview 1 - how it looks.jpg"), quality=88)

    # 2. the six crosses
    labels = ["Refrain", "Verse 1 - shield", "Verse 2 - healing",
              "Verse 3 - victory", "Verse 4 - quiet", "Verse 5 - life"]
    T = 560
    sheet = Image.new("RGBA", (T * 3, (T + 60) * 2), (40, 16, 12, 255))
    d = ImageDraw.Draw(sheet)
    rays = P("big crosses", "rays.png").resize((T, T), Image.LANCZOS)
    for i, ((name, fn, _), label) in enumerate(zip(K.CROSSES, labels)):
        x, y = (i % 3) * T, (i // 3) * (T + 60)
        if fn is K.cross_gondar:
            sheet.alpha_composite(rays, (x, y))
        sheet.alpha_composite(P("big crosses", name + ".png").resize((T, T), Image.LANCZOS), (x, y))
        d.text((x + T // 2, y + T + 18), label, font=label_font, fill=(240, 205, 130), anchor="mt")
    sheet.convert("RGB").save(os.path.join(out, "preview 2 - crosses.jpg"), quality=90)

    # 3. every lyric card, to check the spelling
    files = sorted(os.listdir(os.path.join(kit, "4 lyrics")))
    tw, th = 540, 200
    sheet = Image.new("RGBA", (tw * 2, th * ((len(files) + 1) // 2)), (24, 10, 8, 255))
    d = ImageDraw.Draw(sheet)
    small = ImageFont.load_default(size=22)
    for i, f in enumerate(files):
        card = P("4 lyrics", f).crop((0, 1240, K.W, 1640)).resize((tw, th), Image.LANCZOS)
        x, y = (i % 2) * tw, (i // 2) * th
        sheet.alpha_composite(card, (x, y))
        d.text((x + 10, y + 8), f[6:8], font=small, fill=(200, 170, 110))
        d.line([(x, y + th - 1), (x + tw, y + th - 1)], fill=(70, 40, 30), width=1)
    sheet.convert("RGB").save(os.path.join(out, "preview 3 - lyrics.jpg"), quality=90)
    print("previews written to", out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else os.path.join(K.HERE, "out"))
