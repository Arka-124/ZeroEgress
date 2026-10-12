import * as pdfLib from 'pdf-lib';
import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';
import { configure, lock, unlockInPlace } from 'pdf-lib-encrypt';

// Configure pdf-lib-encrypt with the active pdf-lib instance
configure(pdfLib);

export interface PdfRotateOptions {
  angle: 90 | 180 | 270;
  scope?: 'all' | 'even' | 'odd' | number[];
}

export interface PdfWatermarkOptions {
  type: 'text' | 'image';
  // Text options
  text?: string;
  fontSize?: number;
  opacity?: number; // 0.0 to 1.0
  rotation?: number; // degrees
  colorHex?: string;
  position?: 'center' | 'diagonal' | 'header' | 'footer' | 'top-right' | 'bottom-right';
  // Image options
  imageBytes?: ArrayBuffer | Uint8Array;
  imageMimeType?: 'image/png' | 'image/jpeg';
  imageScale?: number; // 0.05 to 1.0
}

export interface PdfSecurityOptions {
  password: string;
  permissions?: {
    printing?: 'highResolution' | 'lowResolution' | 'none';
    copying?: boolean;
    modifying?: boolean;
    formFilling?: boolean;
  };
}

/**
 * Converts a hex color string like #10b981 to pdf-lib rgb(r, g, b)
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) / 255;
    const g = parseInt(clean[1] + clean[1], 16) / 255;
    const b = parseInt(clean[2] + clean[2], 16) / 255;
    return { r, g, b };
  }
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return { r: isNaN(r) ? 0.3 : r, g: isNaN(g) ? 0.3 : g, b: isNaN(b) ? 0.3 : b };
}

/**
 * Rotate pages of a PDF document
 */
export async function rotatePdfPages(
  buffer: ArrayBuffer,
  options: PdfRotateOptions,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  onProgress?.(0.1);
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const total = pages.length;

  const { angle, scope = 'all' } = options;

  for (let idx = 0; idx < total; idx++) {
    const pageNum = idx + 1;
    let shouldRotate = false;

    if (scope === 'all') {
      shouldRotate = true;
    } else if (scope === 'even') {
      shouldRotate = pageNum % 2 === 0;
    } else if (scope === 'odd') {
      shouldRotate = pageNum % 2 === 1;
    } else if (Array.isArray(scope)) {
      shouldRotate = scope.includes(pageNum);
    }

    if (shouldRotate) {
      const page = pages[idx];
      const currentRotation = page.getRotation().angle;
      const newRotation = (currentRotation + angle) % 360;
      page.setRotation(degrees(newRotation));
    }

    onProgress?.(0.1 + ((idx + 1) / total) * 0.8);
  }

  const saved = await pdfDoc.save();
  onProgress?.(1.0);
  return new Blob([saved as any], { type: 'application/pdf' });
}

/**
 * Watermark PDF pages with customizable text or image stamp
 */
export async function watermarkPdf(
  buffer: ArrayBuffer,
  options: PdfWatermarkOptions,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  onProgress?.(0.1);
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const total = pages.length;

  if (options.type === 'text') {
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const text = options.text?.trim() || 'CONFIDENTIAL';
    const fontSize = options.fontSize || 38;
    const opacity = options.opacity ?? 0.25;
    const rotDegrees = options.rotation ?? 45;
    const color = hexToRgb(options.colorHex || '#64748b');
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const textHeight = font.heightAtSize(fontSize);

    for (let i = 0; i < total; i++) {
      const page = pages[i];
      const { width, height } = page.getSize();
      let x = (width - textWidth) / 2;
      let y = (height - textHeight) / 2;

      if (options.position === 'header') {
        x = (width - textWidth) / 2;
        y = height - fontSize - 36;
      } else if (options.position === 'footer') {
        x = (width - textWidth) / 2;
        y = 36;
      } else if (options.position === 'top-right') {
        x = width - textWidth - 36;
        y = height - fontSize - 36;
      } else if (options.position === 'bottom-right') {
        x = width - textWidth - 36;
        y = 36;
      }

      page.drawText(text, {
        x: Math.max(10, x),
        y: Math.max(10, y),
        size: fontSize,
        font,
        color: rgb(color.r, color.g, color.b),
        opacity,
        rotate: degrees(rotDegrees),
      });

      onProgress?.(0.1 + ((i + 1) / total) * 0.8);
    }
  } else if (options.type === 'image' && options.imageBytes) {
    let embeddedImage: any;
    if (options.imageMimeType === 'image/jpeg') {
      embeddedImage = await pdfDoc.embedJpg(options.imageBytes);
    } else {
      embeddedImage = await pdfDoc.embedPng(options.imageBytes);
    }

    const imgDims = embeddedImage.scale(options.imageScale || 0.35);
    const opacity = options.opacity ?? 0.35;

    for (let i = 0; i < total; i++) {
      const page = pages[i];
      const { width, height } = page.getSize();
      let x = (width - imgDims.width) / 2;
      let y = (height - imgDims.height) / 2;

      if (options.position === 'top-right') {
        x = width - imgDims.width - 24;
        y = height - imgDims.height - 24;
      } else if (options.position === 'bottom-right') {
        x = width - imgDims.width - 24;
        y = 24;
      }

      page.drawImage(embeddedImage, {
        x: Math.max(0, x),
        y: Math.max(0, y),
        width: imgDims.width,
        height: imgDims.height,
        opacity,
      });

      onProgress?.(0.1 + ((i + 1) / total) * 0.8);
    }
  }

  const saved = await pdfDoc.save();
  onProgress?.(1.0);
  return new Blob([saved as any], { type: 'application/pdf' });
}

/**
 * Protect a PDF document with password and permission flags (AES-256)
 */
export async function encryptPdf(
  buffer: ArrayBuffer,
  options: PdfSecurityOptions,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  onProgress?.(0.2);
  const { password, permissions } = options;

  if (!password || password.length === 0) {
    throw new Error('Please enter a password to protect the document.');
  }

  // Calculate PDF Permissions bitmask P (signed 32-bit integer, default -4)
  // Bits: 3=print, 4=modify, 5=copy, 6=annotations, 9=fill forms, 12=high quality print
  let p = -4; // Default full permissions

  if (permissions) {
    let pVal = -4;
    if (permissions.printing === 'none') {
      pVal &= ~4; // clear bit 3
      pVal &= ~2048; // clear bit 12
    } else if (permissions.printing === 'lowResolution') {
      pVal |= 4; // allow bit 3
      pVal &= ~2048; // disable high res print bit 12
    }
    if (permissions.copying === false) {
      pVal &= ~16; // clear bit 5
    }
    if (permissions.modifying === false) {
      pVal &= ~8; // clear bit 4
    }
    if (permissions.formFilling === false) {
      pVal &= ~256; // clear bit 9
    }
    p = pVal;
  }

  onProgress?.(0.5);
  const plainBytes = new Uint8Array(buffer);
  const lockedBytes = await lock(plainBytes, password, {
    permissions: p,
    algo: 'aes256',
  });

  onProgress?.(1.0);
  return new Blob([lockedBytes as any], { type: 'application/pdf' });
}

/**
 * Unlock and remove password encryption from a protected PDF
 */
export async function decryptPdf(
  buffer: ArrayBuffer,
  password?: string,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  onProgress?.(0.2);
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  onProgress?.(0.5);

  const unlocked = await unlockInPlace(pdfDoc, password || '');
  if (!unlocked) {
    // Document wasn't encrypted or was already decrypted
    const saved = await pdfDoc.save();
    onProgress?.(1.0);
    return new Blob([saved as any], { type: 'application/pdf' });
  }

  const decryptedBytes = await pdfDoc.save();
  onProgress?.(1.0);
  return new Blob([decryptedBytes as any], { type: 'application/pdf' });
}
