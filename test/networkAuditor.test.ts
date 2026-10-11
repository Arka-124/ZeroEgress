import { describe, it } from 'node:test';
import assert from 'node:assert';
import { networkAuditor } from '../src/utils/networkAuditor.ts';

describe('Network Auditor & Air-Gap Egress Verification', () => {
  it('reports 100% air-gapped status with zero external egress initially', () => {
    const report = networkAuditor.getReport();
    assert.strictEqual(report.externalEgressCount, 0, 'No external egress calls made');
    assert.strictEqual(report.externalBytesSent, 0, '0 bytes transmitted to external hosts');
    assert.strictEqual(report.isAirGapped, true, 'Air-gapped status confirmed');
    assert.strictEqual(typeof report.lastCheckedAt, 'number');
  });

  it('allows subscription to audit reports and unregisters cleanly', () => {
    let callCount = 0;
    const unsubscribe = networkAuditor.subscribe((report) => {
      callCount++;
      assert.strictEqual(typeof report.isAirGapped, 'boolean');
    });

    assert.ok(callCount >= 1, 'Subscriber called immediately on registration');
    unsubscribe();
  });
});
