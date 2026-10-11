import type { LicensePayload } from './types.ts';
import { hexToBytes, base64UrlEncode } from './licenseVerifier.ts';

export const ROOT_PRIVATE_KEY_PKCS8_HEX =
  '302e020100300506032b6570042204206e11139a023fec42ed40c5f16779c73199b1fb41c17c81fdb010d89d07e440ea';

/**
 * Pre-signed valid Enterprise Perpetual license key
 * Grants all pro features offline forever.
 */
export const SAMPLE_ENTERPRISE_KEY =
  'ZE-PRO.eyJpZCI6ImxpY196ZXJvZWdyZXNzX2VudGVycHJpc2VfMjAyNiIsImxpY2Vuc2VlIjoiRW50ZXJwcmlzZSBEZWZlbnNlIFN5c3RlbXMgJiBBaXItR2FwIENvbXBsaWFuY2UiLCJvcmdhbml6YXRpb24iOiJaZXJvRWdyZXNzIENlcnRpZmllZCBEZWZlbnNlIExhYiIsInRpZXIiOiJlbnRlcnByaXNlIiwiaXNzdWVkQXQiOiIyMDI2LTEwLTAxVDAwOjAwOjAwWiIsImV4cGlyZXNBdCI6bnVsbCwiZW50aXRsZW1lbnRzIjpbInZlY3Rvcl9wZGZfcmVkYWN0aW9uIiwib25fZGV2aWNlX29jciIsImF1dG9tYXRlZF93YXRjaF9mb2xkZXJzIl0sImFpckdhcHBlZFZlcmlmaWVkIjp0cnVlfQ.c20b9AS-esNjDIcvy8IMVCAhOUL34eOov9zVWUUgeuVLHz24MViQaDGz1BNDwOi6wFrR6i-Z0ETUzi1wcG9xCg';

/**
 * Pre-signed valid Pro Developer perpetual license key
 */
export const SAMPLE_PRO_KEY =
  'ZE-PRO.eyJpZCI6ImxpY196ZXJvZWdyZXNzX3Byb19kZXZlbG9wZXIiLCJsaWNlbnNlZSI6IlNlY3VyaXR5IFJlc2VhcmNoIFRlYW0iLCJvcmdhbml6YXRpb24iOiJaZXJvRWdyZXNzIFJlc2VhcmNoIiwidGllciI6InBybyIsImlzc3VlZEF0IjoiMjAyNi0xMC0xMFQwMDowMDowMFoiLCJleHBpcmVzQXQiOm51bGwsImVudGl0bGVtZW50cyI6WyJ2ZWN0b3JfcGRmX3JlZGFjdGlvbiIsIm9uX2RldmljZV9vY3IiLCJhdXRvbWF0ZWRfd2F0Y2hfZm9sZGVycyJdLCJhaXJHYXBwZWRWZXJpZmllZCI6dHJ1ZX0.ehHj7Qt-jXhciiSCCL1viE__qKEf8fbrR7hdt0JHt-4cdhJsX7wN3NOvZaTiRrSmKaxvx7l7cje4CTBFKM07Cg';

/**
 * Pre-signed expired license key (expired in 2024) for compliance testing
 */
export const SAMPLE_EXPIRED_KEY =
  'ZE-PRO.eyJpZCI6ImxpY196ZXJvZWdyZXNzX2V2YWxfZXhwaXJlZCIsImxpY2Vuc2VlIjoiVHJpYWwgRXZhbHVhdG9yIiwidGllciI6ImV2YWx1YXRpb24iLCJpc3N1ZWRBdCI6IjIwMjQtMDEtMDFUMDA6MDA6MDBaIiwiZXhwaXJlc0F0IjoiMjAyNC0wMy0wMVQwMDowMDowMFoiLCJlbnRpdGxlbWVudHMiOlsidmVjdG9yX3BkZl9yZWRhY3Rpb24iXSwiYWlyR2FwcGVkVmVyaWZpZWQiOnRydWV9.d0BEqERZG3wk_0pTjczT7fTQj5H25iCqhmJcOxfdv30JY_BgyQY_q2wRtVUsZ_crT0sN5dl3YPhv7AGhtd_yDA';

/**
 * Pre-signed tampered license key (signature does not match modified payload)
 */
export const SAMPLE_TAMPERED_KEY =
  'ZE-PRO.eyJpZCI6ImxpY196ZXJvZWdyZXNzX3RhbXBlcmVkIiwibGljZW5zZWUiOiJIYWNrZXIgQXR0ZW1wdCIsInRpZXIiOiJlbnRlcnByaXNlIiwiZXhwaXJlc0F0IjpudWxsLCJlbnRpdGxlbWVudHMiOlsidmVjdG9yX3BkZl9yZWRhY3Rpb24iXX0.c20b9AS-esNjDIcvy8IMVCAhOUL34eOov9zVWUUgeuVLHz24MViQaDGz1BNDwOi6wFrR6i-Z0ETUzi1wcG9xCg';

/**
 * Generate and cryptographically sign a custom license key with the Ed25519 root private key
 */
export async function signLicensePayload(
  payload: LicensePayload,
  privateKeyPkcs8Hex = ROOT_PRIVATE_KEY_PKCS8_HEX
): Promise<string> {
  const privKeyBytes = hexToBytes(privateKeyPkcs8Hex);
  const cryptoSubtle = typeof crypto !== 'undefined' ? crypto.subtle : null;

  if (!cryptoSubtle) {
    throw new Error('WebCrypto API unavailable');
  }

  const privKey = await cryptoSubtle.importKey(
    'pkcs8',
    privKeyBytes as Uint8Array<ArrayBuffer>,
    { name: 'Ed25519' },
    false,
    ['sign']
  );

  const jsonStr = JSON.stringify(payload);
  const payloadBytes = new TextEncoder().encode(jsonStr);
  const signatureBuffer = await cryptoSubtle.sign(
    'Ed25519',
    privKey,
    payloadBytes as Uint8Array<ArrayBuffer>
  );

  const signatureBytes = new Uint8Array(signatureBuffer);
  return `ZE-PRO.${base64UrlEncode(payloadBytes)}.${base64UrlEncode(signatureBytes)}`;
}
