const GRADIENTS: Record<string, string> = {
  KIRAR: "from-primary/90 to-[#7a5714]",
  BEGENA: "from-secondary to-[#123027]",
  MESENKO: "from-accent/90 to-[#7c391f]",
  OTHER: "from-muted-foreground/70 to-[#3a3126]",
};

export function categoryGradient(category: string): string {
  return GRADIENTS[category] ?? GRADIENTS.OTHER;
}
