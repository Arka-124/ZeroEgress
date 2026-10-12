import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DesktopAdapter, isTauriEnvironment } from '../src/engine/adapters/desktopAdapter.ts';
import { engine } from '../src/engine/index.ts';

describe('Tauri Desktop Adapter & Native Shell Integration', () => {
  it('correctly inspects the execution environment', () => {
    const inTauri = isTauriEnvironment();
    assert.strictEqual(typeof inTauri, 'boolean');
    assert.strictEqual(inTauri, false, 'Default test runner is not running in Tauri window');
  });

  it('exposes a compliant EngineAdapter interface on DesktopAdapter', () => {
    const desktopAdapter = new DesktopAdapter();
    assert.ok(desktopAdapter.name.includes('Tauri Native Desktop Engine'));
    assert.strictEqual(desktopAdapter.isAirGapped, true);
    assert.strictEqual(typeof desktopAdapter.convertImage, 'function');
    assert.strictEqual(typeof desktopAdapter.mergePdfs, 'function');
    assert.strictEqual(typeof desktopAdapter.splitPdf, 'function');
    assert.strictEqual(typeof desktopAdapter.convertData, 'function');
    assert.strictEqual(typeof desktopAdapter.convertMedia, 'function');
    assert.strictEqual(typeof desktopAdapter.computeHash, 'function');
  });

  it('falls back gracefully to browser engine methods when not inside Tauri webview', async () => {
    const desktopAdapter = new DesktopAdapter();
    const encoder = new TextEncoder();
    const testBuf = encoder.encode('test-hash-vector').buffer as ArrayBuffer;

    // In non-Tauri runtime, computeHash should transparently invoke crypto.subtle fallback
    const hash = await desktopAdapter.computeHash(testBuf, 'SHA-256');
    assert.strictEqual(typeof hash, 'string');
    assert.strictEqual(hash.length, 64, 'SHA-256 length is 64 hex characters');

    // Structured data conversion
    const jsonOutput = desktopAdapter.convertData('key: value', 'yaml', 'json', { minify: true });
    assert.strictEqual(jsonOutput, '{"key":"value"}');
  });

  it('verifies active global engine is initialized and air-gapped', () => {
    assert.ok(engine);
    assert.strictEqual(engine.isAirGapped, true);
    assert.strictEqual(typeof engine.name, 'string');
  });

  it('exposes pro methods for vector redaction, OCR, and watch folders', async () => {
    const desktopAdapter = new DesktopAdapter();
    assert.strictEqual(typeof desktopAdapter.redactPdfVector, 'function');
    assert.strictEqual(typeof desktopAdapter.ocrPdf, 'function');
    assert.strictEqual(typeof desktopAdapter.startWatchFolder, 'function');

    // Test watch folder initialization
    const watcher = await desktopAdapter.startWatchFolder({
      id: 'watch_test',
      name: 'Test Watcher',
      inputPath: '/tmp/input',
      outputPath: '/tmp/output',
      targetFormat: 'webp',
      isActive: true,
      filesProcessed: 0,
    });

    assert.ok(watcher.id);
    assert.strictEqual(typeof watcher.stop, 'function');
    watcher.stop();

    const statuses = await desktopAdapter.getWatchFolderStatuses();
    assert.ok(Array.isArray(statuses));
  });

  it('exposes uncapped CloudConvert native suite capabilities on DesktopAdapter', async () => {
    const desktopAdapter = new DesktopAdapter();
    assert.strictEqual(typeof desktopAdapter.executeNativeConversion, 'function');
    assert.strictEqual(typeof desktopAdapter.convertOfficeDocument, 'function');
    assert.strictEqual(typeof desktopAdapter.convertCadBlueprint, 'function');
    assert.strictEqual(typeof desktopAdapter.convertCameraRaw, 'function');
    assert.strictEqual(typeof desktopAdapter.applyPdfaCompliance, 'function');
    assert.strictEqual(typeof desktopAdapter.generateForensicReport, 'function');
    assert.strictEqual(typeof desktopAdapter.captureLiveUrl, 'function');
    assert.strictEqual(typeof desktopAdapter.setupNativeFileDrop, 'function');

    // Outside Tauri window, methods gracefully report requirement or fallback
    const dummyFile = new File(['test dummy content'], 'test.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const officeRes = await desktopAdapter.convertOfficeDocument(dummyFile);
    assert.strictEqual(officeRes.success, false);
    assert.ok(officeRes.error?.includes('native desktop engine'));

    const cadFile = new File(['0\nSECTION\n0\nENDSEC\n0\nEOF'], 'blueprint.dxf', { type: 'application/dxf' });
    const cadRes = await desktopAdapter.convertCadBlueprint(cadFile, 'svg');
    assert.strictEqual(cadRes.success, false);
    assert.ok(cadRes.error?.includes('native desktop engine'));

    const rawFile = new File(['raw_test_data'], 'photo.cr2', { type: 'image/x-canon-cr2' });
    const rawRes = await desktopAdapter.convertCameraRaw(rawFile);
    assert.strictEqual(rawRes.success, false);

    const pdfaFile = new File(['%PDF-1.7 dummy'], 'doc.pdf', { type: 'application/pdf' });
    const pdfaRes = await desktopAdapter.applyPdfaCompliance(pdfaFile);
    assert.strictEqual(pdfaRes.success, false);

    const forensicRes = await desktopAdapter.generateForensicReport(pdfaFile);
    assert.strictEqual(forensicRes.success, false);

    const captureRes = await desktopAdapter.captureLiveUrl('https://localhost:5173');
    assert.strictEqual(captureRes.success, false);
  });
});

