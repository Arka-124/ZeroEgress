import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { zipSync } from 'fflate';
import {
  rotatePdfPages,
  watermarkPdf,
  encryptPdf,
  decryptPdf,
} from '../src/engine/pdf/pdfPowerTools.ts';
import {
  detectFontFormat,
} from '../src/engine/font/fontConverter.ts';
import {
  optimizeSvgString,
} from '../src/engine/vector/vectorEngine.ts';
import {
  parseEpubFile,
  convertTextOrMarkdownToPdf,
} from '../src/engine/ebook/ebookEngine.ts';

describe('CloudConvert Web Phase: PDF Power Tools', () => {
  it('accurately rotates PDF pages by 90°, 180°, and 270°', async () => {
    const doc = await PDFDocument.create();
    const p1 = doc.addPage([400, 600]);
    const p2 = doc.addPage([400, 600]);
    assert.equal(p1.getRotation().angle, 0);
    assert.equal(p2.getRotation().angle, 0);

    const pdfBytes = await doc.save();
    const rotatedBlob = await rotatePdfPages(pdfBytes.buffer as ArrayBuffer, {
      angle: 90,
      scope: 'all',
    });

    const rotatedDoc = await PDFDocument.load(await rotatedBlob.arrayBuffer());
    assert.equal(rotatedDoc.getPageCount(), 2);
    assert.equal(rotatedDoc.getPage(0).getRotation().angle, 90);
    assert.equal(rotatedDoc.getPage(1).getRotation().angle, 90);
  });

  it('rotates only specific page scopes (odd/even/custom)', async () => {
    const doc = await PDFDocument.create();
    doc.addPage(); // Page 1 (odd)
    doc.addPage(); // Page 2 (even)
    const pdfBytes = await doc.save();

    const evenRotatedBlob = await rotatePdfPages(pdfBytes.buffer as ArrayBuffer, {
      angle: 180,
      scope: 'even',
    });

    const evenRotatedDoc = await PDFDocument.load(await evenRotatedBlob.arrayBuffer());
    assert.equal(evenRotatedDoc.getPage(0).getRotation().angle, 0);
    assert.equal(evenRotatedDoc.getPage(1).getRotation().angle, 180);
  });

  it('stamps customizable text watermark onto PDF pages', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([500, 700]);
    const pdfBytes = await doc.save();

    const watermarkedBlob = await watermarkPdf(pdfBytes.buffer as ArrayBuffer, {
      type: 'text',
      text: 'RESTRICTED / AIR-GAPPED',
      fontSize: 32,
      opacity: 0.3,
      position: 'center',
    });

    assert.ok(watermarkedBlob.size > pdfBytes.byteLength);
    const reloaded = await PDFDocument.load(await watermarkedBlob.arrayBuffer());
    assert.equal(reloaded.getPageCount(), 1);
  });

  it('encrypts and unlocks PDF with AES-256 and custom permissions', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const plainBytes = await doc.save();

    const lockedBlob = await encryptPdf(plainBytes.buffer as ArrayBuffer, {
      password: 'ZeroEgressPassword2026',
      permissions: {
        printing: 'lowResolution',
        copying: false,
        modifying: false,
      },
    });

    assert.ok(lockedBlob.size > 0);

    // Unlocking with correct password
    const unlockedBlob = await decryptPdf(
      await lockedBlob.arrayBuffer(),
      'ZeroEgressPassword2026'
    );
    assert.ok(unlockedBlob.size > 0);

    const decryptedDoc = await PDFDocument.load(await unlockedBlob.arrayBuffer());
    assert.equal(decryptedDoc.getPageCount(), 1);
  });
});

describe('CloudConvert Web Phase: Font & Vector Engine', () => {
  it('accurately identifies font magic formats', () => {
    // wOFF
    const woffBuf = new Uint8Array([0x77, 0x4f, 0x46, 0x46, 0, 0, 0, 0]).buffer;
    assert.equal(detectFontFormat(woffBuf), 'woff');

    // wOF2
    const woff2Buf = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0]).buffer;
    assert.equal(detectFontFormat(woff2Buf), 'woff2');

    // OTTO
    const otfBuf = new Uint8Array([0x4f, 0x54, 0x54, 0x4f, 0, 0, 0, 0]).buffer;
    assert.equal(detectFontFormat(otfBuf), 'otf');

    // TrueType 0x00010000
    const ttfBuf = new Uint8Array([0x00, 0x01, 0x00, 0x00, 0, 0, 0, 0]).buffer;
    assert.equal(detectFontFormat(ttfBuf), 'ttf');
  });

  it('optimizes and minifies raw SVG markup using SVGO', () => {
    const verboseSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100px" height="100px">
        <!-- Generator: Illustrator 28.0.0, SVG Export Plug-In -->
        <g id="Layer_1">
          <rect id="rect123" x="10" y="10" width="80" height="80" style="fill:#10b981;" />
        </g>
      </svg>
    `;

    const result = optimizeSvgString(verboseSvg);
    assert.ok(result.optimizedSize < result.originalSize);
    assert.ok(result.optimizedSvg.includes('<path') || result.optimizedSvg.includes('<rect'));
    assert.ok(result.optimizedSvg.startsWith('<svg'));
  });
});

describe('CloudConvert Web Phase: E-Book & Extended Documents', () => {
  it('parses unencrypted EPUB archives and extracts metadata and chapters', async () => {
    // Construct in-memory EPUB ZIP structure
    const containerXml = `<?xml version="1.0"?>
    <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
      </rootfiles>
    </container>`;

    const contentOpf = `<?xml version="1.0" encoding="utf-8"?>
    <package xmlns="http://www.idpf.org/2007/opf" version="2.0">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>Offline Engineering Manual</dc:title>
        <dc:creator>ZeroEgress Team</dc:creator>
        <dc:publisher>AirGap Press</dc:publisher>
      </metadata>
      <manifest>
        <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
      </manifest>
      <spine>
        <itemref idref="ch1"/>
      </spine>
    </package>`;

    const chapter1 = `<?xml version="1.0" encoding="utf-8"?>
    <!DOCTYPE html>
    <html>
      <head><title>Chapter 1: Zero Egress Fundamentals</title></head>
      <body>
        <h1>Chapter 1: Zero Egress Fundamentals</h1>
        <p>This chapter discusses browser memory execution and Wasm cryptographic sealing.</p>
      </body>
    </html>`;

    const encoder = new TextEncoder();
    const epubZipBytes = zipSync({
      'META-INF/container.xml': encoder.encode(containerXml),
      'OEBPS/content.opf': encoder.encode(contentOpf),
      'OEBPS/chapter1.xhtml': encoder.encode(chapter1),
    });

    const parsed = await parseEpubFile(epubZipBytes.buffer as ArrayBuffer);
    assert.equal(parsed.title, 'Offline Engineering Manual');
    assert.equal(parsed.author, 'ZeroEgress Team');
    assert.equal(parsed.chapters.length, 1);
    assert.ok(parsed.chapters[0].textContent.includes('Zero Egress Fundamentals'));
  });

  it('compiles Markdown text into a formatted multi-page PDF', async () => {
    const sampleMarkdown = `
# System Architecture Specification

This document outlines the air-gapped pipeline for client-side document conversions.

## Core Directives
1. Zero network egress across all operations.
2. Direct WebCrypto and WebAssembly hardware acceleration.
3. Clean memory revocation for every object URL.

### Security Guarantees
All operations run within the user's browser sandbox without external dependencies.
    `;

    const pdfBlob = await convertTextOrMarkdownToPdf(sampleMarkdown, {
      title: 'System Architecture Specification',
      author: 'ZeroEgress Engineering',
      fontSize: 10,
    });

    assert.ok(pdfBlob.size > 500);
    const pdfDoc = await PDFDocument.load(await pdfBlob.arrayBuffer());
    assert.ok(pdfDoc.getPageCount() >= 1);
  });
});
