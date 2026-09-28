import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checkFile } from "../src/documents/file-check.js";
import { ApiError } from "../src/http/errors.js";
import { makePdf, PNG_1X1 } from "./helpers/pdf.js";

const limits = { maxBytes: 15 * 1024 * 1024, maxPages: 30 };

async function expectApiError(promise: Promise<unknown>, code: string) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe(code);
}

describe("checkFile", () => {
  it("accepte un PDF et compte ses pages", async () => {
    const pdf = makePdf(3);
    const checked = await checkFile(pdf, "statuts.pdf", limits);

    expect(checked.mimeType).toBe("application/pdf");
    expect(checked.pageCount).toBe(3);
    expect(checked.sha256).toBe(createHash("sha256").update(pdf).digest("hex"));
  });

  it("accepte une image PNG comme une page", async () => {
    const checked = await checkFile(PNG_1X1, "cni.png", limits);
    expect(checked).toMatchObject({ mimeType: "image/png", pageCount: 1 });
  });

  it("détecte le type sur les octets, pas sur l'extension", async () => {
    const checked = await checkFile(makePdf(1), "photo.jpg", limits);
    expect(checked.mimeType).toBe("application/pdf");

    await expectApiError(checkFile(Buffer.from("pas un pdf"), "faux.pdf", limits), "UNSUPPORTED_FILE_TYPE");
  });

  it("refuse les types non autorisés même reconnus", async () => {
    const gif = Buffer.from("474946383961010001000000002c00000000010001000002024401003b", "hex");
    await expectApiError(checkFile(gif, "logo.gif", limits), "UNSUPPORTED_FILE_TYPE");
  });

  it("refuse un fichier trop lourd", async () => {
    await expectApiError(checkFile(makePdf(1), "gros.pdf", { ...limits, maxBytes: 10 }), "FILE_TOO_LARGE");
  });

  it("refuse un PDF au-delà du nombre de pages maximum", async () => {
    await expectApiError(checkFile(makePdf(31), "long.pdf", limits), "TOO_MANY_PAGES");
  });

  it("refuse un PDF corrompu", async () => {
    const broken = Buffer.from("%PDF-1.4\nceci n'est pas un vrai pdf");
    await expectApiError(checkFile(broken, "casse.pdf", limits), "VALIDATION_ERROR");
  });
});
