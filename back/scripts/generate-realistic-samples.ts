// Génère le dossier d'évaluation ENTIÈREMENT FICTIF `fixtures/fictif-realiste/` : documents dessinés comme de vrais
// scans ou photos (papier bruité, page de travers, éclairage inégal, tampons, signatures, compression JPEG,
// statuts scannés sans texte embarqué). Société, personnes et numéros sont inventés.
// Usage : npm run fixtures:realistic --workspace=back  (utilise les polices système de Windows ; tirage aléatoire
// à graine fixe pour obtenir des fichiers identiques d'une exécution à l'autre sur une même machine).
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createCanvas, type Canvas, type SKRSContext2D } from "@napi-rs/canvas";

const OUT_DIR = fileURLToPath(new URL("../../fixtures/fictif-realiste/", import.meta.url));

// ---------------------------------------------------------------------------------------------------------------
// Aléatoire reproductible
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = () => number;
const between = (rng: Rng, min: number, max: number) => min + (max - min) * rng();

// ---------------------------------------------------------------------------------------------------------------
// Dessin
type TextStyle = { size: number; font?: string; weight?: string; color?: string; align?: CanvasTextAlign; italic?: boolean };

function setFont(ctx: SKRSContext2D, style: TextStyle) {
  ctx.font = `${style.italic ? "italic " : ""}${style.weight ?? ""} ${style.size}px "${style.font ?? "Times New Roman"}"`;
  ctx.fillStyle = style.color ?? "#1c1c1e";
  ctx.textAlign = style.align ?? "left";
  ctx.textBaseline = "alphabetic";
}

function write(ctx: SKRSContext2D, text: string, x: number, y: number, style: TextStyle) {
  setFont(ctx, style);
  ctx.fillText(text, x, y);
}

// Texte justifié à gauche sur plusieurs lignes ; renvoie l'ordonnée après le paragraphe.
function paragraph(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  style: TextStyle,
  rng?: Rng,
): number {
  setFont(ctx, style);
  let line = "";
  for (const word of text.split(" ")) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, x + (rng ? between(rng, -1, 1) : 0), y);
      y += lineHeight;
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

function paper(width: number, height: number, rng: Rng, tint = "#fbfaf4"): Canvas {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, width, height);
  // Fibres et petites taches du papier.
  for (let i = 0; i < 400; i++) {
    ctx.strokeStyle = `rgba(120, 110, 90, ${between(rng, 0.02, 0.06)})`;
    ctx.lineWidth = between(rng, 0.5, 1.2);
    const x = rng() * width;
    const y = rng() * height;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + between(rng, -12, 12), y + between(rng, -12, 12));
    ctx.stroke();
  }
  return canvas;
}

function emblem(ctx: SKRSContext2D, cx: number, cy: number, r: number, color = "#2d5a3d") {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? r * 0.55 : r * 0.22;
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

// Tampon rond encré : double cercle, texte en couronne, mentions au centre.
function stamp(
  ctx: SKRSContext2D,
  cx: number,
  cy: number,
  r: number,
  ring: string,
  center: string[],
  color: string,
  angleDeg: number,
  alpha = 0.72,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((angleDeg * Math.PI) / 180);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
  ctx.stroke();

  ctx.font = `bold ${Math.round(r * 0.17)}px "Arial"`;
  ctx.textAlign = "center";
  const chars = [...ring];
  const step = (Math.PI * 1.9) / chars.length;
  chars.forEach((char, i) => {
    ctx.save();
    ctx.rotate(-Math.PI * 0.95 + i * step + Math.PI / 2);
    ctx.fillText(char, 0, -r * 0.8);
    ctx.restore();
  });

  ctx.font = `bold ${Math.round(r * 0.16)}px "Arial"`;
  center.forEach((line, i) => ctx.fillText(line, 0, (i - (center.length - 1) / 2) * r * 0.22 + r * 0.06));
  ctx.restore();
}

function signature(ctx: SKRSContext2D, x: number, y: number, width: number, rng: Rng, color = "#1f2c6b") {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = between(rng, 2, 3.2);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  let cx = x;
  for (let i = 0; i < 6; i++) {
    const nx = cx + width / 6;
    ctx.bezierCurveTo(
      cx + between(rng, 0, width / 6),
      y + between(rng, -38, 20),
      nx - between(rng, 0, width / 6),
      y + between(rng, -20, 30),
      nx,
      y + between(rng, -10, 10),
    );
    cx = nx;
  }
  ctx.moveTo(x + width * 0.1, y + 18);
  ctx.quadraticCurveTo(x + width * 0.5, y + between(rng, 26, 40), x + width * 1.05, y + 8);
  ctx.stroke();
  ctx.restore();
}

// Tableau à cases : colonnes de libellés et de valeurs, retour à la ligne dans les cellules.
function table(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  widths: number[],
  rows: string[][],
  style: TextStyle,
  header = false,
): number {
  const padding = 10;
  const lineHeight = style.size * 1.3;
  for (const [rowIndex, row] of rows.entries()) {
    setFont(ctx, style);
    const lines = row.map((cell, i) => {
      const words = cell.split(" ");
      const out: string[] = [];
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (ctx.measureText(candidate).width > widths[i]! - padding * 2 && line) {
          out.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      out.push(line);
      return out;
    });
    const height = Math.max(...lines.map((l) => l.length)) * lineHeight + padding * 1.4;
    let cx = x;
    for (const [i, cellLines] of lines.entries()) {
      const bold = (header && rowIndex === 0) || (!header && i === 0);
      if (bold) {
        ctx.fillStyle = "rgba(0,0,0,0.045)";
        ctx.fillRect(cx, y, widths[i]!, height);
      }
      ctx.strokeStyle = "#3a3a3a";
      ctx.lineWidth = 1.2;
      ctx.strokeRect(cx, y, widths[i]!, height);
      cellLines.forEach((line, li) =>
        write(ctx, line, cx + padding, y + padding + style.size + li * lineHeight - 2, {
          ...style,
          weight: bold ? "bold" : style.weight,
        }),
      );
      cx += widths[i]!;
    }
    y += height;
  }
  return y;
}

type DegradeOptions = {
  rotateDeg: number;
  background: string;
  margin: number;
  blur: number; // 0 = net, 0,3 = flou prononcé
  noise: number;
  lighting: number; // 0 = uniforme
  gray?: boolean;
  glare?: { x: number; y: number; r: number };
};

// Transforme une page propre en scan ou photo : rotation, fond, flou, éclairage, bruit, niveaux de gris.
function degrade(src: Canvas, options: DegradeOptions, rng: Rng): Canvas {
  const width = src.width + options.margin * 2;
  const height = src.height + options.margin * 2;
  const out = createCanvas(width, height);
  const ctx = out.getContext("2d");
  ctx.fillStyle = options.background;
  ctx.fillRect(0, 0, width, height);

  let page: Canvas = src;
  if (options.blur > 0) {
    const scale = 1 - options.blur;
    const small = createCanvas(Math.round(src.width * scale), Math.round(src.height * scale));
    small.getContext("2d").drawImage(src, 0, 0, small.width, small.height);
    page = createCanvas(src.width, src.height);
    page.getContext("2d").drawImage(small, 0, 0, src.width, src.height);
  }

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate((options.rotateDeg * Math.PI) / 180);
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = options.margin > 0 ? 18 : 0;
  ctx.drawImage(page, -src.width / 2, -src.height / 2);
  ctx.restore();

  if (options.lighting > 0) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, `rgba(255,255,255,0)`);
    gradient.addColorStop(1, `rgba(40,30,10,${options.lighting})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
  if (options.glare) {
    const glare = ctx.createRadialGradient(options.glare.x, options.glare.y, 0, options.glare.x, options.glare.y, options.glare.r);
    glare.addColorStop(0, "rgba(255,255,255,0.55)");
    glare.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glare;
    ctx.fillRect(0, 0, width, height);
  }

  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (rng() - 0.5) * 2 * options.noise;
    let r = data[i]! + n;
    let g = data[i + 1]! + n;
    let b = data[i + 2]! + n;
    if (options.gray) {
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = g = b = l;
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  ctx.putImageData(image, 0, 0);
  return out;
}

// PDF dont chaque page est une image JPEG (comme un scanner) : aucun texte embarqué.
function pdfFromJpegs(pages: Array<{ jpeg: Buffer; width: number; height: number }>): Buffer {
  const chunks: Buffer[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: Buffer | string) => {
    const buffer = typeof data === "string" ? Buffer.from(data, "latin1") : data;
    chunks.push(buffer);
    length += buffer.length;
  };
  const object = (id: number, body: Array<Buffer | string>) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    body.forEach(push);
    push("\nendobj\n");
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const pageIds = pages.map((_, i) => 3 + i * 3);
  object(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  object(2, [`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`]);
  pages.forEach((page, i) => {
    const pageId = pageIds[i]!;
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const content = "q 595 0 0 842 0 0 cm /Im0 Do Q";
    object(pageId, [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    ]);
    object(contentId, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
    object(imageId, [
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
      page.jpeg,
      "\nendstream",
    ]);
  });

  const xref = length;
  const count = 3 + pages.length * 3;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) {
    push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(chunks);
}

// Chiffre de contrôle MRZ (pondération 7-3-1, norme ICAO 9303).
function mrzCheck(value: string): string {
  const weights = [7, 3, 1];
  let sum = 0;
  [...value].forEach((char, i) => {
    const v = /\d/.test(char) ? Number(char) : /[A-Z]/.test(char) ? char.charCodeAt(0) - 55 : 0;
    sum += v * weights[i % 3]!;
  });
  return String(sum % 10);
}
const pad = (value: string, size: number) => (value + "<".repeat(size)).slice(0, size);

function photoPlaceholder(ctx: SKRSContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "#c9ccd0";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#8d939a";
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h * 0.38, w * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h * 0.95, w * 0.42, h * 0.32, 0, Math.PI, 0);
  ctx.fill();
}

// ---------------------------------------------------------------------------------------------------------------
// Documents du dossier fictif « DIAMA DISTRIBUTION SARL » (Sénégal)
const A4 = { width: 1240, height: 1754 }; // 150 DPI
const body: TextStyle = { size: 23, font: "Times New Roman" };

function rccm(rng: Rng): Buffer {
  const canvas = paper(A4.width, A4.height, rng);
  const ctx = canvas.getContext("2d");
  const cx = A4.width / 2;

  emblem(ctx, 150, 140, 55);
  write(ctx, "RÉPUBLIQUE DU SÉNÉGAL", cx, 95, { size: 30, weight: "bold", align: "center" });
  write(ctx, "Un Peuple - Un But - Une Foi", cx, 130, { size: 22, italic: true, align: "center" });
  write(ctx, "MINISTÈRE DE LA JUSTICE", cx, 175, { size: 22, align: "center" });
  write(ctx, "TRIBUNAL DE COMMERCE HORS CLASSE DE DAKAR", cx, 205, { size: 22, weight: "bold", align: "center" });
  write(ctx, "GREFFE", cx, 235, { size: 22, align: "center" });

  ctx.strokeStyle = "#222";
  ctx.lineWidth = 3;
  ctx.strokeRect(110, 270, A4.width - 220, 70);
  write(ctx, "EXTRAIT DU REGISTRE DU COMMERCE ET DU CRÉDIT MOBILIER", cx, 315, { size: 27, weight: "bold", align: "center" });

  write(ctx, "Numéro RCCM : SN-DKR-2021-B-14327", 110, 395, { ...body, weight: "bold" });
  write(ctx, "Date d'immatriculation : 03/08/2021", 700, 395, { ...body, weight: "bold" });

  let y = 440;
  write(ctx, "1. IDENTIFICATION DE LA PERSONNE MORALE", 110, y, { ...body, weight: "bold" });
  y = table(ctx, 110, y + 15, [360, 660], [
    ["Dénomination sociale", "DIAMA DISTRIBUTION"],
    ["Sigle", "DIAMADIS"],
    ["Nom commercial / Enseigne", "DIAMA ÉLECTRIQUE"],
    ["Forme juridique", "Société à Responsabilité Limitée (SARL)"],
    ["Capital social", "5.000.000 F CFA"],
    ["Adresse du siège social", "Lot 12, Zone Industrielle de Mbao, Dakar"],
    ["Durée", "99 ans"],
  ], { size: 21 });

  y += 45;
  write(ctx, "2. ACTIVITÉ", 110, y, { ...body, weight: "bold" });
  y = table(ctx, 110, y + 15, [360, 660], [
    ["Activité principale", "Import, export et distribution de matériel électrique"],
    ["Activités secondaires", "Installation électrique et maintenance"],
    ["Date de début d'activité", "01/09/2021"],
  ], { size: 21 });

  y += 45;
  write(ctx, "3. DIRIGEANTS / ORGANES DE GESTION", 110, y, { ...body, weight: "bold" });
  y = table(
    ctx,
    110,
    y + 15,
    [130, 170, 110, 220, 150, 240],
    [
      ["Nom", "Prénoms", "Fonction", "Date et lieu de naissance", "Nationalité", "Domicile"],
      ["KANE", "Mamadou Lamine", "Gérant", "01/01/1978 à Kaolack", "Sénégalaise", "Mbao Village, Dakar"],
    ],
    { size: 19 },
    true,
  );

  y += 45;
  write(ctx, "4. MENTIONS", 110, y, { ...body, weight: "bold" });
  y = paragraph(ctx, "Néant.", 110, y + 38, 1000, 30, body);

  write(ctx, "Pour extrait certifié conforme,", 700, 1440, body);
  write(ctx, "Dakar, le 12/10/2021", 700, 1475, body);
  write(ctx, "Le Greffier en Chef", 760, 1520, { ...body, weight: "bold" });
  signature(ctx, 740, 1590, 230, rng);
  stamp(ctx, 560, 1560, 115, "TRIBUNAL DE COMMERCE HORS CLASSE DE DAKAR •", ["GREFFE"], "#1d3f9b", -14);
  write(ctx, "Réf. greffe : 2021/B/14327 — page 1/1", 110, 1700, { size: 17, color: "#555" });

  // Photo prise au téléphone : page de travers, éclairage inégal, léger flou, JPEG compressé.
  const photo = degrade(canvas, { rotateDeg: 2.6, background: "#5b4a3a", margin: 70, blur: 0.18, noise: 14, lighting: 0.28 }, rng);
  return photo.toBuffer("image/jpeg", 62);
}

function statutsPages(rng: Rng): Canvas[] {
  const margin = 130;
  const width = A4.width - margin * 2;
  const lh = 34;
  const pages: Canvas[] = [];

  let canvas = paper(A4.width, A4.height, rng, "#fdfdfb");
  let ctx = canvas.getContext("2d");
  const cx = A4.width / 2;
  write(ctx, "DIAMA DISTRIBUTION", cx, 170, { size: 34, weight: "bold", align: "center" });
  write(ctx, "Société à Responsabilité Limitée au capital de 5.000.000 F CFA", cx, 215, { ...body, align: "center" });
  write(ctx, "Siège social : Lot 12, Zone Industrielle de Mbao, Dakar (Sénégal)", cx, 250, { ...body, align: "center" });
  write(ctx, "STATUTS", cx, 350, { size: 36, weight: "bold", align: "center" });
  let y = 440;
  write(ctx, "LES SOUSSIGNÉS :", margin, y, { ...body, weight: "bold" });
  y = paragraph(ctx, "1. Monsieur KANE Mamadou Lamine, commerçant, né le 1er janvier 1978 à Kaolack, de nationalité sénégalaise, demeurant à Mbao Village, Dakar ;", margin, y + 45, width, lh, body, rng);
  y = paragraph(ctx, "2. Madame NDIAYE Fatou Binetou, gestionnaire, née le 12 mars 1985 à Thiès, de nationalité sénégalaise, demeurant à Liberté 6, Dakar ;", margin, y + 12, width, lh, body, rng);
  y = paragraph(ctx, "ont établi ainsi qu'il suit les statuts de la société à responsabilité limitée qu'ils ont convenu de constituer entre eux.", margin, y + 12, width, lh, body, rng);
  write(ctx, "ARTICLE 1 - FORME", margin, y + 40, { ...body, weight: "bold" });
  y = paragraph(ctx, "Il est formé entre les propriétaires des parts ci-après créées et de celles qui pourraient l'être ultérieurement une société à responsabilité limitée régie par l'Acte uniforme de l'OHADA relatif au droit des sociétés commerciales et du groupement d'intérêt économique, ainsi que par les présents statuts.", margin, y + 80, width, lh, body, rng);
  write(ctx, "ARTICLE 2 - OBJET", margin, y + 40, { ...body, weight: "bold" });
  y = paragraph(ctx, "La société a pour objet, directement ou indirectement, au Sénégal et à l'étranger : l'importation, l'exportation et la distribution de matériel électrique ; l'installation et la maintenance électrique ; et plus généralement toutes opérations industrielles, commerciales ou financières se rattachant directement ou indirectement à l'objet social.", margin, y + 80, width, lh, body, rng);
  write(ctx, "1", cx, A4.height - 70, { size: 20, align: "center" });
  pages.push(canvas);

  canvas = paper(A4.width, A4.height, rng, "#fdfdfb");
  ctx = canvas.getContext("2d");
  y = 170;
  write(ctx, "ARTICLE 3 - DÉNOMINATION", margin, y, { ...body, weight: "bold" });
  y = paragraph(ctx, "La société a pour dénomination sociale : DIAMA DISTRIBUTION.", margin, y + 40, width, lh, body, rng);
  write(ctx, "ARTICLE 4 - SIÈGE SOCIAL", margin, y + 40, { ...body, weight: "bold" });
  y = paragraph(ctx, "Le siège social est fixé à Dakar, Lot 12, Zone Industrielle de Mbao. Il pourra être transféré en tout autre endroit par décision des associés.", margin, y + 80, width, lh, body, rng);
  write(ctx, "ARTICLE 5 - DURÉE", margin, y + 40, { ...body, weight: "bold" });
  y = paragraph(ctx, "La durée de la société est fixée à quatre-vingt-dix-neuf (99) années à compter de son immatriculation au Registre du Commerce et du Crédit Mobilier.", margin, y + 80, width, lh, body, rng);
  write(ctx, "ARTICLE 6 - APPORTS", margin, y + 40, { ...body, weight: "bold" });
  y = paragraph(ctx, "Monsieur KANE Mamadou Lamine apporte la somme de trois millions (3.000.000) de francs CFA en numéraire, ainsi qu'en nature un véhicule utilitaire évalué à un million (1.000.000) de francs CFA, soit un apport total de quatre millions (4.000.000) de francs CFA.", margin, y + 80, width, lh, body, rng);
  y = paragraph(ctx, "Madame NDIAYE Fatou Binetou apporte la somme d'un million (1.000.000) de francs CFA en numéraire.", margin, y + 12, width, lh, body, rng);
  y = paragraph(ctx, "Soit au total quatre millions (4.000.000) de francs CFA en numéraire et un million (1.000.000) de francs CFA en nature.", margin, y + 12, width, lh, body, rng);
  write(ctx, "ARTICLE 7 - CAPITAL SOCIAL", margin, y + 40, { ...body, weight: "bold" });
  y = paragraph(ctx, "Le capital social est fixé à la somme de cinq millions (5.000.000) de francs CFA. Il est divisé en cinq cents (500) parts sociales de dix mille (10.000) francs CFA chacune, entièrement libérées, numérotées de 1 à 500 et attribuées aux associés en proportion de leurs apports, à savoir :", margin, y + 80, width, lh, body, rng);
  y = paragraph(ctx, "- Monsieur KANE Mamadou Lamine : quatre cents (400) parts, numérotées de 1 à 400 ;", margin + 30, y + 12, width - 30, lh, body, rng);
  y = paragraph(ctx, "- Madame NDIAYE Fatou Binetou : cent (100) parts, numérotées de 401 à 500.", margin + 30, y + 4, width - 30, lh, body, rng);
  paragraph(ctx, "Total égal au nombre de parts composant le capital social : cinq cents (500) parts.", margin, y + 12, width, lh, body, rng);
  write(ctx, "2", cx, A4.height - 70, { size: 20, align: "center" });
  pages.push(canvas);

  canvas = paper(A4.width, A4.height, rng, "#fdfdfb");
  ctx = canvas.getContext("2d");
  y = 170;
  write(ctx, "ARTICLE 15 - GÉRANCE", margin, y, { ...body, weight: "bold" });
  y = paragraph(ctx, "La société est gérée par une ou plusieurs personnes physiques, associées ou non, nommées par les associés. Est nommé premier gérant de la société, pour une durée indéterminée : Monsieur KANE Mamadou Lamine, susnommé, qui accepte.", margin, y + 40, width, lh, body, rng);
  write(ctx, "ARTICLE 16 - POUVOIRS DU GÉRANT", margin, y + 40, { ...body, weight: "bold" });
  y = paragraph(ctx, "Dans les rapports avec les tiers, le gérant est investi des pouvoirs les plus étendus pour agir en toute circonstance au nom de la société, sous réserve des pouvoirs que l'Acte uniforme attribue expressément aux associés.", margin, y + 80, width, lh, body, rng);
  y = paragraph(ctx, "Fait à Dakar, le 20 juillet 2021, en quatre (4) originaux.", margin, y + 60, width, lh, body, rng);
  write(ctx, "Monsieur KANE Mamadou Lamine", margin, y + 90, body);
  write(ctx, "Madame NDIAYE Fatou Binetou", 700, y + 90, body);
  write(ctx, "Lu et approuvé", margin, y + 150, { size: 26, font: "Segoe Script", color: "#1f2c6b" });
  write(ctx, "Lu et approuvé", 700, y + 150, { size: 26, font: "Ink Free", color: "#1f2c6b" });
  signature(ctx, margin + 20, y + 230, 240, rng);
  signature(ctx, 720, y + 230, 220, rng);
  stamp(ctx, 900, 1460, 110, "ENREGISTREMENT • DAKAR •", ["ENREGISTRÉ", "le 28/07/2021"], "#8a2323", 9, 0.65);
  write(ctx, "3", cx, A4.height - 70, { size: 20, align: "center" });
  pages.push(canvas);

  // Scan en niveaux de gris, légèrement de travers, sans marge de scanner.
  return pages.map((page, i) =>
    degrade(page, { rotateDeg: [0.8, -0.6, 1.1][i]!, background: "#ffffff", margin: 0, blur: 0.12, noise: 16, lighting: 0.08, gray: true }, rng),
  );
}

function cni(rng: Rng): Buffer {
  const w = 1011;
  const h = 638;
  const drawCard = (verso: boolean) => {
    const card = createCanvas(w, h);
    const ctx = card.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, "#eef3e8");
    gradient.addColorStop(1, "#f6efd8");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(60,120,80,0.12)";
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 20) {
        ctx.lineTo(x, 60 + i * 15 + Math.sin(x / 45 + i) * 8);
      }
      ctx.stroke();
    }
    ["#00853f", "#fdef42", "#e31b23"].forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(i * (w / 3), 0, w / 3, 14);
    });
    if (!verso) {
      write(ctx, "RÉPUBLIQUE DU SÉNÉGAL", w / 2, 55, { size: 30, font: "Arial", weight: "bold", align: "center" });
      write(ctx, "CARTE D'IDENTITÉ CEDEAO / ECOWAS IDENTITY CARD", w / 2, 90, { size: 21, font: "Arial", align: "center", color: "#2d4a33" });
      photoPlaceholder(ctx, 40, 130, 250, 320);
      const label = (text: string, x: number, y: number) => write(ctx, text, x, y, { size: 16, font: "Arial", color: "#4c5a4f" });
      const value = (text: string, x: number, y: number) => write(ctx, text, x, y, { size: 25, font: "Arial", weight: "bold" });
      label("Nom / Surname", 320, 150);
      value("KANE", 320, 180);
      label("Prénoms / Given names", 320, 222);
      value("MAMADOU LAMINE", 320, 252);
      label("Date de naissance / Date of birth", 320, 294);
      value("01/01/1978", 320, 324);
      label("Lieu de naissance / Place of birth", 640, 294);
      value("KAOLACK", 640, 324);
      label("Sexe / Sex", 320, 366);
      value("M", 320, 396);
      label("Nationalité / Nationality", 480, 366);
      value("SÉNÉGALAISE", 480, 396);
      label("Date de délivrance / Date of issue", 320, 438);
      value("15/06/2019", 320, 468);
      label("Date d'expiration / Date of expiry", 640, 438);
      value("14/06/2029", 640, 468);
      label("N° de la carte / Card number", 40, 510);
      value("1751197800123", 40, 545);
      signature(ctx, 640, 560, 200, rng, "#222");
    } else {
      const label = (text: string, x: number, y: number) => write(ctx, text, x, y, { size: 16, font: "Arial", color: "#4c5a4f" });
      const value = (text: string, x: number, y: number) => write(ctx, text, x, y, { size: 24, font: "Arial", weight: "bold" });
      label("Adresse / Address", 40, 70);
      value("MBAO VILLAGE, DAKAR", 40, 100);
      label("Autorité / Authority", 40, 150);
      value("DIRECTION DE L'AUTOMATISATION DES FICHIERS", 40, 180);
      label("Taille / Height", 40, 230);
      value("1,78 m", 40, 260);
      const doc = "175119780";
      const line1 = pad(`I<SEN${doc}${mrzCheck(doc)}0123`, 30);
      const line2body = `780101${mrzCheck("780101")}M290614${mrzCheck("290614")}SEN`;
      const line2 = pad(line2body, 29) + mrzCheck(`${line1.slice(5, 30)}${line2body}`);
      const line3 = pad("KANE<<MAMADOU<LAMINE", 30);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillRect(0, 440, w, 198);
      [line1, line2, line3].forEach((line, i) => write(ctx, line, 40, 490 + i * 52, { size: 38, font: "OCR A Extended" }));
    }
    return card;
  };

  // Photo du recto et du verso posés sur une table.
  const photo = createCanvas(1500, 1700);
  const ctx = photo.getContext("2d");
  const wood = ctx.createLinearGradient(0, 0, 1500, 1700);
  wood.addColorStop(0, "#6b4e33");
  wood.addColorStop(1, "#3f2c1c");
  ctx.fillStyle = wood;
  ctx.fillRect(0, 0, 1500, 1700);
  for (let i = 0; i < 120; i++) {
    ctx.strokeStyle = `rgba(20,10,0,${between(rng, 0.05, 0.15)})`;
    ctx.beginPath();
    ctx.moveTo(0, between(rng, 0, 1700));
    ctx.bezierCurveTo(500, between(rng, 0, 1700), 1000, between(rng, 0, 1700), 1500, between(rng, 0, 1700));
    ctx.stroke();
  }
  const place = (card: Canvas, x: number, y: number, deg: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 25;
    ctx.drawImage(card, -w / 2, -h / 2);
    ctx.restore();
  };
  place(drawCard(false), 750, 470, -4);
  place(drawCard(true), 760, 1230, 3);
  const degraded = degrade(photo, { rotateDeg: 0, background: "#000", margin: 0, blur: 0.15, noise: 12, lighting: 0.22, glare: { x: 900, y: 380, r: 330 } }, rng);
  return degraded.toBuffer("image/jpeg", 64);
}

function passport(rng: Rng): Buffer {
  const w = 1250;
  const h = 880;
  const page = createCanvas(w, h);
  const ctx = page.getContext("2d");
  ctx.fillStyle = "#f3efe2";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(40,110,120,0.13)";
  for (let i = 0; i < 70; i++) {
    ctx.beginPath();
    for (let x = 0; x <= w; x += 15) {
      ctx.lineTo(x, i * 13 + Math.sin(x / 60 + i * 0.7) * 10);
    }
    ctx.stroke();
  }
  write(ctx, "RÉPUBLIQUE DU SÉNÉGAL / REPUBLIC OF SENEGAL", w / 2, 55, { size: 28, font: "Arial", weight: "bold", align: "center", color: "#17414a" });
  write(ctx, "PASSEPORT / PASSPORT", w / 2, 92, { size: 24, font: "Arial", align: "center", color: "#17414a" });
  photoPlaceholder(ctx, 50, 140, 280, 360);
  const label = (text: string, x: number, y: number) => write(ctx, text, x, y, { size: 16, font: "Arial", color: "#3f5a60" });
  const value = (text: string, x: number, y: number) => write(ctx, text, x, y, { size: 26, font: "Arial", weight: "bold" });
  label("Type", 370, 140);
  value("P", 370, 170);
  label("Code du pays / Country code", 470, 140);
  value("SEN", 470, 170);
  label("Passeport N° / Passport No.", 800, 140);
  value("A04567891", 800, 170);
  label("Nom / Surname", 370, 212);
  value("NDIAYE", 370, 242);
  label("Prénoms / Given names", 370, 284);
  value("FATOU BINETOU", 370, 314);
  label("Nationalité / Nationality", 370, 356);
  value("SENEGALAISE", 370, 386);
  label("Date de naissance / Date of birth", 370, 428);
  value("12 MAR 1985", 370, 458);
  label("Sexe / Sex", 760, 428);
  value("F", 760, 458);
  label("Lieu de naissance / Place of birth", 880, 428);
  value("THIES", 880, 458);
  label("Date de délivrance / Date of issue", 370, 500);
  value("04 FEB 2021", 370, 530);
  label("Date d'expiration / Date of expiry", 760, 500);
  value("03 FEB 2031", 760, 530);
  label("Autorité / Authority", 370, 572);
  value("DGPAF", 370, 602);
  signature(ctx, 60, 580, 240, rng, "#222");

  const doc = "A04567891";
  const line1 = pad("P<SENNDIAYE<<FATOU<BINETOU", 44);
  const optional = pad("", 14);
  const line2body = `${doc}${mrzCheck(doc)}SEN850312${mrzCheck("850312")}F310203${mrzCheck("310203")}${optional}${mrzCheck(optional)}`;
  const line2 = line2body + mrzCheck(`${doc}${mrzCheck(doc)}850312${mrzCheck("850312")}310203${mrzCheck("310203")}${optional}${mrzCheck(optional)}`);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillRect(0, 700, w, 180);
  [line1, line2].forEach((line, i) => write(ctx, line, 40, 765 + i * 62, { size: 40, font: "OCR A Extended" }));

  const degraded = degrade(page, { rotateDeg: -2.2, background: "#26211c", margin: 90, blur: 0.12, noise: 11, lighting: 0.18, glare: { x: 950, y: 260, r: 280 } }, rng);
  return degraded.toBuffer("image/jpeg", 66);
}

function ninea(rng: Rng): Buffer {
  const canvas = paper(A4.width, A4.height, rng);
  const ctx = canvas.getContext("2d");
  const cx = A4.width / 2;
  emblem(ctx, 150, 140, 50);
  write(ctx, "RÉPUBLIQUE DU SÉNÉGAL", cx, 95, { size: 28, weight: "bold", align: "center" });
  write(ctx, "MINISTÈRE DES FINANCES ET DU BUDGET", cx, 140, { size: 22, align: "center" });
  write(ctx, "AGENCE NATIONALE DE LA STATISTIQUE ET DE LA DÉMOGRAPHIE", cx, 170, { size: 20, align: "center" });
  write(ctx, "ATTESTATION D'IMMATRICULATION AU NINEA", cx, 290, { size: 30, weight: "bold", align: "center" });
  write(ctx, "(Numéro d'Identification National des Entreprises et des Associations)", cx, 325, { size: 20, italic: true, align: "center" });
  table(ctx, 140, 400, [360, 600], [
    ["NINEA", "008765432 2G3"],
    ["Raison sociale", "DIAMA DISTRIBUTION"],
    ["Forme juridique", "SARL"],
    ["Adresse", "Lot 12, Zone Industrielle de Mbao, Dakar"],
    ["Activité principale", "Commerce de gros de matériel électrique"],
    ["Date d'immatriculation", "05/08/2021"],
  ], { size: 22 });
  write(ctx, "Dakar, le 05/08/2021", 720, 1200, body);
  write(ctx, "Le Directeur Général", 720, 1245, { ...body, weight: "bold" });
  signature(ctx, 730, 1320, 220, rng);
  stamp(ctx, 540, 1300, 110, "ANSD • SERVICE NINEA •", ["DAKAR"], "#1d3f9b", 11);
  const scan = degrade(canvas, { rotateDeg: -0.9, background: "#ffffff", margin: 0, blur: 0.1, noise: 10, lighting: 0.05 }, rng);
  return scan.toBuffer("image/png");
}

// ---------------------------------------------------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
const rng = mulberry32(20260929);

const files: Array<[string, Buffer]> = [
  ["rccm-diama-photo.jpg", rccm(rng)],
  [
    "statuts-diama-scan.pdf",
    pdfFromJpegs(
      statutsPages(rng).map((page) => ({ jpeg: page.toBuffer("image/jpeg", 58), width: page.width, height: page.height })),
    ),
  ],
  ["cni-kane.jpg", cni(rng)],
  ["passeport-ndiaye.jpg", passport(rng)],
  ["ninea-diama.png", ninea(rng)],
];

for (const [name, content] of files) {
  writeFileSync(`${OUT_DIR}${name}`, content);
  console.log(`${name.padEnd(26)} ${(content.length / 1024).toFixed(0).padStart(5)} Ko`);
}
