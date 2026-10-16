/** Morning 5–12, afternoon 12–17, evening 17–22, night otherwise (local time). */
export function partOfDay(now: Date): "morning" | "afternoon" | "evening" | "night" {
  const h = now.getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "night";
}
