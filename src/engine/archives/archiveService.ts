/**
 * Universal client-side Archive Service using fflate and POSIX UStar tar.
 * 100% offline, zero-telemetry, memory-safe compression and extraction.
 */

import { zip, unzip, gzip, gunzip, type AsyncZippable } from 'fflate';
import { createTarArchive, parseTarArchive } from './tarHelper.ts';

export type ArchiveFormat = 'zip' | 'tar.gz' | 'tar';
export type CompressionLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface ArchiveEntry {
  path: string;
  name: string;
  size: number;
  compressedSize?: number;
  isDir: boolean;
  data: Uint8Array;
  mtime?: number;
}

export interface ArchiveInspectionResult {
  format: 'zip' | 'tar.gz' | 'tar' | 'gz';
  fileName: string;
  fileCount: number;
  dirCount: number;
  totalUncompressedSize: number;
  compressedSize: number;
  compressionRatio: number; // e.g. 0.45 = 45% savings
  entries: ArchiveEntry[];
}

export interface ArchiveCreationResult {
  blob: Blob;
  size: number;
  durationMs: number;
  format: ArchiveFormat;
  fileName: string;
}

/**
 * Creates an archive (.zip, .tar.gz, or .tar) from input files.
 */
export async function createArchive(
  items: { name: string; file: File }[],
  format: ArchiveFormat,
  level: number = 6, // 0..9 (6 is balanced)
  archiveName?: string,
  onProgress?: (percent: number) => void
): Promise<ArchiveCreationResult> {
  const startTime = performance.now();
  onProgress?.(10);

  // Read all files to Uint8Array
  const fileDataPromises = items.map(async (item, idx) => {
    const buf = await item.file.arrayBuffer();
    onProgress?.(10 + Math.round(((idx + 1) / items.length) * 40));
    return {
      name: item.name.replace(/\\/g, '/').replace(/^\/+/, ''),
      data: new Uint8Array(buf),
      mtime: item.file.lastModified || Date.now(),
    };
  });

  const files = await Promise.all(fileDataPromises);
  onProgress?.(60);

  let outputBytes: Uint8Array;
  let defaultExt = '.zip';
  let mimeType = 'application/zip';

  const zipLevel = Math.max(0, Math.min(9, Math.round(level))) as CompressionLevel;

  if (format === 'zip') {
    defaultExt = '.zip';
    mimeType = 'application/zip';
    // Prepare fflate zip object structure
    const zipFiles: AsyncZippable = {};
    for (const f of files) {
      zipFiles[f.name] = [f.data, { level: zipLevel }];
    }

    outputBytes = await new Promise<Uint8Array>((resolve, reject) => {
      zip(zipFiles, (err, data) => {
        if (err) return reject(err);
        resolve(data);
      });
    });
  } else if (format === 'tar.gz') {
    defaultExt = '.tar.gz';
    mimeType = 'application/gzip';
    const tarBytes = createTarArchive(files);
    onProgress?.(80);

    outputBytes = await new Promise<Uint8Array>((resolve, reject) => {
      gzip(tarBytes, { level: zipLevel }, (err, data) => {
        if (err) return reject(err);
        resolve(data);
      });
    });
  } else {
    // Plain uncompressed .tar
    defaultExt = '.tar';
    mimeType = 'application/x-tar';
    outputBytes = createTarArchive(files);
  }

  onProgress?.(100);
  const durationMs = Math.round(performance.now() - startTime);

  let finalFileName = archiveName?.trim() || `archive_${Date.now()}${defaultExt}`;
  if (!finalFileName.toLowerCase().endsWith(defaultExt)) {
    finalFileName += defaultExt;
  }

  const blob = new Blob([outputBytes.buffer as ArrayBuffer], { type: mimeType });

  return {
    blob,
    size: outputBytes.length,
    durationMs,
    format,
    fileName: finalFileName,
  };
}

/**
 * Inspects and extracts archive contents (.zip, .tar, .tar.gz, .tgz, .gz) in browser memory.
 */
export async function inspectArchive(
  file: File,
  onProgress?: (percent: number) => void
): Promise<ArchiveInspectionResult> {
  onProgress?.(15);
  const arrayBuffer = await file.arrayBuffer();
  const rawBytes = new Uint8Array(arrayBuffer);
  onProgress?.(35);

  const lowerName = file.name.toLowerCase();
  let entries: ArchiveEntry[] = [];
  let format: ArchiveInspectionResult['format'] = 'zip';

  if (lowerName.endsWith('.tar.gz') || lowerName.endsWith('.tgz')) {
    format = 'tar.gz';
    // Decompress gzip stream first
    const uncompressed = await new Promise<Uint8Array>((resolve, reject) => {
      gunzip(rawBytes, (err, data) => {
        if (err) return reject(new Error(`Failed to decompress GZIP stream: ${err.message}`));
        resolve(data);
      });
    });
    onProgress?.(70);

    const tarEntries = parseTarArchive(uncompressed);
    entries = tarEntries.map((te) => {
      const parts = te.name.split('/');
      const name = parts[parts.length - 1] || te.name;
      return {
        path: te.name,
        name,
        size: te.size,
        isDir: te.isDir,
        data: te.data,
        mtime: te.mtime,
      };
    });
  } else if (lowerName.endsWith('.tar')) {
    format = 'tar';
    const tarEntries = parseTarArchive(rawBytes);
    entries = tarEntries.map((te) => {
      const parts = te.name.split('/');
      const name = parts[parts.length - 1] || te.name;
      return {
        path: te.name,
        name,
        size: te.size,
        isDir: te.isDir,
        data: te.data,
        mtime: te.mtime,
      };
    });
  } else if (lowerName.endsWith('.gz')) {
    format = 'gz';
    const uncompressed = await new Promise<Uint8Array>((resolve, reject) => {
      gunzip(rawBytes, (err, data) => {
        if (err) return reject(new Error(`Failed to gunzip: ${err.message}`));
        resolve(data);
      });
    });
    const innerName = file.name.replace(/\.gz$/i, '');
    entries = [
      {
        path: innerName,
        name: innerName,
        size: uncompressed.length,
        isDir: false,
        data: uncompressed,
        mtime: file.lastModified,
      },
    ];
  } else {
    // Default to ZIP
    format = 'zip';
    const unzippedObj = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
      unzip(rawBytes, (err, data) => {
        if (err) return reject(new Error(`Failed to unpack ZIP archive: ${err.message}`));
        resolve(data);
      });
    });
    onProgress?.(80);

    entries = Object.entries(unzippedObj).map(([path, data]) => {
      const isDir = path.endsWith('/');
      const cleanPath = path.replace(/\/$/, '');
      const parts = cleanPath.split('/');
      const name = parts[parts.length - 1] || path;

      return {
        path,
        name,
        size: data.length,
        isDir,
        data,
      };
    });
  }

  onProgress?.(100);

  const fileCount = entries.filter((e) => !e.isDir).length;
  const dirCount = entries.filter((e) => e.isDir).length;
  const totalUncompressedSize = entries.reduce((acc, e) => acc + (e.isDir ? 0 : e.size), 0);
  const compressedSize = file.size;
  const savings = totalUncompressedSize > 0
    ? Math.max(0, (totalUncompressedSize - compressedSize) / totalUncompressedSize)
    : 0;

  return {
    format,
    fileName: file.name,
    fileCount,
    dirCount,
    totalUncompressedSize,
    compressedSize,
    compressionRatio: Math.round(savings * 100),
    entries,
  };
}

/**
 * Downloads a single extracted archive file directly to user disk.
 */
export function downloadArchiveEntry(entry: ArchiveEntry): void {
  const blob = new Blob([entry.data.buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = entry.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Packages all extracted entries into a clean zip for 1-click download.
 */
export async function downloadAllEntriesAsZip(
  entries: ArchiveEntry[],
  zipName: string = 'extracted_archive.zip'
): Promise<void> {
  const zipFiles: AsyncZippable = {};
  for (const entry of entries) {
    if (!entry.isDir) {
      zipFiles[entry.path] = [entry.data, { level: 0 }]; // fast store
    }
  }

  const zipBytes = await new Promise<Uint8Array>((resolve, reject) => {
    zip(zipFiles, (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  });

  const blob = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
