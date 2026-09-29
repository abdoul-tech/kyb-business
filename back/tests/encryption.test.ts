import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, decryptJson, encrypt, encryptJson } from "../src/documents/encryption.js";

const key = randomBytes(32);

describe("encryption AES-256-GCM", () => {
  it("restitue le contenu d'origine", () => {
    const plaintext = Buffer.from("extrait RCCM confidentiel");
    expect(decrypt(encrypt(plaintext, key), key)).toEqual(plaintext);
  });

  it("ne laisse pas le contenu en clair et change d'IV à chaque appel", () => {
    const plaintext = Buffer.from("%PDF-1.4 contenu");
    const first = encrypt(plaintext, key);
    const second = encrypt(plaintext, key);

    expect(first.includes(plaintext)).toBe(false);
    expect(first.equals(second)).toBe(false);
  });

  it("refuse un contenu altéré", () => {
    const payload = encrypt(Buffer.from("contenu"), key);
    payload[payload.length - 1]! ^= 0xff;
    expect(() => decrypt(payload, key)).toThrow();
  });

  it("chiffre une valeur JSON en base64 sans la laisser lisible", () => {
    const value = { last_name: { value: "DIOP", confidence: 0.9, source_page: 1 } };
    const payload = encryptJson(value, key);

    expect(Buffer.from(payload, "base64").includes(Buffer.from("DIOP"))).toBe(false);
    expect(decryptJson(payload, key)).toEqual(value);
  });

  it("refuse une mauvaise clé", () => {
    const payload = encrypt(Buffer.from("contenu"), key);
    expect(() => decrypt(payload, randomBytes(32))).toThrow();
  });
});
