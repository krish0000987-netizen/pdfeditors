import {
  PDFDocument,
  rgb,
  StandardFonts,
  degrees,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { DocumentModel } from "./document-model";

function parseHexColor(hex?: string) {
  if (!hex || hex === "transparent") return null;
  const clean = hex.replace("#", "");
  const num = parseInt(
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean,
    16
  );
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

export async function exportPdfDocument(
  originalPdfBytes: Uint8Array,
  model: DocumentModel
): Promise<Uint8Array> {
  const pdfDoc = originalPdfBytes.length > 0
    ? await PDFDocument.load(originalPdfBytes, { ignoreEncryption: true })
    : await PDFDocument.create();

  const pages = pdfDoc.getPages();

  // Load Standard Fonts
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
  const fontCourierOblique = await pdfDoc.embedFont(StandardFonts.CourierOblique);
  const fontCourierBoldOblique = await pdfDoc.embedFont(StandardFonts.CourierBoldOblique);

  const resolveFont = (family?: string, isBold?: boolean, isItalic?: boolean): PDFFont => {
    const fam = (family || "").toLowerCase();
    if (fam.includes("times") || fam.includes("serif") || fam.includes("georgia")) {
      if (isBold && isItalic) return fontTimesBoldItalic;
      if (isBold) return fontTimesBold;
      if (isItalic) return fontTimesItalic;
      return fontTimes;
    }
    if (fam.includes("courier") || fam.includes("mono") || fam.includes("code")) {
      if (isBold && isItalic) return fontCourierBoldOblique;
      if (isBold) return fontCourierBold;
      if (isItalic) return fontCourierOblique;
      return fontCourier;
    }
    // Default Helvetica / Sans-serif
    if (isBold && isItalic) return fontHelveticaBoldOblique;
    if (isBold) return fontHelveticaBold;
    if (isItalic) return fontHelveticaOblique;
    return fontHelvetica;
  };

  for (let pIdx = 0; pIdx < model.pages.length; pIdx++) {
    const pageModel = model.pages[pIdx];
    let pdfPage: PDFPage;

    if (pIdx < pages.length) {
      pdfPage = pages[pIdx];
    } else {
      pdfPage = pdfDoc.addPage([pageModel.width || 595.28, pageModel.height || 841.89]);
    }

    const pageHeight = pdfPage.getHeight();

    // ── STEP 1: COVER MODIFIED / DELETED ORIGINAL TEXT AND IMAGES ──
    // This is the core requirement: eliminate original text/images from showing underneath
    for (const textEl of pageModel.textElements) {
      if (textEl.source === "original" && (textEl.modified || textEl.deleted)) {
        const origBox = textEl.originalBoundingBox || textEl;
        const coverY = pageHeight - origBox.y - origBox.height;
        const coverColor = parseHexColor(textEl.detectedBackgroundColor) || rgb(1, 1, 1);

        pdfPage.drawRectangle({
          x: Math.max(0, origBox.x - 1),
          y: Math.max(0, coverY - 1),
          width: origBox.width + 2,
          height: origBox.height + 2,
          color: coverColor,
          opacity: 1,
        });
      }
    }

    for (const imgEl of pageModel.imageElements) {
      if (imgEl.source === "original" && (imgEl.modified || imgEl.deleted)) {
        const origBox = imgEl.originalBoundingBox || imgEl;
        const coverY = pageHeight - origBox.y - origBox.height;

        pdfPage.drawRectangle({
          x: Math.max(0, origBox.x - 1),
          y: Math.max(0, coverY - 1),
          width: origBox.width + 2,
          height: origBox.height + 2,
          color: rgb(1, 1, 1),
          opacity: 1,
        });
      }
    }

    // ── STEP 2: DRAW REDACTIONS ──
    for (const redEl of pageModel.redactionElements || []) {
      if (redEl.deleted) continue;
      const redY = pageHeight - redEl.y - redEl.height;
      const fillColor = parseHexColor(redEl.fillColor) || rgb(0, 0, 0);

      pdfPage.drawRectangle({
        x: redEl.x,
        y: redY,
        width: redEl.width,
        height: redEl.height,
        color: fillColor,
      });

      if (redEl.overlayText) {
        const textFont = fontHelveticaBold;
        const fontSize = Math.min(10, Math.max(6, redEl.height * 0.4));
        const textWidth = textFont.widthOfTextAtSize(redEl.overlayText, fontSize);
        const textColor = parseHexColor(redEl.overlayTextColor) || rgb(1, 1, 1);

        pdfPage.drawText(redEl.overlayText, {
          x: redEl.x + Math.max(0, (redEl.width - textWidth) / 2),
          y: redY + (redEl.height - fontSize) / 2,
          size: fontSize,
          font: textFont,
          color: textColor,
        });
      }
    }

    // ── STEP 3: DRAW SHAPES ──
    for (const shape of pageModel.shapeElements || []) {
      if (shape.deleted) continue;
      const shapeY = pageHeight - shape.y - shape.height;
      const fillColor = parseHexColor(shape.fillColor);
      const strokeColor = parseHexColor(shape.strokeColor) || rgb(0, 0, 0);
      const strokeWidth = shape.strokeWidth || 1;
      const opacity = typeof shape.opacity === "number" ? shape.opacity : 1;

      if (shape.type === "rectangle" || shape.type === "highlight") {
        pdfPage.drawRectangle({
          x: shape.x,
          y: shapeY,
          width: shape.width,
          height: shape.height,
          color: fillColor || (shape.type === "highlight" ? rgb(1, 0.95, 0.2) : undefined),
          borderColor: shape.type !== "highlight" && shape.strokeWidth > 0 ? strokeColor : undefined,
          borderWidth: shape.type !== "highlight" ? strokeWidth : 0,
          opacity: shape.type === "highlight" ? (opacity < 1 ? opacity : 0.35) : opacity,
          rotate: shape.rotation ? degrees(shape.rotation) : undefined,
        });
      } else if (shape.type === "circle") {
        pdfPage.drawEllipse({
          x: shape.x + shape.width / 2,
          y: shapeY + shape.height / 2,
          xScale: shape.width / 2,
          yScale: shape.height / 2,
          color: fillColor || undefined,
          borderColor: shape.strokeWidth > 0 ? strokeColor : undefined,
          borderWidth: strokeWidth,
          opacity,
        });
      } else if (shape.type === "line" || shape.type === "arrow") {
        pdfPage.drawLine({
          start: { x: shape.x, y: shapeY + shape.height },
          end: { x: shape.x + shape.width, y: shapeY },
          thickness: strokeWidth,
          color: strokeColor,
          opacity,
        });
      }
    }

    // ── STEP 4: DRAW IMAGES ──
    for (const imgEl of pageModel.imageElements || []) {
      if (imgEl.deleted) continue;
      // If it's an untouched original image, it's already in the PDF base layer
      if (imgEl.source === "original" && !imgEl.modified) continue;

      try {
        if (!imgEl.dataUrl || imgEl.dataUrl.startsWith("data:image/svg+xml")) continue;

        const bytes = dataUrlToBytes(imgEl.dataUrl);
        const isPng = imgEl.dataUrl.includes("image/png") || imgEl.mimeType === "image/png";
        const embeddedImg = isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);

        const imgY = pageHeight - imgEl.y - imgEl.height;

        pdfPage.drawImage(embeddedImg, {
          x: imgEl.x,
          y: imgY,
          width: imgEl.width,
          height: imgEl.height,
          opacity: typeof imgEl.opacity === "number" ? imgEl.opacity : 1,
          rotate: imgEl.rotation ? degrees(imgEl.rotation) : undefined,
        });
      } catch (err) {
        console.warn("Could not embed image on page:", err);
      }
    }

    // ── STEP 5: DRAW TEXT ELEMENTS ──
    for (const textEl of pageModel.textElements || []) {
      if (textEl.deleted || !textEl.text) continue;
      // If it's an untouched original text element, it's already in the PDF base layer
      if (textEl.source === "original" && !textEl.modified) continue;

      const isBold = textEl.fontWeight === "bold" || (typeof textEl.fontWeight === "number" && textEl.fontWeight >= 600);
      const isItalic = textEl.fontStyle === "italic";
      const font = resolveFont(textEl.fontFamily, isBold, isItalic);
      const fontSize = Math.max(4, textEl.fontSize || 12);
      const color = parseHexColor(textEl.color) || rgb(0, 0, 0);
      const opacity = typeof textEl.opacity === "number" ? textEl.opacity : 1;
      const lineHeight = fontSize * (textEl.lineHeight || 1.25);

      const lines = textEl.text.split("\n");
      const boxHeight = textEl.height || lines.length * lineHeight;
      const boxWidth = textEl.width || Math.max(...lines.map((l) => font.widthOfTextAtSize(l, fontSize)));
      const pdfTopY = pageHeight - textEl.y;

      // Draw background if set
      if (textEl.backgroundColor && textEl.backgroundColor !== "transparent") {
        const bgCol = parseHexColor(textEl.backgroundColor);
        if (bgCol) {
          pdfPage.drawRectangle({
            x: textEl.x - 2,
            y: pdfTopY - boxHeight - 2,
            width: boxWidth + 4,
            height: boxHeight + 4,
            color: bgCol,
            opacity,
          });
        }
      }

      // Draw each text line
      lines.forEach((line, idx) => {
        if (!line) return;
        const lineWidth = font.widthOfTextAtSize(line, fontSize);
        let drawX = textEl.x;

        if (textEl.textAlign === "center" && textEl.width) {
          drawX = textEl.x + Math.max(0, (textEl.width - lineWidth) / 2);
        } else if (textEl.textAlign === "right" && textEl.width) {
          drawX = textEl.x + Math.max(0, textEl.width - lineWidth);
        }

        const lineY = pdfTopY - (idx + 1) * lineHeight + (lineHeight - fontSize);

        pdfPage.drawText(line, {
          x: drawX,
          y: lineY,
          size: fontSize,
          font,
          color,
          opacity,
          rotate: textEl.rotation ? degrees(textEl.rotation) : undefined,
        });

        // Draw Underline
        if (textEl.underline) {
          pdfPage.drawLine({
            start: { x: drawX, y: lineY - 2 },
            end: { x: drawX + lineWidth, y: lineY - 2 },
            thickness: Math.max(0.75, fontSize / 14),
            color,
            opacity,
          });
        }

        // Draw Strikethrough
        if (textEl.strike) {
          pdfPage.drawLine({
            start: { x: drawX, y: lineY + fontSize * 0.35 },
            end: { x: drawX + lineWidth, y: lineY + fontSize * 0.35 },
            thickness: Math.max(0.75, fontSize / 14),
            color,
            opacity,
          });
        }
      });
    }
  }

  return await pdfDoc.save();
}
