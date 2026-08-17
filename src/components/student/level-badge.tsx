import { Badge } from "@/components/ui/badge";

/**
 * Purely presentational. Receives an already-resolved display label (or
 * null), never a raw StudentLevel enum value — all i18n resolution (which
 * includes reusing courseLevels.*.title for the level name; see the
 * dashboard page) happens in the server page above it, where the
 * translator instances already live. Level isn't sensitive content, but
 * keeping this component prop-only rather than translation-aware keeps it
 * simple and matches the rest of the dashboard's client leaf components,
 * which also receive nothing beyond what they need to render.
 */
export function LevelBadge({ label, emptyText }: { label: string | null; emptyText: string }) {
  if (!label) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <Badge variant="secondary" className="text-sm">
      {label}
    </Badge>
  );
}
