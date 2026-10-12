import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  normalizeExtension,
  detectSourceCategory,
  getCompatibleOutputCategories,
  getDefaultTargetFormat,
  ALL_CATEGORIES,
  FORMAT_CATALOG,
} from '../src/engine/formatRegistry.ts';

describe('Universal Format Registry & Smart Compatibility Matrix', () => {
  it('correctly normalizes file extensions across cases and multi-part extensions', () => {
    assert.strictEqual(normalizeExtension('photo.PNG'), 'png');
    assert.strictEqual(normalizeExtension('.hidden.tar.gz'), 'tar.gz');
    assert.strictEqual(normalizeExtension('document.PDF'), 'pdf');
    assert.strictEqual(normalizeExtension('audio.sample.FLAC'), 'flac');
    assert.strictEqual(normalizeExtension('no_ext'), '');
    assert.strictEqual(normalizeExtension('.'), '');
  });

  it('detects source category accurately from filenames and MIME types', () => {
    // Video
    assert.strictEqual(detectSourceCategory('clip.mp4'), 'Video');
    assert.strictEqual(detectSourceCategory('clip.mkv'), 'Video');
    assert.strictEqual(detectSourceCategory('movie.avi'), 'Video');
    assert.strictEqual(detectSourceCategory('unknown_file', 'video/webm'), 'Video');

    // Audio
    assert.strictEqual(detectSourceCategory('track.mp3'), 'Audio');
    assert.strictEqual(detectSourceCategory('voice.wav'), 'Audio');
    assert.strictEqual(detectSourceCategory('sound.flac'), 'Audio');
    assert.strictEqual(detectSourceCategory('unknown_file', 'audio/aac'), 'Audio');

    // Image
    assert.strictEqual(detectSourceCategory('image.png'), 'Image');
    assert.strictEqual(detectSourceCategory('photo.jpeg'), 'Image');
    assert.strictEqual(detectSourceCategory('picture.webp'), 'Image');
    assert.strictEqual(detectSourceCategory('unknown_file', 'image/avif'), 'Image');

    // Document
    assert.strictEqual(detectSourceCategory('paper.pdf'), 'Document');
    assert.strictEqual(detectSourceCategory('document.docx'), 'Document');
    assert.strictEqual(detectSourceCategory('readme.md'), 'Document');
    assert.strictEqual(detectSourceCategory('notes.txt'), 'Document');

    // Spreadsheet
    assert.strictEqual(detectSourceCategory('sheet.xlsx'), 'Spreadsheet');
    assert.strictEqual(detectSourceCategory('data.csv'), 'Spreadsheet');
    assert.strictEqual(detectSourceCategory('records.ods'), 'Spreadsheet');

    // Vector
    assert.strictEqual(detectSourceCategory('logo.svg'), 'Vector');
    assert.strictEqual(detectSourceCategory('cad.dxf'), 'Vector');

    // Font
    assert.strictEqual(detectSourceCategory('font.ttf'), 'Font');
    assert.strictEqual(detectSourceCategory('font.woff2'), 'Font');

    // Ebook
    assert.strictEqual(detectSourceCategory('book.epub'), 'Ebook');

    // Archive
    assert.strictEqual(detectSourceCategory('bundle.zip'), 'Archive');
    assert.strictEqual(detectSourceCategory('bundle.tar.gz'), 'Archive');
    assert.strictEqual(detectSourceCategory('bundle.7z'), 'Archive');
  });

  it('generates cross-category compatibility matrix for inter-type conversions', () => {
    // Video should offer Video, Audio (extraction), Image (GIF/frames), Archive
    const videoTargets = getCompatibleOutputCategories('movie.mp4');
    assert.ok(videoTargets.Video && videoTargets.Video.includes('WEBM'));
    assert.ok(videoTargets.Audio && videoTargets.Audio.includes('MP3'));
    assert.ok(videoTargets.Image && videoTargets.Image.includes('GIF'));
    assert.ok(videoTargets.Archive && videoTargets.Archive.includes('ZIP'));

    // Audio should offer Audio and Archive
    const audioTargets = getCompatibleOutputCategories('song.mp3');
    assert.ok(audioTargets.Audio && audioTargets.Audio.includes('WAV'));
    assert.ok(audioTargets.Archive && audioTargets.Archive.includes('ZIP'));

    // Image should offer Image, Vector (potrace trace to SVG), Document (PDF), Archive
    const imgTargets = getCompatibleOutputCategories('photo.png');
    assert.ok(imgTargets.Image && imgTargets.Image.includes('WEBP'));
    assert.ok(imgTargets.Vector && imgTargets.Vector.includes('SVG'));
    assert.ok(imgTargets.Document && imgTargets.Document.includes('PDF'));
    assert.ok(imgTargets.Archive && imgTargets.Archive.includes('ZIP'));

    // PDF Document should offer Image (page rasterization), Document (TXT, HTML), Archive
    const pdfTargets = getCompatibleOutputCategories('book.pdf');
    assert.ok(pdfTargets.Image && pdfTargets.Image.includes('PNG'));
    assert.ok(pdfTargets.Image && pdfTargets.Image.includes('WEBP'));
    assert.ok(pdfTargets.Document && pdfTargets.Document.includes('TXT'));
    assert.ok(pdfTargets.Archive && pdfTargets.Archive.includes('ZIP'));

    // Vector SVG should offer Bitmap Image (render to PNG/JPG/WEBP), Document (PDF), Vector (SVG)
    const svgTargets = getCompatibleOutputCategories('vector.svg');
    assert.ok(svgTargets.Image && svgTargets.Image.includes('PNG'));
    assert.ok(svgTargets.Document && svgTargets.Document.includes('PDF'));
    assert.ok(svgTargets.Vector && svgTargets.Vector.includes('SVG'));

    // Spreadsheet should offer Spreadsheet formats, Document (HTML), Archive
    const sheetTargets = getCompatibleOutputCategories('table.xlsx');
    assert.ok(sheetTargets.Spreadsheet && sheetTargets.Spreadsheet.includes('CSV'));
    assert.ok(sheetTargets.Spreadsheet && sheetTargets.Spreadsheet.includes('JSON'));
    assert.ok(sheetTargets.Document && sheetTargets.Document.includes('HTML'));
  });

  it('returns intelligent default target format for any uploaded file', () => {
    assert.strictEqual(getDefaultTargetFormat('video.mp4'), 'WEBM');
    assert.strictEqual(getDefaultTargetFormat('video.mkv'), 'MP4');
    assert.strictEqual(getDefaultTargetFormat('audio.mp3'), 'WAV');
    assert.strictEqual(getDefaultTargetFormat('audio.wav'), 'MP3');
    assert.strictEqual(getDefaultTargetFormat('photo.png'), 'WEBP');
    assert.strictEqual(getDefaultTargetFormat('photo.webp'), 'PNG');
    assert.strictEqual(getDefaultTargetFormat('doc.pdf'), 'PNG');
    assert.strictEqual(getDefaultTargetFormat('doc.docx'), 'PDF');
    assert.strictEqual(getDefaultTargetFormat('table.csv'), 'XLSX');
    assert.strictEqual(getDefaultTargetFormat('table.xlsx'), 'CSV');
    assert.strictEqual(getDefaultTargetFormat('logo.svg'), 'PNG');
    assert.strictEqual(getDefaultTargetFormat('font.woff2'), 'TTF');
    assert.strictEqual(getDefaultTargetFormat('novel.epub'), 'PDF');
    assert.strictEqual(getDefaultTargetFormat('backup.zip'), 'TAR.GZ');
  });

  it('validates ALL_CATEGORIES catalog integrity', () => {
    assert.strictEqual(ALL_CATEGORIES.length, 9);
    for (const cat of ALL_CATEGORIES) {
      assert.ok(Array.isArray(FORMAT_CATALOG[cat]), `Missing catalog array for category: ${cat}`);
      assert.ok(FORMAT_CATALOG[cat].length > 0, `Empty catalog array for category: ${cat}`);
    }
  });
});
