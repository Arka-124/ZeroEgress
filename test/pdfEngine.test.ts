import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PDFDocument } from 'pdf-lib';
import { parsePageRange } from '../src/utils/fileUtils.ts';

describe('PDF Engine operations', () => {
  it('creates, inspects, and splits multi-page PDF documents', async () => {
    // 1. Create a 3-page test PDF
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([200, 300]);
    pdfDoc.addPage([200, 300]);
    pdfDoc.addPage([200, 300]);
    pdfDoc.setTitle('FileMaster Test Document');

    const pdfBytes = await pdfDoc.save();
    assert.ok(pdfBytes.length > 0, 'PDF bytes generated');

    // 2. Load and inspect
    const loadedDoc = await PDFDocument.load(pdfBytes);
    assert.strictEqual(loadedDoc.getPageCount(), 3, 'Page count matches');
    assert.strictEqual(loadedDoc.getTitle(), 'FileMaster Test Document');

    // 3. Extract pages 1 and 3
    const selected = parsePageRange('1, 3', loadedDoc.getPageCount());
    assert.deepStrictEqual(selected, [1, 3]);

    const extractedDoc = await PDFDocument.create();
    const copiedPages = await extractedDoc.copyPages(
      loadedDoc,
      selected.map((p) => p - 1)
    );
    copiedPages.forEach((p) => extractedDoc.addPage(p));
    assert.strictEqual(extractedDoc.getPageCount(), 2, 'Extracted count matches 2');

    const extractedBytes = await extractedDoc.save();
    assert.ok(extractedBytes.length > 0, 'Extracted PDF saved successfully');

    // 4. Merge test
    const mergedDoc = await PDFDocument.create();
    const p1 = await mergedDoc.copyPages(loadedDoc, loadedDoc.getPageIndices());
    p1.forEach((p) => mergedDoc.addPage(p));
    const p2 = await mergedDoc.copyPages(extractedDoc, extractedDoc.getPageIndices());
    p2.forEach((p) => mergedDoc.addPage(p));

    assert.strictEqual(mergedDoc.getPageCount(), 5, 'Merged document total pages is 3 + 2 = 5');
    const mergedBytes = await mergedDoc.save();
    assert.ok(mergedBytes.length > 0, 'Merged PDF saved successfully');
  });
});
