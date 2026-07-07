import { cn } from "@/lib/utils";

/**
 * Decorative, low-opacity repeating Ethiopian-cross motif used as a
 * textured background layer behind hero/CTA sections in place of
 * photography we don't have yet.
 */
export function CrossPattern({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
    >
      <defs>
        <pattern
          id="abelkirar-cross"
          width="64"
          height="64"
          patternUnits="userSpaceOnUse"
        >
          <g fill="none" stroke="currentColor" strokeWidth="1.25">
            <path d="M32 14v36M14 32h36" />
            <path d="M22 22l20 20M42 22l-20 20" opacity="0.5" />
            <circle cx="32" cy="32" r="15" opacity="0.4" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#abelkirar-cross)" />
    </svg>
  );
}
