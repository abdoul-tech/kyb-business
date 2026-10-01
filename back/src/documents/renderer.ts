import { createCanvas, loadImage } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { AllowedMimeType } from "./file-check.js";

export type RenderedPage = {
  page_number: number;
  image: Buffer;
  image_mime_type: "image/jpeg";
  // Texte embarqué du PDF (vide pour un scan ou une image) : envoyé au LLM comme simple indice.
  text: string;
};

export type RenderOptions = {
  dpi: number;
  // Pages à rendre (numérotées à partir de 1). Toutes par défaut.
  pages?: number[];
};

// Plafond en pixels sur le plus grand côté : évite des images énormes (et coûteuses en tokens) sur les grands formats.
const MAX_SIDE_PX = 4000;
const PDF_POINTS_PER_INCH = 72;

// Les images envoyées au LLM sont en JPEG : un scan bruité pèse ~2,4 Mo par page en PNG contre ~0,3 Mo en JPEG,
// pour une lisibilité équivalente et le même coût en tokens (qui dépend des dimensions). Requêtes plus légères,
// moins de dépassements de délai. Le fichier déposé par le client, lui, est stocké tel quel.
const JPEG_QUALITY = 85;
// Une photo JPEG déjà légère et de taille raisonnable est envoyée telle quelle (pas de double compression).
const KEEP_JPEG_UNDER_BYTES = 1.5 * 1024 * 1024;

// Image déposée (JPG, PNG) : réduite si besoin, fond blanc sous la transparence, puis JPEG.
async function prepareImage(content: Buffer, mimeType: "image/jpeg" | "image/png"): Promise<Buffer> {
  const image = await loadImage(content);
  const scale = Math.min(1, MAX_SIDE_PX / Math.max(image.width, image.height));
  if (mimeType === "image/jpeg" && scale === 1 && content.length <= KEEP_JPEG_UNDER_BYTES) {
    return content;
  }
  const canvas = createCanvas(Math.round(image.width * scale), Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.encode("jpeg", JPEG_QUALITY);
}

// Transforme un document (PDF, JPG, PNG) en une image JPEG par page + texte embarqué.
export async function renderDocument(
  content: Buffer,
  mimeType: AllowedMimeType,
  options: RenderOptions,
): Promise<RenderedPage[]> {
  if (mimeType !== "application/pdf") {
    const wanted = !options.pages || options.pages.includes(1);
    return wanted
      ? [{ page_number: 1, image: await prepareImage(content, mimeType), image_mime_type: "image/jpeg", text: "" }]
      : [];
  }

  const task = getDocument({ data: new Uint8Array(content), disableFontFace: true, verbosity: 0 });

  try {
    const pdf = await task.promise;
    const pageNumbers = (options.pages ?? Array.from({ length: pdf.numPages }, (_, i) => i + 1)).filter(
      (n) => n >= 1 && n <= pdf.numPages,
    );

    const rendered: RenderedPage[] = [];
    for (const pageNumber of pageNumbers) {
      const page = await pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(
        options.dpi / PDF_POINTS_PER_INCH,
        MAX_SIDE_PX / Math.max(base.width, base.height),
      );
      const viewport = page.getViewport({ scale });

      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise;

      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : "") : ""))
        .join("")
        .trim();

      rendered.push({
        page_number: pageNumber,
        image: await canvas.encode("jpeg", JPEG_QUALITY),
        image_mime_type: "image/jpeg",
        text,
      });
      page.cleanup();
    }
    return rendered;
  } finally {
    await task.destroy();
  }
}
