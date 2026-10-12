import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createTarArchive, parseTarArchive } from '../src/engine/archives/tarHelper.ts';
import { createArchive, inspectArchive } from '../src/engine/archives/archiveService.ts';

describe('Universal Archive Suite (fflate & POSIX UStar)', () => {
  it('creates and parses POSIX UStar TAR archives with byte-for-byte fidelity', () => {
    const enc = new TextEncoder();
    const dec = new TextDecoder();
    const testFiles = [
      { name: 'document.txt', data: enc.encode('Confidential Report Data'), mtime: 1700000000000 },
      { name: 'config/settings.json', data: enc.encode('{"theme":"dark","offline":true}'), mtime: 1700000000000 },
    ];

    const tarBytes = createTarArchive(testFiles);
    assert.ok(tarBytes.length > 512, 'TAR archive contains headers and data');
    assert.strictEqual(tarBytes.length % 512, 0, 'TAR length is multiple of 512');

    const parsed = parseTarArchive(tarBytes);
    assert.strictEqual(parsed.length, 2, 'Parsed 2 files');
    assert.strictEqual(parsed[0].name, 'document.txt');
    assert.strictEqual(dec.decode(parsed[0].data), 'Confidential Report Data');
    assert.strictEqual(parsed[1].name, 'config/settings.json');
    assert.strictEqual(dec.decode(parsed[1].data), '{"theme":"dark","offline":true}');
  });

  it('creates and unpacks ZIP archives in pure memory', async () => {
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    const file1 = new File([enc.encode('Hello World')], 'greeting.txt', { type: 'text/plain' });
    const file2 = new File([enc.encode('{"status":"ok"}')], 'data.json', { type: 'application/json' });

    const result = await createArchive(
      [
        { name: 'greeting.txt', file: file1 },
        { name: 'data.json', file: file2 },
      ],
      'zip',
      6,
      'bundle.zip'
    );

    assert.ok(result.blob.size > 0, 'Generated zip blob');
    assert.strictEqual(result.fileName, 'bundle.zip');

    // Inspect the generated zip
    const inspectedFile = new File([await result.blob.arrayBuffer()], 'bundle.zip', {
      type: 'application/zip',
    });
    const inspection = await inspectArchive(inspectedFile);

    assert.strictEqual(inspection.format, 'zip');
    assert.strictEqual(inspection.fileCount, 2);

    const greetingEntry = inspection.entries.find((e) => e.name === 'greeting.txt');
    assert.ok(greetingEntry, 'Found greeting.txt');
    assert.strictEqual(dec.decode(greetingEntry.data), 'Hello World');
  });

  it('creates and unpacks TAR.GZ archives seamlessly', async () => {
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    const file = new File([enc.encode('Binary Log Payload')], 'server.log', { type: 'text/plain' });
    const result = await createArchive(
      [{ name: 'server.log', file }],
      'tar.gz',
      6,
      'logs.tar.gz'
    );

    assert.ok(result.blob.size > 0, 'Generated tar.gz blob');
    assert.strictEqual(result.fileName, 'logs.tar.gz');

    const inspectedFile = new File([await result.blob.arrayBuffer()], 'logs.tar.gz', {
      type: 'application/gzip',
    });
    const inspection = await inspectArchive(inspectedFile);

    assert.strictEqual(inspection.format, 'tar.gz');
    assert.strictEqual(inspection.fileCount, 1);
    assert.strictEqual(inspection.entries[0].name, 'server.log');
    assert.strictEqual(dec.decode(inspection.entries[0].data), 'Binary Log Payload');
  });
});
