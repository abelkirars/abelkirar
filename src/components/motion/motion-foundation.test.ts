import { describe, expect, it } from "vitest";
import {
  createExcitation,
  excitationDisplacement,
  excitationEnergy,
  isSettled,
  locateOnString,
  modeWeights,
  shapeAt,
  stringPath,
} from "./string-physics";
import { EASE, cubicBezier } from "./tokens";

const voice = { frequency: 4, decay: 1 };

describe("cubicBezier", () => {
  it("matches the linear curve and pins its endpoints", () => {
    const linear = cubicBezier([0, 0, 1, 1]);
    for (const x of [0, 0.25, 0.5, 0.9, 1]) expect(linear(x)).toBeCloseTo(x, 4);
    const pluck = cubicBezier(EASE.pluck);
    expect(pluck(0)).toBe(0);
    expect(pluck(1)).toBe(1);
  });

  it("is monotonic for every motion token", () => {
    for (const bezier of Object.values(EASE)) {
      const curve = cubicBezier(bezier);
      let previous = -Infinity;
      for (let i = 0; i <= 100; i++) {
        const y = curve(i / 100);
        expect(y).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = y;
      }
    }
  });
});

describe("plucked string", () => {
  it("peaks at exactly the pluck point for any pluck position", () => {
    for (const p of [0.2, 0.5, 0.62, 0.8]) {
      expect(shapeAt(p, modeWeights(p))).toBeCloseTo(1, 6);
    }
  });

  it("keeps both ends of the string fixed", () => {
    const ex = createExcitation({ start: 0, position: 0.4, amplitude: 12, pull: 120 });
    for (const ms of [0, 60, 120, 400, 1500]) {
      expect(excitationDisplacement(0, ms, ex, voice)).toBeCloseTo(0, 6);
      expect(excitationDisplacement(1, ms, ex, voice)).toBeCloseTo(0, 6);
    }
  });

  it("releases from the anticipation pull without a jump", () => {
    const ex = createExcitation({ start: 0, position: 0.55, amplitude: 20, pull: 150 });
    const before = excitationDisplacement(0.55, 149.999, ex, voice);
    const after = excitationDisplacement(0.55, 150, ex, voice);
    expect(Math.abs(after - before)).toBeLessThan(0.01);
    expect(after).toBeCloseTo(20, 4);
  });

  it("decays to rest and treats future plucks as pending", () => {
    const ex = createExcitation({ start: 0, position: 0.5, amplitude: 10, pull: 0 });
    expect(excitationEnergy(0, ex, voice)).toBeCloseTo(10);
    expect(isSettled(8000, ex, voice)).toBe(true);
    expect(isSettled(-50, ex, voice)).toBe(false);
  });

  it("locates a point relative to a string", () => {
    const g = { x1: 0, y1: 0, x2: 0, y2: 100 };
    const hit = locateOnString(g, -5, 25);
    expect(hit.u).toBeCloseTo(0.25);
    expect(Math.abs(hit.distance)).toBeCloseTo(5);
  });

  it("builds a path that starts and ends on the fixed endpoints", () => {
    const d = stringPath({ x1: 10, y1: 0, x2: 10, y2: 200 }, 12, () => 0);
    expect(d.startsWith("M10 0")).toBe(true);
    expect(d.endsWith("L10 200")).toBe(true);
  });
});

describe("kirar audio", async () => {
  const { existsSync, statSync } = await import("node:fs");
  const path = await import("node:path");
  const { findAttack, velocityCutoff, velocityGain } = await import("./kirar-audio");
  const manifest = (await import("./kirar-audio-manifest.json")).default;

  it("maps visual strings 1–5 to recordings 1–5 in order", () => {
    expect(manifest.map((entry) => entry.file)).toEqual(["string-1", "string-2", "string-3", "string-4", "string-5"]);
  });

  it("ships an Opus and an MP3 web copy for every string, and no WAV", () => {
    for (const entry of manifest) {
      for (const format of ["webm", "mp3"]) {
        const file = path.join(process.cwd(), "public", "audio", "kirar", `${entry.file}.${format}`);
        expect(existsSync(file)).toBe(true);
        expect(statSync(file).size).toBeLessThan(100_000);
      }
      expect(existsSync(path.join(process.cwd(), "public", "audio", "kirar", `${entry.file}.wav`))).toBe(false);
    }
  });

  it("balances strings gently, keeping natural differences", () => {
    for (const entry of manifest) expect(Math.abs(entry.balanceDb)).toBeLessThanOrEqual(3);
  });

  it("gets louder and brighter with pluck strength, never above unity", () => {
    let previousGain = 0;
    let previousCutoff = 0;
    for (let s = 0; s <= 1.0001; s += 0.1) {
      expect(velocityGain(s)).toBeGreaterThan(previousGain);
      expect(velocityCutoff(s)).toBeGreaterThanOrEqual(previousCutoff);
      previousGain = velocityGain(s);
      previousCutoff = velocityCutoff(s);
    }
    expect(velocityGain(5)).toBeCloseTo(1);
  });

  it("starts playback just before the attack, skipping codec padding", () => {
    const rate = 48000;
    const channel = new Float32Array(rate);
    const attack = 312;
    for (let i = attack; i < rate; i++) channel[i] = Math.sin(i / 7) * Math.exp(-(i - attack) / 8000) * 0.4;
    const offset = findAttack(channel, rate);
    expect(offset * rate).toBeLessThanOrEqual(attack);
    expect(attack - offset * rate).toBeLessThanOrEqual(0.004 * rate);
  });
});
