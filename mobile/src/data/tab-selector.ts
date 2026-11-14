// Continuous tab positions skip the central action, which is never a destination.
export function tabOffset(index: number, tabWidth: number, actionWidth: number) {
  const value = Math.max(0, Math.min(3, index));
  return value * tabWidth + Math.max(0, Math.min(1, value - 1)) * actionWidth;
}

export function tabIndexAt(offset: number, tabWidth: number, actionWidth: number) {
  if (offset <= tabWidth) return Math.max(0, offset / tabWidth);
  if (offset < tabWidth * 2 + actionWidth) return 1 + (offset - tabWidth) / (tabWidth + actionWidth);
  return Math.min(3, (offset - actionWidth) / tabWidth);
}
