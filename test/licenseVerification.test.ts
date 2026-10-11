import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyLicenseKey,
} from '../src/engine/license/licenseVerifier.ts';
import {
  SAMPLE_ENTERPRISE_KEY,
  SAMPLE_PRO_KEY,
  SAMPLE_EXPIRED_KEY,
  SAMPLE_TAMPERED_KEY,
  signLicensePayload,
} from '../src/engine/license/licenseGenerator.ts';
import { generateComplianceReport } from '../src/engine/license/complianceReport.ts';
import type { LicensePayload } from '../src/engine/license/types.ts';

test('Offline Ed25519 Cryptographic Licensing & Compliance Verification', async (t) => {
  await t.test('verifies valid Enterprise Perpetual license key with all entitlements', async () => {
    const res = await verifyLicenseKey(SAMPLE_ENTERPRISE_KEY);
    assert.equal(res.isValid, true);
    assert.equal(res.status, 'valid');
    assert.ok(res.payload);
    assert.equal(res.payload.tier, 'enterprise');
    assert.equal(res.payload.licensee, 'Enterprise Defense Systems & Air-Gap Compliance');
    assert.equal(res.payload.expiresAt, null);
    assert.deepEqual(res.payload.entitlements, [
      'vector_pdf_redaction',
      'on_device_ocr',
      'automated_watch_folders',
    ]);
  });

  await t.test('verifies valid Pro Developer license key', async () => {
    const res = await verifyLicenseKey(SAMPLE_PRO_KEY);
    assert.equal(res.isValid, true);
    assert.equal(res.status, 'valid');
    assert.ok(res.payload);
    assert.equal(res.payload.tier, 'pro');
  });

  await t.test('detects and flags expired license keys accurately', async () => {
    const res = await verifyLicenseKey(SAMPLE_EXPIRED_KEY);
    assert.equal(res.isValid, false);
    assert.equal(res.status, 'expired');
    assert.ok(res.payload);
    assert.match(res.error || '', /expired on 2024-03-01/);
  });

  await t.test('detects tampered payload data and rejects signature mismatch', async () => {
    const res = await verifyLicenseKey(SAMPLE_TAMPERED_KEY);
    assert.equal(res.isValid, false);
    assert.equal(res.status, 'invalid_signature');
    assert.match(res.error || '', /signature mismatch|verification failed/i);
  });

  await t.test('rejects malformed or empty license strings', async () => {
    const resEmpty = await verifyLicenseKey('');
    assert.equal(resEmpty.isValid, false);
    assert.equal(resEmpty.status, 'unlicensed');

    const resMalformed = await verifyLicenseKey('not-a-license-key');
    assert.equal(resMalformed.isValid, false);
    assert.equal(resMalformed.status, 'malformed');
  });

  await t.test('dynamically signs and verifies newly generated license payload', async () => {
    const customPayload: LicensePayload = {
      id: 'lic_audit_dynamic_' + Date.now(),
      licensee: 'National Laboratory Cyber Defense',
      organization: 'DoD Air-Gap Division',
      tier: 'enterprise',
      issuedAt: new Date().toISOString(),
      expiresAt: null,
      entitlements: ['vector_pdf_redaction', 'on_device_ocr'],
      airGappedVerified: true,
    };

    const signedKey = await signLicensePayload(customPayload);
    assert.ok(signedKey.startsWith('ZE-PRO.'));

    const verification = await verifyLicenseKey(signedKey);
    assert.equal(verification.isValid, true);
    assert.equal(verification.status, 'valid');
    assert.equal(verification.payload?.licensee, 'National Laboratory Cyber Defense');
    assert.deepEqual(verification.payload?.entitlements, [
      'vector_pdf_redaction',
      'on_device_ocr',
    ]);
  });

  await t.test('generates compliant corporate compliance audit report', async () => {
    const verification = await verifyLicenseKey(SAMPLE_ENTERPRISE_KEY);
    const report = generateComplianceReport(verification);

    assert.ok(report.reportId.startsWith('ZE-AUDIT-'));
    assert.equal(report.licenseStatus, 'valid');
    assert.equal(report.securityAudit.telemetryActive, false);
    assert.equal(report.securityAudit.externalHttpConnections, 0);
    assert.equal(report.cryptography.signatureVerifiedOffline, true);
    assert.equal(report.unlockedFeatures.vectorPdfRedaction, true);
    assert.equal(report.unlockedFeatures.onDeviceOcr, true);
    assert.equal(report.unlockedFeatures.automatedWatchFolders, true);
  });
});
