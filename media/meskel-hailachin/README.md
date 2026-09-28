# Meskel Hailachin (መስቀል ኃይላችን) motion-design kit

Generator for the transparent PNG overlays used in the vertical (1080×1920)
DaVinci Resolve edit of the song መስቀል ኃይላችን: six gold crosses (one per song
section), a rays layer, a manuscript-style frame, a title card and one lyric
card per sung line.

This folder is separate from the website. Nothing here is built or deployed
with the app.

## Regenerate

```sh
pip install pillow numpy scipy
mkdir -p fonts
curl -L -o fonts/NotoSerifEthiopic.ttf \
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifethiopic/NotoSerifEthiopic%5Bwdth%2Cwght%5D.ttf"
python3 meskel_kit.py out                # kit folder + zip in out/ (about 2–3 minutes)
python3 make_previews.py still.png out   # optional preview JPGs; still.png = any 9:16 frame grab
```

## What to change where

- Lyrics: `REFRAIN`, `VERSES` and `RESPONSE` at the top of `meskel_kit.py`.
- Where the crosses sit in the frame: `CROSS_CENTER`, `CROSS_HEIGHT`.
- Height of the lyric lines: `TEXT_Y`.
- Cross designs: the `cross_*` functions. Which cross goes with which section: `CROSSES`.
- The simple-English usage guide shipped inside the kit: `README` in `meskel_kit.py`.
