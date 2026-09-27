import type { StepKey } from "@/types/onboarding";

export const steps: { key: StepKey; number: string; label: string; href: string }[] = [
  { key: "documents", number: "01", label: "Documents", href: "/documents" },
  { key: "verify", number: "02", label: "Vérifier", href: "/verify" },
  { key: "complete", number: "03", label: "Compléter", href: "/complete" },
  { key: "summary", number: "04", label: "Récap", href: "/summary" },
];
