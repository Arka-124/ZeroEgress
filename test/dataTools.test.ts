import { describe, it } from 'node:test';
import assert from 'node:assert';
import { detectFormat } from '../src/engine/data/dataConverter.ts';
import { BrowserAdapter } from '../src/engine/adapters/browserAdapter.ts';

describe('Data Tools & Cryptographic Hashes', () => {
  const adapter = new BrowserAdapter();

  describe('Structured Data Conversion (JSON ↔ CSV ↔ YAML)', () => {
    it('accurately converts JSON array to CSV and roundtrips back to JSON', () => {
      const original = [
        { name: 'Alice Smith', role: 'Architect', level: 4, active: true },
        { name: 'Bob Jones', role: 'Engineer', level: 2, active: false },
        { name: 'Carol "Ace" Danvers', role: 'DevOps, Lead', level: 5, active: true },
      ];
      const jsonInput = JSON.stringify(original, null, 2);

      // 1. JSON -> CSV
      const csvOutput = adapter.convertData(jsonInput, 'json', 'csv', { delimiter: ',' });
      assert.ok(csvOutput.includes('Alice Smith'), 'CSV contains names');
      assert.ok(csvOutput.includes('"Carol ""Ace"" Danvers"'), 'Quotes properly escaped');
      assert.ok(csvOutput.includes('"DevOps, Lead"'), 'Commas in fields are quoted');

      // 2. CSV -> JSON
      const jsonRoundtrip = adapter.convertData(csvOutput, 'csv', 'json');
      const parsedRoundtrip = JSON.parse(jsonRoundtrip);

      assert.strictEqual(parsedRoundtrip.length, 3);
      assert.strictEqual(parsedRoundtrip[0].name, 'Alice Smith');
      assert.strictEqual(parsedRoundtrip[1].level, 2);
      assert.strictEqual(parsedRoundtrip[1].active, false);
      assert.strictEqual(parsedRoundtrip[2].name, 'Carol "Ace" Danvers');
      assert.strictEqual(parsedRoundtrip[2].role, 'DevOps, Lead');
    });

    it('supports custom delimiters (semicolon and tab) for CSV', () => {
      const sample = [
        { id: 1, tag: 'frontend' },
        { id: 2, tag: 'backend' },
      ];
      const jsonInput = JSON.stringify(sample);

      // Semicolon
      const tsvSemicolon = adapter.convertData(jsonInput, 'json', 'csv', { delimiter: ';' });
      assert.ok(tsvSemicolon.includes('id;tag'), 'Headers separated by semicolon');
      const backFromSemicolon = adapter.convertData(tsvSemicolon, 'csv', 'json', { delimiter: ';' });
      assert.deepStrictEqual(JSON.parse(backFromSemicolon), sample);

      // Tab
      const tsvTab = adapter.convertData(jsonInput, 'json', 'csv', { delimiter: '\t' });
      assert.ok(tsvTab.includes("id\ttag"), 'Headers separated by tab');
      const backFromTab = adapter.convertData(tsvTab, 'csv', 'json', { delimiter: '\t' });
      assert.deepStrictEqual(JSON.parse(backFromTab), sample);
    });

    it('converts JSON to YAML and YAML to JSON seamlessly', () => {
      const config = {
        app: 'ZeroEgress',
        features: ['image-convert', 'pdf-merge', 'metadata-strip'],
        security: {
          airGapped: true,
          offlineReady: true,
          zeroUploads: true,
        },
      };
      const jsonStr = JSON.stringify(config);

      // JSON -> YAML
      const yamlStr = adapter.convertData(jsonStr, 'json', 'yaml', { indent: 2 });
      assert.ok(yamlStr.includes('app: ZeroEgress'));
      assert.ok(yamlStr.includes('airGapped: true'));

      // YAML -> JSON
      const jsonBack = adapter.convertData(yamlStr, 'yaml', 'json', { minify: true });
      assert.deepStrictEqual(JSON.parse(jsonBack), config);
    });

    it('detects format accurately from raw input text', () => {
      assert.strictEqual(detectFormat('{"hello": "world"}'), 'json');
      assert.strictEqual(detectFormat('[1, 2, 3]'), 'json');
      assert.strictEqual(detectFormat('name,age,active\nAlice,30,true\nBob,25,false'), 'csv');
      assert.strictEqual(detectFormat('server:\n  host: localhost\n  port: 8080'), 'yaml');
    });
  });

  describe('Cryptographic Checksum Engine', () => {
    const textEncoder = new TextEncoder();
    const testBuffer = textEncoder.encode('hello world').buffer as ArrayBuffer;
    const emptyBuffer = textEncoder.encode('').buffer as ArrayBuffer;

    it('computes MD5 accurately according to RFC 1321 standard vectors', async () => {
      const md5Result = await adapter.computeHash(testBuffer, 'MD5');
      assert.strictEqual(md5Result, '5eb63bbbe01eeed093cb22bb8f5acdc3');

      const emptyMd5 = await adapter.computeHash(emptyBuffer, 'MD5');
      assert.strictEqual(emptyMd5, 'd41d8cd98f00b204e9800998ecf8427e');
    });

    it('computes SHA-256 standard vectors via crypto.subtle', async () => {
      const sha256Result = await adapter.computeHash(testBuffer, 'SHA-256');
      assert.strictEqual(
        sha256Result,
        'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
      );

      const emptySha256 = await adapter.computeHash(emptyBuffer, 'SHA-256');
      assert.strictEqual(
        emptySha256,
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      );
    });

    it('computes SHA-512 standard vectors via crypto.subtle', async () => {
      const sha512Result = await adapter.computeHash(testBuffer, 'SHA-512');
      assert.strictEqual(
        sha512Result,
        '309ecc489c12d6eb4cc40f50c902f2b4d0ed77ee511a7c7a9bcd3ca86d4cd86f989dd35bc5ff499670da34255b45b0cfd830e81f605dcf7dc5542e93ae9cd76f'
      );
    });
  });
});
