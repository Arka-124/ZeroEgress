import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PDFDocument } from 'pdf-lib';
import {
  compressPdf,
  estimateCompressedSize,
} from '../src/engine/pdf/pdfCompressor.ts';

describe('PDF Compressor (pdf-lib & stream optimization)', () => {
  it('calculates expected estimation sizes across compression presets', () => {
    const originalSize = 1000000; // 1 MB

    const maxEst = estimateCompressedSize(originalSize, 'max');
    assert.strictEqual(maxEst.estimatedSavingsPercent, 55);
    assert.ok(maxEst.estimatedSize < originalSize);

    const balEst = estimateCompressedSize(originalSize, 'balanced');
    assert.strictEqual(balEst.estimatedSavingsPercent, 35);
    assert.ok(balEst.estimatedSize < originalSize);

    const qualEst = estimateCompressedSize(originalSize, 'quality');
    assert.strictEqual(qualEst.estimatedSavingsPercent, 18);
    assert.ok(qualEst.estimatedSize < originalSize);
  });

  it('compresses a multi-page PDF document and optimizes structure', async () => {
    // Generate a test PDF with metadata
    const pdfDoc = await PDFDocument.create();
    const p1 = pdfDoc.addPage([595, 842]);
    p1.drawText('Confidential Statement - ZeroEgress Local Processing');
    const p2 = pdfDoc.addPage([595, 842]);
    p2.drawText('Second Page of Audited Financials');
    pdfDoc.setTitle('Uncompressed Invoice');
    pdfDoc.setAuthor('Enterprise User');

    const pdfBytes = await pdfDoc.save();
    const file = new File([pdfBytes], 'invoice.pdf', { type: 'application/pdf' });

    let progressCalls = 0;
    const result = await compressPdf(
      file,
      { preset: 'balanced', stripMetadata: true },
      () => progressCalls++
    );

    assert.ok(result.blob.size > 0, 'Compressed blob created');
    assert.strictEqual(result.outputFileName, 'invoice_compressed.pdf');
    assert.ok(progressCalls > 0, 'Progress callback was triggered');

    // Verify compressed document is valid and can be loaded
    const loadedDoc = await PDFDocument.load(await result.blob.arrayBuffer());
    assert.strictEqual(loadedDoc.getPageCount(), 2, 'Page count preserved');
  });
});
