import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { DocumentTypeSlugSchema } from "@kyb/shared";
import { z } from "zod";

// Format de `fixtures/<dossier>/expected.json` (spec : « Jeu d'évaluation »).
export const ExpectedDossierSchema = z.strictObject({
  description: z.string().optional(),
  documents: z.record(
    z.string(),
    z.strictObject({
      type: DocumentTypeSlugSchema,
      // Chemin de champ → valeur attendue (null = doit rester vide). Les champs absents ne sont pas notés.
      fields: z.record(z.string(), z.unknown()).default({}),
    }),
  ),
});

export type ExpectedDossier = z.infer<typeof ExpectedDossierSchema>;

export type EvalDocument = {
  file: string;
  content: Buffer;
  expected: ExpectedDossier["documents"][string];
};

export type EvalDossier = {
  name: string;
  description: string | undefined;
  documents: EvalDocument[];
};

// Dossiers ignorés : réponses LLM enregistrées.
const IGNORED = new Set(["llm"]);

async function isFile(file: string): Promise<boolean> {
  return stat(file).then((s) => s.isFile()).catch(() => false);
}

// Cherche les dossiers contenant un expected.json, sur deux niveaux : `fixtures/<dossier>` et
// `fixtures/private/<dossier>` (ignoré par git, pour des documents réels qu'on ne veut pas versionner).
async function findDossierDirs(root: string, depth = 2): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const dirs: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || IGNORED.has(entry.name)) {
      continue;
    }
    const dir = path.join(root, entry.name);
    if (await isFile(path.join(dir, "expected.json"))) {
      dirs.push(dir);
    } else if (depth > 1) {
      dirs.push(...(await findDossierDirs(dir, depth - 1)));
    }
  }
  return dirs.sort();
}

export async function loadDossier(dir: string, root: string): Promise<EvalDossier> {
  const name = path.relative(root, dir).split(path.sep).join("/");
  let expected: ExpectedDossier;
  try {
    expected = ExpectedDossierSchema.parse(JSON.parse(await readFile(path.join(dir, "expected.json"), "utf8")));
  } catch (error) {
    throw new Error(`${name}/expected.json invalide : ${(error as Error).message}`);
  }

  const documents: EvalDocument[] = [];
  for (const [file, expectation] of Object.entries(expected.documents)) {
    const filePath = path.join(dir, file);
    if (!(await isFile(filePath))) {
      throw new Error(`${name} : fichier ${file} déclaré dans expected.json mais absent.`);
    }
    documents.push({ file, content: await readFile(filePath), expected: expectation });
  }

  return { name, description: expected.description, documents };
}

export async function loadDataset(root: string, filter?: string): Promise<EvalDossier[]> {
  const dirs = await findDossierDirs(root);
  const dossiers: EvalDossier[] = [];
  for (const dir of dirs) {
    const dossier = await loadDossier(dir, root);
    if (!filter || dossier.name.includes(filter)) {
      dossiers.push(dossier);
    }
  }
  return dossiers;
}
