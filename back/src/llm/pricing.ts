// Tarifs OpenAI en USD par million de tokens (entrée, sortie), pour estimer le coût par document.
// À vérifier sur https://openai.com/api/pricing avant toute décision budgétaire ; un modèle absent a un coût `null`.
const PRICES_PER_MILLION: Record<string, { input: number; output: number }> = {
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

// L'API renvoie souvent un nom daté (ex. « gpt-4.1-2025-04-14 ») : on retient le préfixe connu le plus long.
function priceFor(model: string) {
  const match = Object.keys(PRICES_PER_MILLION)
    .filter((known) => model === known || model.startsWith(`${known}-`))
    .sort((a, b) => b.length - a.length)[0];
  return match ? PRICES_PER_MILLION[match] : undefined;
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const price = priceFor(model);
  if (!price) {
    return null;
  }
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
