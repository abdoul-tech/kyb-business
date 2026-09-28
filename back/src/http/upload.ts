import multer from "multer";
import { env } from "../config/env.js";

export const MAX_FILES_PER_UPLOAD = 10;

// Les fichiers restent en mémoire le temps du contrôle et du chiffrement : rien n'est écrit en clair sur disque.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_FILE_BYTES,
    files: MAX_FILES_PER_UPLOAD,
  },
});
