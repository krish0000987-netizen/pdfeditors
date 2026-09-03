import type { ImageElement } from "./document-model";
import { pdfNativeToEditorRect } from "./coordinate-system";

import type * as pdfjs from "pdfjs-dist";

export async function extractImagesFromPdfPage(
  pdfPage: pdfjs.PDFPageProxy,
  pageIndex: number
): Promise<ImageElement[]> {
  const images: ImageElement[] = [];
  try {
    const operatorList = await pdfPage.getOperatorList();
    const viewport = pdfPage.getViewport({ scale: 1.0 });
    const pageHeight = viewport.height;

    // Common PDF.js OPS constants
    // OPS.paintImageXObject is typically 85
    // OPS.paintInlineImageXObject is typically 86
    const fnArray = operatorList.fnArray || [];
    const argsArray = operatorList.argsArray || [];

    // Track current transformation matrix stack
    let ctm: number[] = [1, 0, 0, 1, 0, 0];
    const ctmStack: number[][] = [];

    for (let i = 0; i < fnArray.length; i++) {
      const fn = fnArray[i];
      const args = argsArray[i] as unknown[];

      // save (q)
      if (fn === 1 || fn === 2) {
        ctmStack.push([...ctm]);
      }
      // restore (Q)
      else if (fn === 3 || fn === 4) {
        if (ctmStack.length > 0) {
          ctm = ctmStack.pop()!;
        }
      }
      // transform / cm
      else if (fn === 5 || fn === 6 || (args && args.length === 6 && Array.isArray(args))) {
        if (Array.isArray(args) && args.length === 6) {
          const [a1, b1, c1, d1, e1, f1] = ctm;
          const [a2, b2, c2, d2, e2, f2] = args.map((x) => Number(x) || 0);
          ctm = [
            a1 * a2 + c1 * b2,
            b1 * a2 + d1 * b2,
            a1 * c2 + c1 * d2,
            b1 * c2 + d1 * d2,
            a1 * e2 + c1 * f2 + e1,
            b1 * e2 + d1 * f2 + f1,
          ];
        }
      }
      // paintImageXObject / paintInlineImageXObject
      else if (fn === 85 || fn === 86 || (typeof fn === "number" && (fn === 85 || fn === 86))) {
        const imgName = args && args[0] ? String(args[0]) : `img_${i}`;
        const [a, b, c, d, e, f] = ctm;
        const width = Math.hypot(a, b);
        const height = Math.hypot(c, d);

        // Ignore tiny 1x1 or 0x0 clipping masks
        if (width >= 10 && height >= 10) {
          const bbox = pdfNativeToEditorRect(e, f, width, height, pageHeight);
          const imgId = `img-orig-p${pageIndex}-${Math.round(bbox.x)}-${Math.round(bbox.y)}-${Math.random().toString(36).substring(2, 6)}`;

          // Create standard transparent placeholder / visual proxy
          const placeholderDataUrl =
            "data:image/svg+xml;base64," +
            btoa(
              `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(bbox.width)}" height="${Math.round(bbox.height)}" viewBox="0 0 100 100"><rect width="100" height="100" fill="#f1f5f9" stroke="#cbd5e1"/><text x="50" y="55" font-family="sans-serif" font-size="12" fill="#94a3b8" text-anchor="middle">Original Image</text></svg>`
            );

          images.push({
            id: imgId,
            pageIndex,
            dataUrl: placeholderDataUrl,
            originalDataUrl: placeholderDataUrl,
            mimeType: "image/png",
            title: imgName,
            x: bbox.x,
            y: bbox.y,
            width: bbox.width,
            height: bbox.height,
            opacity: 1,
            rotation: 0,
            aspectRatioLocked: true,
            originalBoundingBox: { ...bbox },
            source: "original",
            modified: false,
            deleted: false,
          });
        }
      }
    }
  } catch (error) {
    console.warn(`Image extraction notice for page ${pageIndex}:`, error);
  }

  return images;
}
