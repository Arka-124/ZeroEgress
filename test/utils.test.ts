import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatBytes, replaceExtension, parsePageRange } from '../src/utils/fileUtils.ts';

describe('fileUtils tests', () => {
  it('formatBytes accurately formats bytes into readable units', () => {
    assert.strictEqual(formatBytes(0), '0 B');
    assert.strictEqual(formatBytes(1024), '1 KB');
    assert.strictEqual(formatBytes(1048576), '1 MB');
    assert.strictEqual(formatBytes(1572864), '1.5 MB');
  });

  it('replaceExtension replaces or attaches file extensions correctly', () => {
    assert.strictEqual(replaceExtension('photo.png', 'webp'), 'photo.webp');
    assert.strictEqual(replaceExtension('document.tar.gz', 'pdf'), 'document.tar.pdf');
    assert.strictEqual(replaceExtension('raw_file', 'jpg'), 'raw_file.jpg');
    assert.strictEqual(replaceExtension('photo.png', '.avif'), 'photo.avif');
  });

  it('parsePageRange handles intervals, individual numbers, and boundaries', () => {
    // Empty range returns all pages
    assert.deepStrictEqual(parsePageRange('', 5), [1, 2, 3, 4, 5]);

    // Range intervals
    assert.deepStrictEqual(parsePageRange('1-3, 5', 10), [1, 2, 3, 5]);

    // Disordered and duplicate ranges
    assert.deepStrictEqual(parsePageRange('4, 2-3, 2, 6-5', 10), [2, 3, 4, 5, 6]);

    // Clamping to total pages
    assert.deepStrictEqual(parsePageRange('8-15', 10), [8, 9, 10]);

    // Invalid numbers ignored
    assert.deepStrictEqual(parsePageRange('0, -1, foo, 2', 5), [2]);
  });
});
