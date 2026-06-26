export function estimateUsageFromText(text: string) {
  return {
    totalTokens: estimateTokenCount(text),
  };
}

function estimateTokenCount(text: string) {
  if (!text.trim()) return 0;

  const cjkCharacters = text.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  const nonCjkText = text.replace(/[\u3400-\u9fff\uf900-\ufaff]/g, " ");
  const wordLikeTokens = nonCjkText.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g)?.length ?? 0;

  return Math.max(1, Math.ceil(cjkCharacters + wordLikeTokens * 1.3));
}
