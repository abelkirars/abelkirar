# Motion lab

An isolated, dev-only demo of the Abelkirar motion language. It lives entirely
in `src/app/motion-lab/` and changes no existing file.

- `/motion-lab` — the full system, section by section, each with Replay.
- `/motion-lab/social` — the 1080 × 1920 title sequence full-screen.
- `/motion-lab/social?clean` — stage only, for screen recording.

**Production safety.** `_lab/gate.ts` returns 404 for every lab route when
`NODE_ENV === "production"`, so a production build serves exactly what it
served before. The pages are also `noindex`, are not linked from the site, and
read no database: course prices are static demo values in `_lab/copy.ts`,
while the text itself comes from `messages/{locale}.json`.

## The system in one line

Pluck → resonance → rest: a short attack, a long decelerating sustain, then
stillness. Timings are counted against a 720 ms beat (~83 BPM).

| Token | Curve | Use |
| --- | --- | --- |
| pluck | `cubic-bezier(0.16, 1, 0.3, 1)` | entrances and reveals |
| resonate | `cubic-bezier(0.65, 0, 0.35, 1)` | lines drawing, panels opening |
| settle | `cubic-bezier(0.22, 1, 0.36, 1)` | selection, hover, toggles |
| release | `cubic-bezier(0.5, 0, 0.75, 0)` | exits (always shorter) |

Durations: micro 180–260 ms · state 420–480 ms · entrance 700–1150 ms ·
drawing/cinematic 1.4–2.4 s. Staggers: letters 40–48 ms from the centre out,
words 45–55 ms, lines 110 ms, cards 120 ms. Selected scale is 1.02, with no bounce.

## Where things are

| File | What |
| --- | --- |
| `_lab/tokens.ts`, `motion-lab.module.css` | tokens; every transition and its reduced-motion variant |
| `_lab/string-physics.ts` | plucked-string model (harmonics, decay, blur envelope) |
| `_lab/kirar-strings.tsx` | interactive strings: drag to pull and release, sweep to strum |
| `_lab/sound-field.tsx` | faint "air" lines; a wave travels through them on each pluck |
| `_lab/reveal.tsx` | line-aware masked headline, eyebrow tracking settle |
| `_lab/string-button.tsx` | CTA: hover string, press, release ring |
| `_lab/social-timeline.ts`, `social-stage.tsx` | the vertical sequence as a pure function of time |
| `_lab/motion-core.test.ts` | physics, easing, and seamless-loop tests |

The social and lower-third stages render from `t` alone, so moving them to a
frame renderer later (for example `t = frame / fps`) needs no redesign.

## Adopting it on the live site (not done here)

Copy the tokens into `globals.css`, then replace the hero's fade-ups with
`RevealText`, `Eyebrow` and `KirarStrings`, and the plan selector's colour
swap with the selected-plan treatment. Each is a separate, reviewable change.
