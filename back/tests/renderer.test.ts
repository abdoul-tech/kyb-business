import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { renderDocument } from "../src/documents/renderer.js";
import { makePdf, PNG_1X1 } from "./helpers/pdf.js";

const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const isJpeg = (image: Buffer) => image.subarray(0, 3).equals(JPEG_SIGNATURE);

// Image bruitée (comme un scan) : lourde en PNG, légère en JPEG.
function noisyImage(width: number, height: number, format: "png" | "jpeg"): Buffer {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  const data = context.createImageData(width, height);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = 200 + Math.floor(Math.random() * 55);
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  context.putImageData(data, 0, 0);
  return format === "png" ? canvas.toBuffer("image/png") : canvas.toBuffer("image/jpeg", 95);
}

describe("renderDocument", () => {
  it("rend chaque page d'un PDF en JPEG à la résolution demandée", async () => {
    const pages = await renderDocument(makePdf(2), "application/pdf", { dpi: 200 });

    expect(pages.map((p) => p.page_number)).toEqual([1, 2]);
    for (const page of pages) {
      expect(page.image_mime_type).toBe("image/jpeg");
      expect(isJpeg(page.image)).toBe(true);
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

  it("convertit une image PNG en JPEG, sur une seule page et sans texte", async () => {
    const pages = await renderDocument(PNG_1X1, "image/png", { dpi: 200 });
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ page_number: 1, image_mime_type: "image/jpeg", text: "" });
    expect(isJpeg(pages[0]!.image)).toBe(true);
    expect(await renderDocument(PNG_1X1, "image/png", { dpi: 200, pages: [2] })).toEqual([]);
  });

  it("allège fortement un scan PNG", async () => {
    const png = noisyImage(1200, 1600, "png");
    const [page] = await renderDocument(png, "image/png", { dpi: 200 });
    expect(page!.image.length).toBeLessThan(png.length / 3);
  });

  it("garde tel quel un JPEG léger, réduit et recompresse un JPEG trop grand", async () => {
    const small = noisyImage(800, 600, "jpeg");
    const [kept] = await renderDocument(small, "image/jpeg", { dpi: 200 });
    expect(kept!.image).toBe(small);

    const huge = noisyImage(5000, 3000, "jpeg");
    const [reduced] = await renderDocument(huge, "image/jpeg", { dpi: 200 });
    const image = await loadImage(reduced!.image);
    expect(Math.max(image.width, image.height)).toBe(4000);
  });
});
