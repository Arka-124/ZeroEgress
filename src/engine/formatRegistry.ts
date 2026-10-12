/**
 * Universal Format Registry & Smart Compatibility Matrix
 * Maps source file extensions and MIME types to compatible intra-category and cross-category target formats.
 */

export type FormatCategory =
  | 'Archive'
  | 'Audio'
  | 'Video'
  | 'Document'
  | 'Image'
  | 'Spreadsheet'
  | 'Vector'
  | 'Font'
  | 'Ebook';

export const ALL_CATEGORIES: FormatCategory[] = [
  'Archive',
  'Audio',
  'Video',
  'Document',
  'Image',
  'Spreadsheet',
  'Vector',
  'Font',
  'Ebook',
];

export const FORMAT_CATALOG: Record<FormatCategory, string[]> = {
  Archive: ['ZIP', 'TAR', 'TAR.GZ', '7Z', 'RAR'],
  Audio: ['MP3', 'WAV', 'AAC', 'FLAC', 'OGG', 'M4A', 'AIFF', 'OPUS', 'WMA', 'AC3', 'AMR', 'AU', 'VOC', 'WEBA'],
  Video: ['MP4', 'WEBM', 'MKV', 'AVI', 'MOV', 'FLV', 'WMV', '3GP', '3G2', 'M4V', 'MPEG', 'MPG', 'MTS', 'OGV', 'TS'],
  Document: ['PDF', 'DOCX', 'DOC', 'HTML', 'MD', 'TXT', 'RTF', 'ODT', 'TEX'],
  Image: ['PNG', 'JPG', 'JPEG', 'WEBP', 'AVIF', 'GIF', 'BMP', 'ICO', 'TIFF', 'HEIC'],
  Spreadsheet: ['XLSX', 'XLS', 'CSV', 'ODS', 'JSON', 'TSV'],
  Vector: ['SVG', 'DXF', 'PDF', 'EPS'],
  Font: ['TTF', 'OTF', 'WOFF', 'WOFF2', 'EOT'],
  Ebook: ['EPUB', 'MOBI', 'AZW3', 'CBZ', 'PDF', 'TXT'],
};

// Extension to FormatCategory lookup map
const EXT_TO_CATEGORY: Record<string, FormatCategory> = {
  // Archive
  zip: 'Archive',
  tar: 'Archive',
  gz: 'Archive',
  tgz: 'Archive',
  'tar.gz': 'Archive',
  '7z': 'Archive',
  rar: 'Archive',
  bz2: 'Archive',

  // Audio
  mp3: 'Audio',
  wav: 'Audio',
  aac: 'Audio',
  flac: 'Audio',
  ogg: 'Audio',
  m4a: 'Audio',
  m4b: 'Audio',
  aif: 'Audio',
  aiff: 'Audio',
  opus: 'Audio',
  wma: 'Audio',
  ac3: 'Audio',
  amr: 'Audio',
  au: 'Audio',
  voc: 'Audio',
  weba: 'Audio',

  // Video
  mp4: 'Video',
  webm: 'Video',
  mkv: 'Video',
  avi: 'Video',
  mov: 'Video',
  flv: 'Video',
  wmv: 'Video',
  '3gp': 'Video',
  '3g2': 'Video',
  m4v: 'Video',
  mpeg: 'Video',
  mpg: 'Video',
  mts: 'Video',
  ogv: 'Video',
  ts: 'Video',

  // Document
  pdf: 'Document',
  docx: 'Document',
  doc: 'Document',
  html: 'Document',
  htm: 'Document',
  md: 'Document',
  markdown: 'Document',
  txt: 'Document',
  rtf: 'Document',
  odt: 'Document',
  tex: 'Document',

  // Image
  png: 'Image',
  jpg: 'Image',
  jpeg: 'Image',
  webp: 'Image',
  avif: 'Image',
  gif: 'Image',
  bmp: 'Image',
  ico: 'Image',
  tiff: 'Image',
  tif: 'Image',
  heic: 'Image',
  cr2: 'Image',
  nef: 'Image',
  arw: 'Image',
  dng: 'Image',

  // Spreadsheet
  xlsx: 'Spreadsheet',
  xls: 'Spreadsheet',
  csv: 'Spreadsheet',
  ods: 'Spreadsheet',
  json: 'Spreadsheet',
  tsv: 'Spreadsheet',

  // Vector / CAD
  svg: 'Vector',
  dxf: 'Vector',
  eps: 'Vector',

  // Font
  ttf: 'Font',
  otf: 'Font',
  woff: 'Font',
  woff2: 'Font',
  eot: 'Font',

  // Ebook
  epub: 'Ebook',
  mobi: 'Ebook',
  azw3: 'Ebook',
  cbz: 'Ebook',
};

export function normalizeExtension(fileNameOrExt: string): string {
  const clean = fileNameOrExt.trim().toLowerCase().replace(/^\.+/, '');
  if (clean.endsWith('.tar.gz')) {
    return 'tar.gz';
  }
  const lastDot = clean.lastIndexOf('.');
  if (lastDot !== -1) {
    return clean.slice(lastDot + 1);
  }
  // If no dot was present, check if it's already a recognized format extension
  if (EXT_TO_CATEGORY[clean]) {
    return clean;
  }
  return '';
}

/**
 * Detect the primary category of an input file
 */
export function detectSourceCategory(fileName: string, mimeType?: string): FormatCategory {
  const ext = normalizeExtension(fileName);
  if (EXT_TO_CATEGORY[ext]) {
    return EXT_TO_CATEGORY[ext];
  }

  // Fallback to MIME detection
  if (mimeType) {
    if (mimeType.startsWith('image/svg')) return 'Vector';
    if (mimeType.startsWith('image/')) return 'Image';
    if (mimeType.startsWith('video/')) return 'Video';
    if (mimeType.startsWith('audio/')) return 'Audio';
    if (mimeType.includes('pdf')) return 'Document';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return 'Spreadsheet';
    if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('compressed')) return 'Archive';
    if (mimeType.startsWith('font/')) return 'Font';
    if (mimeType.includes('epub')) return 'Ebook';
  }

  return 'Document';
}

/**
 * Returns the smart compatibility matrix of available output formats for a source file.
 * Handles both intra-format conversions and inter-format (cross-category) conversions.
 */
export function getCompatibleOutputCategories(
  fileName: string,
  mimeType?: string
): Partial<Record<FormatCategory, string[]>> {
  const sourceCat = detectSourceCategory(fileName, mimeType);
  const ext = normalizeExtension(fileName);

  const result: Partial<Record<FormatCategory, string[]>> = {};

  switch (sourceCat) {
    case 'Video':
      // 1. Video transcoding
      result.Video = ['MP4', 'WEBM', 'MKV', 'AVI', 'MOV', 'FLV', 'WMV'];
      // 2. Audio extraction
      result.Audio = ['MP3', 'WAV', 'AAC', 'FLAC', 'OGG', 'M4A'];
      // 3. Frame snapshots & animated GIF
      result.Image = ['GIF', 'PNG', 'JPG'];
      break;

    case 'Audio':
      // 1. Audio transcoding
      result.Audio = ['MP3', 'WAV', 'AAC', 'FLAC', 'OGG', 'M4A', 'AIFF'];
      // 2. Video container wrapping
      result.Video = ['MP4', 'WEBM'];
      break;

    case 'Image':
      // 1. Image cross-conversion & compression
      result.Image = ['WEBP', 'PNG', 'JPG', 'AVIF', 'GIF', 'BMP', 'ICO'];
      // 2. Vector tracing
      result.Vector = ['SVG'];
      // 3. Single or multi-image document assembly
      result.Document = ['PDF'];
      break;

    case 'Document':
      if (ext === 'pdf') {
        // PDF to images
        result.Image = ['PNG', 'JPG', 'WEBP'];
        // PDF to documents
        result.Document = ['DOCX', 'HTML', 'TXT', 'MD'];
        // PDF to ebook
        result.Ebook = ['EPUB', 'TXT'];
      } else {
        // Word / Markdown / HTML / TXT to PDF or other docs
        result.Document = ['PDF', 'HTML', 'MD', 'TXT', 'DOCX'];
        result.Ebook = ['EPUB', 'TXT'];
      }
      break;

    case 'Spreadsheet':
      // Spreadsheet tabular conversion
      result.Spreadsheet = ['XLSX', 'CSV', 'ODS', 'JSON', 'TSV', 'XLS'];
      // Tabular report document
      result.Document = ['HTML', 'PDF'];
      break;

    case 'Vector':
      if (ext === 'dxf') {
        result.Vector = ['SVG'];
        result.Document = ['PDF'];
      } else {
        // SVG
        result.Vector = ['SVG'];
        result.Image = ['PNG', 'JPG', 'WEBP'];
        result.Document = ['PDF'];
      }
      break;

    case 'Font':
      result.Font = ['TTF', 'OTF', 'WOFF', 'WOFF2'];
      break;

    case 'Ebook':
      result.Document = ['PDF', 'HTML', 'TXT', 'MD'];
      result.Ebook = ['EPUB', 'TXT'];
      break;

    case 'Archive':
      result.Archive = ['ZIP', 'TAR', 'TAR.GZ'];
      break;

    default:
      result.Archive = ['ZIP', 'TAR', 'TAR.GZ'];
      break;
  }

  return result;
}

/**
 * Returns a recommended default target format for a source file.
 */
export function getDefaultTargetFormat(fileName: string, mimeType?: string): string {
  const sourceCat = detectSourceCategory(fileName, mimeType);
  const ext = normalizeExtension(fileName);

  switch (sourceCat) {
    case 'Video':
      return ext === 'mp4' ? 'WEBM' : 'MP4';
    case 'Audio':
      return ext === 'mp3' ? 'WAV' : 'MP3';
    case 'Image':
      return ext === 'webp' ? 'PNG' : 'WEBP';
    case 'Document':
      return ext === 'pdf' ? 'PNG' : 'PDF';
    case 'Spreadsheet':
      return ext === 'csv' ? 'XLSX' : 'CSV';
    case 'Vector':
      return ext === 'svg' ? 'PNG' : 'SVG';
    case 'Font':
      return ext === 'woff2' ? 'TTF' : 'WOFF2';
    case 'Ebook':
      return 'PDF';
    case 'Archive':
      return ext === 'zip' ? 'TAR.GZ' : 'ZIP';
    default:
      return 'ZIP';
  }
}
