import JSZip from 'jszip';
import { urlRegistry } from './urlRegistry.ts';

/**
 * Format raw byte size into human readable string (e.g. 1.2 MB)
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 B';
  if (bytes < 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const index = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, index)).toFixed(dm))} ${sizes[index]}`;
}

/**
 * Replace file extension with new extension
 */
export function replaceExtension(filename: string, newExt: string): string {
  const cleanExt = newExt.startsWith('.') ? newExt.slice(1) : newExt;
  const lastDot = filename.lastIndexOf('.');
  const base = lastDot !== -1 ? filename.slice(0, lastDot) : filename;
  return `${base}.${cleanExt}`;
}

/**
 * Trigger download of a Blob in the browser
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = urlRegistry.create(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => urlRegistry.revoke(url), 1000);
}

/**
 * Bundle multiple files into a single ZIP archive and trigger download
 */
export async function downloadZip(
  files: { name: string; blob: Blob }[],
  zipFilename: string = 'zeroegress-archive.zip'
): Promise<void> {
  const zip = new JSZip();
  files.forEach((f) => {
    zip.file(f.name, f.blob);
  });
  const zipContent = await zip.generateAsync({ type: 'blob' });
  downloadBlob(zipContent, zipFilename);
}

/**
 * Parse page range string (e.g. "1-3, 5, 8-10") into a sorted array of unique 1-indexed numbers
 */
export function parsePageRange(rangeStr: string, totalPages: number): number[] {
  if (!rangeStr.trim()) {
    // If empty, return all pages
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const parts = rangeStr.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  const pagesSet = new Set<number>();

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        const lower = Math.max(1, Math.min(start, end));
        const upper = Math.min(totalPages, Math.max(start, end));
        for (let i = lower; i <= upper; i++) {
          pagesSet.add(i);
        }
      }
    } else {
      const p = parseInt(part, 10);
      if (!isNaN(p) && p >= 1 && p <= totalPages) {
        pagesSet.add(p);
      }
    }
  }

  return Array.from(pagesSet).sort((a, b) => a - b);
}
