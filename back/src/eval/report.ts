import { documentTypeCatalog, type DocumentTypeSlug } from "@kyb/shared";
import { aggregate, ratio, type DocumentResult, type Metrics } from "./scoring.js";

// Objectif de la spec : au moins 80 % des champs extractibles pré-remplis correctement.
export const FIELD_ACCURACY_TARGET = 0.8;

function pct(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(0)} %`;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function row(label: string, m: Metrics): string {
  return [
    pad(label, 26),
    pad(`${m.classification_correct}/${m.documents} ${pct(ratio(m.classification_correct, m.documents))}`, 14),
    pad(`${m.correct}/${m.expected_values} ${pct(ratio(m.correct, m.expected_values))}`, 16),
    pad(`${m.false_positives}/${m.expected_empty} ${pct(ratio(m.false_positives, m.expected_empty))}`, 16),
    pad(String(m.confident_errors), 11),
    `${m.cost_usd.toFixed(3)} $`,
  ].join(" ");
}

function short(value: unknown): string {
  const text = JSON.stringify(value);
  return text.length > 70 ? `${text.slice(0, 67)}...` : text;
}

// Rapport texte : tableau par type de document, puis détail des écarts à corriger.
export function formatReport(results: DocumentResult[]): string {
  const { byType, total } = aggregate(results);
  const lines: string[] = [];

  lines.push(
    [
      pad("Type", 26),
      pad("Classification", 14),
      pad("Champs corrects", 16),
      pad("Faux positifs", 16),
      pad("Err. ≥ 0,8", 11),
      "Coût",
    ].join(" "),
  );
  lines.push("-".repeat(98));
  for (const [type, metrics] of [...byType.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(row(documentTypeCatalog[type as DocumentTypeSlug].label_fr.slice(0, 26), metrics));
  }
  lines.push("-".repeat(98));
  lines.push(row("TOTAL", total));

  const accuracy = ratio(total.correct, total.expected_values);
  lines.push("");
  lines.push(
    accuracy === null
      ? "Aucun champ attendu : renseigner `fields` dans expected.json."
      : `Champs corrects : ${pct(accuracy)} (objectif ${pct(FIELD_ACCURACY_TARGET)}) → ${
          accuracy >= FIELD_ACCURACY_TARGET ? "ATTEINT" : "NON ATTEINT"
        }`,
  );
  lines.push(
    `Durée LLM cumulée : ${(total.duration_ms / 1000).toFixed(1)} s · ` +
      `coût moyen par document : ${(total.documents ? total.cost_usd / total.documents : 0).toFixed(3)} $`,
  );

  const issues = results.filter(
    (r) =>
      r.classified_type !== r.expected_type ||
      r.extraction !== "done" ||
      r.fields.some((f) => f.outcome !== "correct" && f.outcome !== "correct_empty"),
  );
  if (issues.length > 0) {
    lines.push("");
    lines.push("Écarts :");
    for (const r of issues) {
      lines.push(`  ${r.dossier}/${r.file}`);
      if (r.classified_type !== r.expected_type) {
        lines.push(
          `    classification : attendu ${r.expected_type}, obtenu ${r.classified_type ?? "erreur"} (${r.classification_confidence ?? "—"})`,
        );
      }
      if (r.extraction === "not_supported") {
        lines.push("    extraction non disponible pour ce type (J4)");
      } else if (r.extraction === "failed") {
        lines.push(`    extraction échouée : ${r.error_code}`);
      }
      for (const f of r.fields) {
        if (f.outcome === "correct" || f.outcome === "correct_empty") {
          continue;
        }
        lines.push(
          `    ${pad(f.outcome, 14)} ${pad(f.path, 30)} attendu ${short(f.expected)} · obtenu ${short(f.actual)} (${f.confidence ?? "—"})`,
        );
      }
    }
  }

  return lines.join("\n");
}
