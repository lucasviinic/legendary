/** Limpa a legenda: tira tags, notas de som e nomes de personagem. */
export function normalize(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/♪[^♪]*♪?/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[-–—]\s*/, '')
    .replace(/^[A-Z][A-Z0-9 .'-]*:\s*/, '')
    .trim();
}
