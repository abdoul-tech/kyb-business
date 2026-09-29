// Texte sans accents, en minuscules, espaces et ponctuation réduits : sert aux comparaisons, jamais au stockage.
export function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
}

// Spec, « Noms » : version normalisée (sans accents, majuscules, mots triés) pour le rapprochement uniquement.
export function normalizeName(value: string): string {
  return foldText(value).toUpperCase().split(" ").filter(Boolean).sort().join(" ");
}

// Similarité de Jaro-Winkler entre 0 et 1 (1 = identique).
export function jaroWinkler(a: string, b: string): number {
  if (a === b) {
    return 1;
  }
  if (!a.length || !b.length) {
    return 0;
  }

  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatches = new Array<boolean>(a.length).fill(false);
  const bMatches = new Array<boolean>(b.length).fill(false);
  let matches = 0;

  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - window);
    const end = Math.min(i + window + 1, b.length);
    for (let j = start; j < end; j++) {
      if (!bMatches[j] && a[i] === b[j]) {
        aMatches[i] = true;
        bMatches[j] = true;
        matches++;
        break;
      }
    }
  }
  if (matches === 0) {
    return 0;
  }

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) {
      continue;
    }
    while (!bMatches[k]) {
      k++;
    }
    if (a[i] !== b[k]) {
      transpositions++;
    }
    k++;
  }

  const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
    prefix++;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}
