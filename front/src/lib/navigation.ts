// Spec, « Front » : /dossier/[id]/documents, /verifier, /completer, /recap.
export type StepKey = "documents" | "verifier" | "completer" | "recap";

export const steps: { key: StepKey; number: string; label: string }[] = [
  { key: "documents", number: "01", label: "Documents" },
  { key: "verifier", number: "02", label: "Vérifier" },
  { key: "completer", number: "03", label: "Compléter" },
  { key: "recap", number: "04", label: "Récap" },
];

export function stepHref(applicationId: string, step: StepKey): string {
  return `/dossier/${applicationId}/${step}`;
}

// Dernier dossier ouvert dans ce navigateur, pour proposer de le reprendre depuis l'accueil.
// L'identifiant seul ne donne pas accès au dossier : le jeton reste dans le cookie httpOnly.
export const LAST_APPLICATION_KEY = "kyb_last_application";
