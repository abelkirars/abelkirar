/**
 * The vertical title sequence as a pure render of time `t` (seconds).
 * No state, no effects: same `t`, same frame — which is what a video
 * renderer needs. Units are stage pixels (1080 × 1920).
 */
import type { CSSProperties } from "react";
import {
  CUES,
  SOCIAL,
  SOCIAL_COPY,
  STRING_BOTTOM,
  STRING_COUNT,
  STRING_TOP,
  presence,
  ringAt,
  segment,
  stringStateAt,
} from "./social-timeline";
import { envelopePath, stringPath } from "./string-physics";
import { ease, lerp } from "./tokens";

const IVORY = "#faf7ef";
const GOLD = "#d7b76e";
const HEADING = "var(--font-heading), Georgia, serif";
const SANS = "var(--font-sans), system-ui, sans-serif";
const PILL = { width: 560, height: 128 };
const HOOK_Y = STRING_BOTTOM + (STRING_TOP - STRING_BOTTOM) * 0.58;

/** Line mask; em padding gives ascenders/descenders room at any size. */
function mask(fontSize: number): CSSProperties {
  return { display: "block", overflow: "hidden", fontSize, padding: "0.1em 0.1em 0.16em", margin: "-0.1em -0.1em -0.16em" };
}

/** A line that rises into its mask at `inAt` and leaves upward at `outAt`. */
function maskedY(t: number, inAt: number, outAt: number, inDuration = 0.95, outDuration = 0.45) {
  const inP = segment(t, inAt, inDuration, ease.pluck);
  const outP = segment(t, outAt, outDuration, ease.release);
  return (1 - inP) * 112 - outP * 112;
}

function Wordmark({ t }: { t: number }) {
  const spacing = lerp(0.36, 0.2, segment(t, CUES.wordmarkIn[0], 1.7, ease.pluck));
  return (
    <div style={{ textAlign: "center" }}>
      {SOCIAL_COPY.wordmark.map((word, line) => {
        const centre = (word.length - 1) / 2;
        return (
          <span key={word} style={{ ...mask(156), marginTop: line ? 18 : "-0.1em" }}>
            <span
              style={{
                display: "block",
                fontFamily: HEADING,
                fontWeight: 400,
                lineHeight: 1,
                letterSpacing: `${spacing}em`,
                marginRight: `-${spacing}em`,
              }}
            >
              {Array.from(word).map((letter, i) => {
                const inAt = CUES.wordmarkIn[line] + Math.abs(i - centre) * 0.04;
                const outAt = CUES.wordmarkOut + line * 0.05 + i * 0.02;
                return (
                  <span key={i} style={{ display: "inline-block", transform: `translateY(${maskedY(t, inAt, outAt, 1)}%)` }}>
                    {letter}
                  </span>
                );
              })}
            </span>
          </span>
        );
      })}
      <div
        style={{
          width: 128 * segment(t, CUES.ruleDraw[0], CUES.ruleDraw[1] - CUES.ruleDraw[0], ease.resonate),
          height: 2,
          margin: "56px auto 0",
          background: GOLD,
          opacity: 1 - segment(t, CUES.wordmarkOut, 0.4, ease.release),
        }}
      />
      <p
        style={{
          marginTop: 40,
          fontFamily: SANS,
          fontWeight: 500,
          fontSize: 34,
          textTransform: "uppercase",
          color: GOLD,
          letterSpacing: `${lerp(0.6, 0.34, segment(t, CUES.sublineIn, 1.4, ease.pluck))}em`,
          marginRight: "-0.34em",
          opacity: presence(t, CUES.sublineIn, 0.9, CUES.wordmarkOut, 0.4),
        }}
      >
        {SOCIAL_COPY.subline}
      </p>
    </div>
  );
}

function Message({ t }: { t: number }) {
  return (
    <div style={{ textAlign: "center" }}>
      {SOCIAL_COPY.message.map((line, i) => (
        <span key={line} style={mask(108)}>
          <span
            style={{
              display: "block",
              fontFamily: HEADING,
              fontWeight: 600,
              lineHeight: 1.06,
              letterSpacing: "-0.015em",
              transform: `translateY(${maskedY(t, CUES.messageLines[i], CUES.messageOut + i * 0.05)}%)`,
            }}
          >
            {i === 0 ? (
              <>
                Learn <span style={{ color: GOLD }}>Kirar</span>
              </>
            ) : (
              line
            )}
          </span>
        </span>
      ))}
      <p
        style={{
          marginTop: 56,
          fontFamily: SANS,
          fontSize: 46,
          color: "rgba(250,247,239,0.8)",
          opacity: presence(t, CUES.messageSubIn, 0.8, CUES.messageOut, 0.35),
          transform: `translateY(${(1 - segment(t, CUES.messageSubIn, 1, ease.pluck)) * 16}px)`,
        }}
      >
        {SOCIAL_COPY.messageSub}
      </p>
    </div>
  );
}

function Levels({ t }: { t: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 64, textAlign: "center" }}>
      {SOCIAL_COPY.levels.map((row, i) => {
        const at = CUES.levelRows[i];
        const out = CUES.levelsOut + i * 0.06;
        const soft = presence(t, at + 0.1, 0.7, out, 0.4);
        const rise = (1 - segment(t, at + 0.1, 0.9, ease.pluck)) * 18 + segment(t, out, 0.4, ease.release) * -24;
        return (
          <div key={row.title}>
            <p
              style={{
                fontFamily: SANS,
                fontWeight: 600,
                fontSize: 28,
                letterSpacing: "0.32em",
                marginRight: "-0.32em",
                textTransform: "uppercase",
                color: GOLD,
                opacity: soft,
                transform: `translateY(${rise}px)`,
              }}
            >
              {row.level}
            </p>
            <span style={{ ...mask(96), marginTop: 10 }}>
              <span
                style={{
                  display: "block",
                  fontFamily: HEADING,
                  fontWeight: 600,
                  lineHeight: 1.02,
                  transform: `translateY(${maskedY(t, at, out)}%)`,
                }}
              >
                {row.title}
              </span>
            </span>
            <p
              style={{
                marginTop: 12,
                fontFamily: SANS,
                fontSize: 42,
                color: "rgba(250,247,239,0.78)",
                opacity: soft,
                transform: `translateY(${rise}px)`,
              }}
            >
              {row.tagline}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function CallToAction({ t }: { t: number }) {
  const out = 1 - segment(t, CUES.ctaOut, 0.4, ease.release);
  const border = segment(t, CUES.urlIn, 0.9, ease.resonate);
  return (
    <div style={{ textAlign: "center", opacity: out }}>
      <span style={mask(104)}>
        <span
          style={{
            display: "block",
            fontFamily: HEADING,
            fontWeight: 600,
            lineHeight: 1.05,
            transform: `translateY(${maskedY(t, CUES.ctaIn, Infinity)}%)`,
          }}
        >
          {SOCIAL_COPY.cta}
        </span>
      </span>
      <div style={{ position: "relative", display: "grid", placeItems: "center", width: PILL.width, height: PILL.height, margin: "64px auto 0" }}>
        <svg
          width={PILL.width}
          height={PILL.height}
          style={{ position: "absolute", inset: 0, overflow: "visible" }}
          aria-hidden="true"
        >
          <rect
            x="1"
            y="1"
            width={PILL.width - 2}
            height={PILL.height - 2}
            rx={(PILL.height - 2) / 2}
            fill="none"
            stroke={GOLD}
            strokeWidth="2"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={1 - border}
          />
        </svg>
        <span
          style={{
            fontFamily: SANS,
            fontWeight: 500,
            fontSize: 50,
            letterSpacing: "0.05em",
            opacity: segment(t, CUES.urlIn + 0.15, 0.6, ease.settle),
          }}
        >
          {SOCIAL_COPY.url}
        </span>
      </div>
    </div>
  );
}

export function SocialStage({ t, showSafe = false }: { t: number; showSafe?: boolean }) {
  const { width, height, safe } = SOCIAL;
  const ring = ringAt(t);
  const veil = segment(t, 1.4, 0.9, ease.settle) * (1 - segment(t, 14.3, 0.7, ease.settle));
  const scene = (from: number, to: number) => t >= from - 0.05 && t < to + 0.6;

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        overflow: "hidden",
        color: IVORY,
        background:
          "radial-gradient(80% 50% at 50% 44%, #123b2d 0%, #0b1d16 55%, #06120d 100%)",
      }}
    >
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", inset: 0 }} aria-hidden="true">
        <defs>
          <linearGradient id="social-string" gradientUnits="userSpaceOnUse" x1="0" y1={STRING_TOP} x2="0" y2={STRING_BOTTOM}>
            <stop offset="0" stopColor="#d7b76e" stopOpacity="0.15" />
            <stop offset="0.3" stopColor="#f0e3bd" stopOpacity="1" />
            <stop offset="0.7" stopColor="#e6cf94" stopOpacity="1" />
            <stop offset="1" stopColor="#d7b76e" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        <circle cx={width / 2} cy={HOOK_Y} r={ring.radius} fill="none" stroke="#d7b76e" strokeWidth="1.5" opacity={ring.opacity} />
        {Array.from({ length: STRING_COUNT }, (_, i) => {
          const s = stringStateAt(t, i);
          const g = { x1: s.x, y1: STRING_BOTTOM, x2: s.x, y2: STRING_TOP };
          return (
            <g key={i} opacity={s.opacity}>
              <path d={envelopePath(g, 20, s.envelope)} fill="url(#social-string)" opacity={0.11} />
              <path d={stringPath(g, 40, s.displacement)} fill="none" stroke="url(#social-string)" strokeWidth={i === 2 ? 3 : 2.2} strokeLinecap="round" />
            </g>
          );
        })}
      </svg>

      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: veil,
          background: "radial-gradient(62% 36% at 50% 46%, rgba(6,18,13,0.78) 0%, rgba(6,18,13,0.35) 60%, rgba(6,18,13,0) 100%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: safe.top,
          bottom: safe.bottom,
          left: safe.left,
          right: safe.right,
        }}
      >
        {[
          { key: "wordmark", on: scene(CUES.wordmarkIn[0], CUES.wordmarkOut), node: <Wordmark t={t} /> },
          { key: "message", on: scene(CUES.messageLines[0], CUES.messageOut), node: <Message t={t} /> },
          { key: "levels", on: scene(CUES.levelRows[0], CUES.levelsOut), node: <Levels t={t} /> },
          { key: "cta", on: scene(CUES.ctaIn, CUES.ctaOut), node: <CallToAction t={t} /> },
        ].map((layer) =>
          layer.on ? (
            <div key={layer.key} style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
              {layer.node}
            </div>
          ) : null,
        )}
      </div>

      {showSafe ? <SafeZones /> : null}
    </div>
  );
}

function SafeZones() {
  const { width, height, safe } = SOCIAL;
  const band: CSSProperties = {
    position: "absolute",
    background: "repeating-linear-gradient(135deg, rgba(229,72,77,0.16) 0 14px, rgba(229,72,77,0.06) 14px 28px)",
    color: "rgba(255,255,255,0.8)",
    fontFamily: SANS,
    fontSize: 26,
    display: "grid",
    placeItems: "center",
  };
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <div style={{ ...band, left: 0, top: 0, width, height: safe.top }}>Status bar · tabs</div>
      <div style={{ ...band, left: 0, bottom: 0, width, height: safe.bottom }}>Caption · audio · handle</div>
      <div style={{ ...band, right: 0, top: safe.top, width: safe.right, height: height - safe.top - safe.bottom, writingMode: "vertical-rl" }}>
        Action rail
      </div>
      <div
        style={{
          position: "absolute",
          top: safe.top,
          left: safe.left,
          right: safe.right,
          bottom: safe.bottom,
          outline: "2px dashed rgba(215,183,110,0.7)",
        }}
      />
    </div>
  );
}
