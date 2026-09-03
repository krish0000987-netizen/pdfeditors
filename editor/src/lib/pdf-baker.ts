import { PDFDocument, rgb, StandardFonts, degrees } from "pdf-lib";

export interface TextElement {
  id: string;
  page: number; // 0-indexed
  x: number; // in points
  y: number; // in points from bottom-left (or converted from top-left)
  width?: number;
  height?: number;
  text: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  underline?: boolean;
  color?: string; // hex #rrggbb
  backgroundColor?: string; // hex or transparent
  textAlign?: "left" | "center" | "right";
  opacity?: number;
}

export interface ImageElement {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  dataUrl: string; // base64 data url
  mimeType?: string;
  opacity?: number;
  rotation?: number; // degrees
}

export interface WhiteoutElement {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string; // default #ffffff
}

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  const num = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  if (isNaN(num)) return rgb(0, 0, 0);
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  return rgb(r, g, b);
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] || dataUrl;
  const bin = atob(base64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

/**
 * Bakes all client-side overlays (text boxes, whiteouts, images, stamps)
 * directly into the PDF binary stream and returns the new PDF bytes.
 */
export async function bakePdfOverlays(
  originalPdfBytes: Uint8Array,
  options: {
    textElements?: TextElement[];
    imageElements?: ImageElement[];
    whiteoutElements?: WhiteoutElement[];
  }
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  const pages = pdfDoc.getPages();

  // Load standard fonts
  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontHelveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const fontHelveticaBoldOblique = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);

  const fontTimes = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const fontTimesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const fontTimesItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  const fontTimesBoldItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);

  const fontCourier = await pdfDoc.embedFont(StandardFonts.Courier);
  const fontCourierBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const resolveFont = (family?: string, isBold?: boolean, isItalic?: boolean) => {
    const fam = (family || "").toLowerCase();
    if (fam.includes("times") || fam.includes("serif") || fam.includes("georgia")) {
      if (isBold && isItalic) return fontTimesBoldItalic;
      if (isBold) return fontTimesBold;
      if (isItalic) return fontTimesItalic;
      return fontTimes;
    }
    if (fam.includes("courier") || fam.includes("mono") || fam.includes("code")) {
      if (isBold) return fontCourierBold;
      return fontCourier;
    }
    // Default Helvetica / Sans-serif / Arial / Roboto / Inter
    if (isBold && isItalic) return fontHelveticaBoldOblique;
    if (isBold) return fontHelveticaBold;
    if (isItalic) return fontHelveticaOblique;
    return fontHelvetica;
  };

  // 1. Apply Whiteouts first (so background is covered cleanly)
  for (const w of options.whiteoutElements ?? []) {
    if (w.page < 0 || w.page >= pages.length) continue;
    const page = pages[w.page];
    const pageHeight = page.getHeight();
    const color = hexToRgb(w.color || "#ffffff");

    // Convert top-left coordinates to PDF bottom-left coordinates
    const pdfY = pageHeight - w.y - w.height;
    page.drawRectangle({
      x: w.x,
      y: pdfY,
      width: w.width,
      height: w.height,
      color,
    });
  }

  // 2. Apply Images / Stamps / Signatures
  for (const img of options.imageElements ?? []) {
    if (img.page < 0 || img.page >= pages.length) continue;
    const page = pages[img.page];
    const pageHeight = page.getHeight();

    try {
      const bytes = dataUrlToBytes(img.dataUrl);
      const isPng = img.dataUrl.includes("image/png") || img.mimeType === "image/png";
      const embeddedImage = isPng
        ? await pdfDoc.embedPng(bytes)
        : await pdfDoc.embedJpg(bytes);

      const pdfY = pageHeight - img.y - img.height;
      page.drawImage(embeddedImage, {
        x: img.x,
        y: pdfY,
        width: img.width,
        height: img.height,
        opacity: typeof img.opacity === "number" ? img.opacity : 1,
        rotate: img.rotation ? degrees(img.rotation) : undefined,
      });
    } catch (err) {
      console.warn("Failed to embed image element:", err);
    }
  }

  // 3. Apply Text Elements
  for (const t of options.textElements ?? []) {
    if (t.page < 0 || t.page >= pages.length || !t.text) continue;
    const page = pages[t.page];
    const pageHeight = page.getHeight();

    const isBold = t.fontWeight === "bold";
    const isItalic = t.fontStyle === "italic";
    const font = resolveFont(t.fontFamily, isBold, isItalic);
    const size = t.fontSize || 12;
    const color = hexToRgb(t.color || "#000000");

    const lines = t.text.split("\n");
    const lineHeight = size * 1.25;
    const boxHeight = t.height || lines.length * lineHeight;
    const boxWidth = t.width || Math.max(...lines.map((l) => font.widthOfTextAtSize(l, size)));

    const pdfY = pageHeight - t.y;

    // Draw background color if set
    if (t.backgroundColor && t.backgroundColor !== "transparent") {
      const bgColor = hexToRgb(t.backgroundColor);
      page.drawRectangle({
        x: t.x - 2,
        y: pdfY - boxHeight - 2,
        width: boxWidth + 4,
        height: boxHeight + 4,
        color: bgColor,
        opacity: t.opacity ?? 1,
      });
    }

    // Draw each line
    lines.forEach((line, idx) => {
      const lineWidth = font.widthOfTextAtSize(line, size);
      let drawX = t.x;
      if (t.textAlign === "center" && t.width) {
        drawX = t.x + (t.width - lineWidth) / 2;
      } else if (t.textAlign === "right" && t.width) {
        drawX = t.x + t.width - lineWidth;
      }

      const lineY = pdfY - (idx + 1) * lineHeight + (lineHeight - size);

      page.drawText(line, {
        x: drawX,
        y: lineY,
        size,
        font,
        color,
        opacity: t.opacity ?? 1,
      });

      // Underline
      if (t.underline) {
        page.drawLine({
          start: { x: drawX, y: lineY - 2 },
          end: { x: drawX + lineWidth, y: lineY - 2 },
          thickness: Math.max(1, size / 12),
          color,
          opacity: t.opacity ?? 1,
        });
      }
    });
  }

  return await pdfDoc.save();
}
