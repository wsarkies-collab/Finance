export function fmt(value: number | null): string {
  return value !== null ? value.toFixed(2) : "n/a";
}

export function fmtPct(value: number | null): string {
  return value !== null ? `${(value * 100).toFixed(1)}%` : "n/a";
}

export function signClass(value: number | null): string {
  if (value === null) return "muted";
  return value >= 0 ? "positive" : "negative";
}
