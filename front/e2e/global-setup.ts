import { MongoClient } from "mongodb";

// Repart de collections vides à chaque exécution. On vide sans supprimer la base : l'API, déjà démarrée par
// Playwright, y a créé ses index (ex. unicité du hash d'un document par dossier).
// Les fichiers fictifs déposés dans le bucket `kyb-e2e` sont minuscules et restent.
export default async function globalSetup() {
  const client = new MongoClient("mongodb://localhost:27017/kyb_e2e", { serverSelectionTimeoutMS: 5_000 });
  try {
    await client.connect();
    const db = client.db();
    await Promise.all(["applications", "documents"].map((name) => db.collection(name).deleteMany({})));
  } finally {
    await client.close();
  }
}
