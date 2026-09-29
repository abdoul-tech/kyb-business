import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

// Format chiffré : iv (12 o) | tag GCM (16 o) | texte chiffré.
export function encrypt(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

// Valeur JSON chiffrée, encodée en base64 pour être stockée en base (sorties d'extraction).
export function encryptJson(value: unknown, key: Buffer): string {
  return encrypt(Buffer.from(JSON.stringify(value), "utf8"), key).toString("base64");
}

export function decryptJson(payload: string, key: Buffer): unknown {
  return JSON.parse(decrypt(Buffer.from(payload, "base64"), key).toString("utf8"));
}

export function decrypt(payload: Buffer, key: Buffer): Buffer {
  if (payload.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Contenu chiffré tronqué.");
  }

  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
