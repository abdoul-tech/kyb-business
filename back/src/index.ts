import express from "express";
import multer from "multer";
import { upload, uploadConfig } from "./storage.js";

const app = express();
const port = Number(process.env.PORT) || 4000;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/documents/upload", upload.array("file", uploadConfig.maxFiles), (req, res) => {
  const files = (req.files ?? []) as Express.Multer.File[];
  const caseId = typeof req.body.caseId === "string" && req.body.caseId.trim() ? req.body.caseId.trim() : null;

  res.status(201).json({
    caseId,
    documents: files.map((file) => ({
      id: file.filename,
      filename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      status: "uploaded",
    })),
  });
});

app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof multer.MulterError) {
    const status = error.code === "LIMIT_FILE_SIZE" || error.code === "LIMIT_FILE_COUNT" ? 413 : 400;
    res.status(status).json({ error: error.code, message: "Le fichier ne respecte pas les limites d’upload." });
    return;
  }

  if (error instanceof Error && error.message === "Unexpected field") {
    res.status(400).json({ error: "invalid_file_field", message: "Le champ multipart attendu est file." });
    return;
  }

  res.status(400).json({ error: "invalid_file", message: "Format de fichier non pris en charge." });
});

const server = app.listen(port, () => {
  console.log(`back listening on port ${port}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);