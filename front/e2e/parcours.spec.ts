import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Spec, « Évaluation et tests » : un test Playwright du parcours heureux.
// Documents fictifs de fixtures/fictif-demo, analysés par l'API en replay (réponses LLM enregistrées).
const FIXTURES = path.resolve(__dirname, "../../fixtures/fictif-demo");
const DOCUMENTS = ["rccm-barry-auto.pdf", "statuts-sahel-negoce.pdf", "passeport-specimen.pdf"].map((name) =>
  path.join(FIXTURES, name),
);

// Attend la fin de l'autosave (debounce de 800 ms puis requête) : plus aucun enregistrement en cours.
async function waitForAutosave(page: Page) {
  await page.waitForTimeout(1_200);
  await expect(page.locator(".save-state")).toHaveText("Brouillon sauvegardé");
}

test("parcours heureux : documents → vérifier → compléter → récap", async ({ page }) => {
  // Accueil : création du dossier (jeton posé en cookie httpOnly par le serveur Next).
  await page.goto("/");
  await page.getByRole("button", { name: /Commencer mon dossier/ }).click();
  await expect(page).toHaveURL(/\/dossier\/app_[0-9a-f-]{36}\/documents$/);
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name.startsWith("kyb_app_"))).toMatchObject({ httpOnly: true });

  // Documents : upload, puis identification et lecture en arrière-plan (polling).
  await page.locator("#file-upload").setInputFiles(DOCUMENTS);
  const list = page.locator(".document-summary");
  for (const name of ["rccm-barry-auto.pdf", "statuts-sahel-negoce.pdf", "passeport-specimen.pdf"]) {
    await expect(list.getByText(name)).toBeVisible();
  }
  await expect(list.locator(".status-badge", { hasText: "Prêt" })).toHaveCount(3, { timeout: 60_000 });
  await expect(list.getByText("Extrait RCCM / registre du commerce")).toBeVisible();
  await expect(list.getByText("Passeport ou CNI")).toBeVisible();

  // Vérifier : champs fusionnés, conflit entre le RCCM et les statuts, choix puis retour aux documents.
  await page.getByRole("link", { name: /Continuer/ }).click();
  await expect(page).toHaveURL(/\/verifier$/);
  const legalName = page.getByLabel("Dénomination sociale");
  await expect(legalName).toHaveValue("BARRY AUTO SARL");
  await expect(page.getByLabel("Numéro RCCM")).toHaveValue("NE-NIM-01-2019-B12-00987");

  const legalNameCard = page.locator(".field-card", { has: legalName });
  await expect(legalNameCard.getByText("Conflit")).toBeVisible();
  await legalNameCard.getByRole("button", { name: /SAHEL NEGOCE/ }).click();
  await expect(legalName).toHaveValue("SAHEL NEGOCE");
  await expect(legalNameCard.getByText("Saisi par vous")).toBeVisible();

  await legalNameCard.getByRole("button", { name: /Revenir à la valeur des documents/ }).click();
  await expect(legalName).toHaveValue("BARRY AUTO SARL");
  await expect(legalNameCard.getByText("Conflit")).toBeVisible();

  // Personnes : associés et gérant des statuts, dirigeant du RCCM, titulaire du passeport.
  const people = page.locator(".ubo-card h3");
  await expect(people).toHaveText([
    "Paul Wendkouni OUEDRAOGO",
    "Aïcha SAWADOGO",
    "Ibrahim Moussa BARRY",
    "FATOU AMINATA SPECIMEN",
  ]);
  const paul = page.locator(".ubo-card", { hasText: "Paul Wendkouni OUEDRAOGO" });
  await expect(paul.getByText("UBO · 25 % ou plus")).toBeVisible();
  await expect(paul.getByText("Direction")).toBeVisible();

  // Compléter : champs demandés au client, validés avec les schémas partagés, enregistrés automatiquement.
  await page.getByRole("link", { name: /Continuer/ }).click();
  await expect(page).toHaveURL(/\/completer$/);

  const email = page.getByLabel("Email professionnel");
  await email.fill("contact@");
  await email.blur();
  await expect(page.getByText("Adresse email invalide.")).toBeVisible();
  await email.fill("contact@barry.example");

  await page.getByLabel("Téléphone professionnel").fill("90 00 00 00");
  await page.getByLabel("Nous n’avons pas de site web").check();
  await page.getByLabel("Comment vos clients vous trouvent").fill("Nos clients nous trouvent via WhatsApp.");
  await page.getByLabel("Description de l'activité").fill("Vente de véhicules et de pièces détachées à Niamey.");
  await page.getByLabel("Origine des fonds").selectOption({ label: "Vente de biens et services" });
  await page.getByLabel("Chiffre d'affaires annuel estimé").selectOption("$100,000 – $999,999 USD");
  await page.getByLabel("Volume mensuel estimé (USD)").fill("25000");
  await page.getByLabel("Usage prévu du compte").fill("Paiement des fournisseurs à l'étranger.");
  await page.getByLabel("Usage prévu du compte").blur();
  await waitForAutosave(page);

  // Après rechargement : tout est enregistré, et le téléphone normalisé en E.164 (pays du RCCM : Niger).
  await page.reload();
  await expect(page.getByLabel("Email professionnel")).toHaveValue("contact@barry.example");
  await expect(page.getByLabel("Téléphone professionnel")).toHaveValue("+22790000000");
  await expect(page.getByLabel("Volume mensuel estimé (USD)")).toHaveValue("25000");
  await expect(page.getByLabel("Origine des fonds")).toHaveValue("Sales of Goods and Services");
  await expect(page.locator(".completion-count strong")).toHaveText("0");

  // Récap : pièces par section Bridge et personnes.
  await page.getByRole("link", { name: /Continuer/ }).click();
  await expect(page).toHaveURL(/\/recap$/);
  const formation = page.locator(".requirement-row", { hasText: "Documents de constitution" });
  await expect(formation.getByText("Prêt")).toBeVisible();
  await expect(page.locator(".requirement-row", { hasText: "Identité des UBO et dirigeants" }).getByText("Prêt")).toBeVisible();
  await expect(page.locator(".requirement-row", { hasText: "Justificatif d’adresse" })).toContainText("Aucune pièce");
  await expect(page.getByRole("button", { name: "Soumettre le dossier" })).toBeDisabled();
});

test("dossier inaccessible sans le cookie du navigateur qui l'a créé", async ({ page }) => {
  await page.goto("/dossier/app_00000000-0000-0000-0000-000000000000/verifier");
  await expect(page.getByText("Ce dossier n’est pas accessible depuis ce navigateur.")).toBeVisible();
});
