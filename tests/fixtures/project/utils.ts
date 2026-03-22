export function formatDate(date: Date): string {
  return date.toISOString();
}

export function parseNumber(s: string): number {
  return parseInt(s, 10);
}

export const VERSION = "1.0.0";
