// Spec, critère d'acceptation : « Aucune donnée d'identité dans les logs (vérifié par un test sur la sortie pino) ».
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { pinoPipelineLogger } from "../src/documents/pipeline-logger.js";
import { PipelineError, runDocumentPipeline, type PipelineDeps } from "../src/documents/pipeline.js";
import { requestLog } from "../src/http/middleware/request-log.js";
import { createLogger, serializeError } from "../src/logger.js";
import { makeRecord, MemoryDocumentStore } from "./helpers/memory-store.js";

// Données d'identité fictives : aucune ne doit apparaître dans la sortie des logs.
const IDENTITY = {
  last_name: "DIOPSECRET",
  first_name: "AwaSecret",
  date_of_birth: "1980-01-01",
  document_number: "A99887766",
  legal_name: "BARRY AUTO SECRET SARL",
  address: "Rue Secrète 12, Dakar",
  token: "tok_3f9a8b7c6d5e4f3a2b1c",
  filename: "passeport-diopsecret.pdf",
};

function capture() {
  const lines: string[] = [];
  const logger = createLogger({ level: "debug", destination: { write: (line: string) => void lines.push(line) } });
  return { logger, lines, output: () => lines.join("") };
}

function expectNoIdentity(output: string) {
  for (const value of Object.values(IDENTITY)) {
    expect(output).not.toContain(value);
  }
}

const field = (value: unknown) => ({ value, confidence: 0.9, source_page: 1 });

describe("logs pino", () => {
  it("masque les champs sensibles, à la racine et imbriqués", () => {
    const { logger, output } = capture();

    logger.info({
      last_name: IDENTITY.last_name,
      person: { first_name: IDENTITY.first_name, date_of_birth: IDENTITY.date_of_birth },
      document: { extracted_data: { legal_name: field(IDENTITY.legal_name) }, original_filename: IDENTITY.filename },
      headers: { authorization: `Bearer ${IDENTITY.token}` },
      deep: { officer: { address: IDENTITY.address, document_number: IDENTITY.document_number } },
    });

    expectNoIdentity(output());
    expect(output()).toContain("[REDACTED]");
  });

  it("n'écrit jamais le message d'une erreur, seulement son type, son code et sa pile", () => {
    const { logger, output } = capture();
    const error = Object.assign(new Error(`Nom invalide : ${IDENTITY.last_name} né le ${IDENTITY.date_of_birth}`), {
      code: "E_TEST",
    });

    logger.error({ err: error }, "boom");

    expectNoIdentity(output());
    const entry = JSON.parse(output());
    expect(entry.err).toMatchObject({ type: "Error", code: "E_TEST" });
    expect(entry.err.stack).toContain("logging.test.ts");
    expect(serializeError("chaîne")).toEqual({ type: "string" });
  });

  it("pipeline : succès et échec ne loggent que l'identifiant, l'étape et le code", async () => {
    const { logger, output } = capture();
    const store = new MemoryDocumentStore([
      makeRecord({ _id: "doc_ok", original_filename: IDENTITY.filename }),
      makeRecord({ _id: "doc_ko", original_filename: IDENTITY.filename }),
    ]);
    const deps: PipelineDeps = {
      store,
      loadContent: async () => Buffer.from("contenu"),
      classify: async () => ({ type: "id_document", confidence: 0.95, usage: [] }),
      extract: async ({ document }) => {
        if (document._id === "doc_ko") {
          throw new PipelineError("EXTRACTION_INVALID", `Champ illisible pour ${IDENTITY.last_name}`);
        }
        return {
          data: {
            last_name: field(IDENTITY.last_name),
            first_name: field(IDENTITY.first_name),
            date_of_birth: field(IDENTITY.date_of_birth),
            document_number: field(IDENTITY.document_number),
          },
          usage: [],
        };
      },
      logger: pinoPipelineLogger(logger),
    };

    await runDocumentPipeline("doc_ok", deps);
    await runDocumentPipeline("doc_ko", deps);

    expectNoIdentity(output());
    const entries = output()
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(entries).toEqual([
      expect.objectContaining({ event: "document.extracted", document_id: "doc_ok", type: "id_document" }),
      expect.objectContaining({ event: "document.failed", document_id: "doc_ko", error_code: "EXTRACTION_INVALID" }),
    ]);
  });

  it("requêtes HTTP : ni en-tête d'authentification, ni corps, ni requête", async () => {
    const { logger, output } = capture();
    const app = express();
    app.use(requestLog(logger));
    app.use(express.json());
    app.patch("/v1/applications/:id", (_req, res) => {
      res.json({ ok: true });
    });
    app.get("/boom", () => {
      throw new Error(`Erreur sur ${IDENTITY.legal_name}`);
    });
    app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: "interne" });
    });

    await request(app)
      .patch(`/v1/applications/app_123?email=${IDENTITY.last_name}`)
      .set("Authorization", `Bearer ${IDENTITY.token}`)
      .send({ business: { legal_name: IDENTITY.legal_name, address: IDENTITY.address } })
      .expect(200);
    await request(app).get("/boom").expect(500);

    expectNoIdentity(output());
    const entries = output()
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(entries[0]).toMatchObject({
      event: "http.request",
      method: "PATCH",
      path: "/v1/applications/app_123",
      status: 200,
    });
    expect(entries[1]).toMatchObject({ path: "/boom", status: 500, level: 50 });
  });
});
