"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { cn } from "@/lib/utils";
import { useFrameLoop, useVisible } from "./hooks";
import styles from "./motion-lab.module.css";

export interface SoundFieldHandle {
  /** Send a wave outward from a point (client coordinates). Strength 0–1. */
  ripple: (clientX: number, clientY: number, strength: number) => void;
}

interface Ripple {
  x: number;
  y: number;
  start: number;
  strength: number;
}

const WAVE_SPEED = 420; // px/s — slow enough to follow with the eye
const WAVE_WIDTH = 70;
const WAVE_DECAY = 0.95; // s

/**
 * Faint horizontal "air" lines. They drift almost imperceptibly, and when a
 * string is plucked a single soft wave travels through them and fades —
 * sound moving through the room, not a visualiser.
 */
export function SoundField({
  ref,
  reduced,
  lines = 7,
  className,
}: {
  ref?: Ref<SoundFieldHandle>;
  reduced: boolean;
  lines?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ripples = useRef<Ripple[]>([]);
  const size = useRef({ width: 0, height: 0, dpr: 1 });
  const visible = useVisible(canvasRef);
  const reducedRef = useRef(reduced);

  function draw(now: number) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const { width, height, dpr } = size.current;
    const still = reducedRef.current;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    const t = now / 1000;
    ripples.current = ripples.current.filter((r) => now - r.start < 4000);

    for (let i = 0; i < lines; i++) {
      const y0 = height * (0.16 + (i / Math.max(1, lines - 1)) * 0.72);
      const phase = i * 1.7;
      context.beginPath();
      for (let x = -12; x <= width + 12; x += 10) {
        let y = y0;
        if (!still) {
          y += 3 * Math.sin(x * 0.0045 + t * 0.3 + phase) + 1.4 * Math.sin(x * 0.011 - t * 0.19 + phase * 0.5);
          for (const r of ripples.current) {
            const age = (now - r.start) / 1000;
            if (age < 0) continue;
            const distance = Math.hypot(x - r.x, y0 - r.y);
            const offset = distance - age * WAVE_SPEED;
            const k = offset / WAVE_WIDTH;
            y +=
              r.strength *
              16 *
              Math.exp(-k * k) *
              Math.exp(-age / WAVE_DECAY) *
              Math.sin(offset * 0.06) *
              Math.exp(-Math.abs(y0 - r.y) / 360);
          }
        }
        if (x === -12) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      const alpha = 0.05 + 0.08 * Math.sin((i / Math.max(1, lines - 1)) * Math.PI);
      context.strokeStyle = `rgba(215, 183, 110, ${alpha.toFixed(3)})`;
      context.lineWidth = 1;
      context.stroke();
    }
  }

  useEffect(() => {
    reducedRef.current = reduced;
    draw(performance.now());
  });

  useImperativeHandle(ref, () => ({
    ripple(clientX, clientY, strength) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect || reducedRef.current) return;
      ripples.current.push({ x: clientX - rect.left, y: clientY - rect.top, start: performance.now(), strength });
      if (ripples.current.length > 10) ripples.current.shift();
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const { width, height } = entry.contentRect;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      size.current = { width, height, dpr };
      draw(performance.now());
    });
    observer.observe(canvas);
    return () => observer.disconnect();
    // draw only reads refs; it is safe to capture once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrameLoop(visible && !reduced, draw);

  return <canvas ref={canvasRef} className={cn(styles.soundField, className)} aria-hidden="true" />;
}
