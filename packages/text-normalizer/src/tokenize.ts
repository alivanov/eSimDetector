/** Токенизация нормализованной строки по пробельным символам. */
export function tokenize(input: string): string[] {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return [];
  }
  return trimmed.split(/\s+/);
}
