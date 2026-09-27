import type { CompletionFields } from "@/context/OnboardingContext";

export type CompletionErrors = Partial<Record<keyof CompletionFields, string>>;

export function validateCompletion(completion: CompletionFields): CompletionErrors {
  const errors: CompletionErrors = {};
  if (!completion.email.trim()) errors.email = "L’email professionnel est requis.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(completion.email)) errors.email = "Saisissez une adresse email valide.";
  if (!completion.phone.trim()) errors.phone = "Le téléphone professionnel est requis.";
  if (!completion.noWebsite && !completion.website.trim()) errors.website = "Indiquez un site web ou cochez l’option correspondante.";
  if (!completion.description.trim()) errors.description = "La description de l’activité est requise.";
  if (!completion.monthlyVolume.trim()) errors.monthlyVolume = "Le volume mensuel estimé est requis.";
  if (!completion.intendedUse.trim()) errors.intendedUse = "L’usage prévu du compte est requis.";
  return errors;
}
