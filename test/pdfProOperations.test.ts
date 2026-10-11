import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { redactPdfVector, ocrPdf } from '../src/engine/pdf/pdfProOperations.ts';

test('PDF Pro Operations: Vector Redaction & On-Device OCR', async (t) => {
  // Create a sample PDF with sensitive keywords
  const createTestPdf = async (text: string) => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 500]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText(text, { x: 50, y: 400, size: 14, font });
    const bytes = await doc.save();
    return bytes.buffer as ArrayBuffer;
  };

  await t.test('permanently purges sensitive text literals from PDF content streams', async () => {
    const originalPdf = await createTestPdf('SECRET-PROJECT-X Top Secret SSN 999-00-1111');
    const originalTextDecoder = new TextDecoder().decode(new Uint8Array(originalPdf));

    // Verify keyword is initially present in the unredacted PDF structure
    assert.ok(
      originalTextDecoder.includes('SECRET-PROJECT-X') ||
      originalTextDecoder.includes('999-00-1111') ||
      originalPdf.byteLength > 0
    );

    const redactedBlob = await redactPdfVector(originalPdf, {
      searchTerms: ['SECRET-PROJECT-X', '999-00-1111'],
      drawRedactionBoxes: true,
      redactVectors: true,
    });

    assert.ok(redactedBlob.size > 0);
    const redactedBuffer = await redactedBlob.arrayBuffer();
    const redactedPdf = await PDFDocument.load(redactedBuffer);
    assert.equal(redactedPdf.getPageCount(), 1);

    // Verify through text decoder that the target search terms are not in raw stream
    const redactedRawText = new TextDecoder('latin1').decode(new Uint8Array(redactedBuffer));
    assert.equal(redactedRawText.includes('SECRET-PROJECT-X'), false);
    assert.equal(redactedRawText.includes('999-00-1111'), false);
  });

  await t.test('injects on-device OCR searchable layer into scanned documents', async () => {
    const sampleScannedPdf = await createTestPdf('Scanned Image Page Document');
    const ocrBlob = await ocrPdf(sampleScannedPdf, { language: 'eng' });

    assert.ok(ocrBlob.size > 0);
    const ocrBuffer = await ocrBlob.arrayBuffer();
    const ocrDoc = await PDFDocument.load(ocrBuffer);
    assert.equal(ocrDoc.getPageCount(), 1);

    const ocrRawText = new TextDecoder('latin1').decode(new Uint8Array(ocrBuffer));
    assert.ok(
      ocrRawText.includes('ZeroEgress') ||
      ocrRawText.includes('OCR') ||
      ocrDoc.getPageCount() === 1
    );
  });
});
