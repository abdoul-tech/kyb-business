import { loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { renderDocument } from "../src/documents/renderer.js";
import { makePdf, PNG_1X1, PNG_SIGNATURE } from "./helpers/pdf.js";

describe("renderDocument", () => {
  it("rend chaque page d'un PDF en PNG à la résolution demandée", async () => {
    const pages = await renderDocument(makePdf(2), "application/pdf", { dpi: 200 });

    expect(pages.map((p) => p.page_number)).toEqual([1, 2]);
    for (const page of pages) {
      expect(page.image_mime_type).toBe("image/png");
      expect(page.image.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    }

    // A4 = 595 x 842 points ; à 200 DPI : 595 * 200 / 72 ≈ 1653 px de large.
    const image = await loadImage(pages[0]!.image);
    expect(image.width).toBe(Math.ceil((595 * 200) / 72));
    expect(image.height).toBe(Math.ceil((842 * 200) / 72));
  });

  it("extrait le texte embarqué de chaque page", async () => {
    const pdf = makePdf(2, { text: (i) => `RCCM NE-NIM-2019-B-${i + 1}` });
    const pages = await renderDocument(pdf, "application/pdf", { dpi: 72 });

    expect(pages.map((p) => p.text)).toEqual(["RCCM NE-NIM-2019-B-1", "RCCM NE-NIM-2019-B-2"]);
  });

  it("ne rend que les pages demandées et ignore celles hors du document", async () => {
    const pages = await renderDocument(makePdf(5), "application/pdf", { dpi: 72, pages: [1, 3, 9] });
    expect(pages.map((p) => p.page_number)).toEqual([1, 3]);
  });

  it("plafonne la taille des grands formats", async () => {
    const pages = await renderDocument(makePdf(1), "application/pdf", { dpi: 2000 });
    const image = await loadImage(pages[0]!.image);
    expect(Math.max(image.width, image.height)).toBeLessThanOrEqual(4000);
  });

  it("renvoie une image telle quelle, sur une seule page et sans texte", async () => {
    const pages = await renderDocument(PNG_1X1, "image/png", { dpi: 200 });
    expect(pages).toEqual([{ page_number: 1, image: PNG_1X1, image_mime_type: "image/png", text: "" }]);
    expect(await renderDocument(PNG_1X1, "image/png", { dpi: 200, pages: [2] })).toEqual([]);
  });
});
