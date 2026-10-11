import type {
  LicenseVerificationResult,
  LicensePayload,
  LicenseEntitlement,
} from './types.ts';

/**
 * Embedded ZeroEgress Root Public Key for offline asymmetric verification (Ed25519)
 * 32-byte RFC 8032 public key. No external network lookup is ever performed.
 */
export const ROOT_PUBLIC_KEY_HEX =
  '077aa4b7fc3a0e4eee848f5a74f885545ab50b96fe8c97bf8f92a90edcdac624';

const STORAGE_KEY = 'zeroegress_license_key';

/**
 * Hex string to Uint8Array converter
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.replace(/[^0-9a-fA-F]/g, '');
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Uint8Array to Hex string converter
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Base64URL decode helper compatible with browser and Node environments
 */
export function base64UrlDecode(input: string): Uint8Array {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }

  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Base64URL encode helper compatible with browser and Node environments
 */
export function base64UrlEncode(bytes: Uint8Array): string {
  let base64: string;
  if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(bytes).toString('base64');
  } else {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    base64 = btoa(binary);
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Verify an offline Ed25519 signed license key string.
 * Key structure: `ZE-PRO.<base64url(payload_json)>.<base64url(signature_bytes)>`
 */
export async function verifyLicenseKey(
  rawKey: string,
  publicKeyHex = ROOT_PUBLIC_KEY_HEX
): Promise<LicenseVerificationResult> {
  const verifiedAt = Date.now();
  const algorithm = 'Ed25519 (RFC 8032)' as const;
  const issuer = 'ZeroEgress Offline Root Authority' as const;

  const trimmed = rawKey.trim();
  if (!trimmed) {
    return {
      isValid: false,
      status: 'unlicensed',
      error: 'No license key entered.',
      verifiedAt,
      algorithm,
      issuer,
    };
  }

  const parts = trimmed.split('.');
  if (parts.length !== 3 || parts[0] !== 'ZE-PRO') {
    return {
      isValid: false,
      status: 'malformed',
      error: 'Invalid key format. Expected ZE-PRO.<payload>.<signature>',
      verifiedAt,
      algorithm,
      issuer,
    };
  }

  const [, payloadPart, signaturePart] = parts;

  let payloadBytes: Uint8Array;
  let signatureBytes: Uint8Array;
  let payload: LicensePayload;

  try {
    payloadBytes = base64UrlDecode(payloadPart);
    signatureBytes = base64UrlDecode(signaturePart);
    const jsonStr = new TextDecoder().decode(payloadBytes);
    payload = JSON.parse(jsonStr) as LicensePayload;
  } catch (err: any) {
    return {
      isValid: false,
      status: 'malformed',
      error: `Malformed license payload or signature: ${err?.message || 'Parse error'}`,
      verifiedAt,
      algorithm,
      issuer,
    };
  }

  if (signatureBytes.length !== 64) {
    return {
      isValid: false,
      status: 'invalid_signature',
      error: `Invalid Ed25519 signature length (expected 64 bytes, received ${signatureBytes.length}).`,
      verifiedAt,
      algorithm,
      issuer,
    };
  }

  // Cryptographic offline verification via WebCrypto Ed25519
  try {
    const rawPublicKey = hexToBytes(publicKeyHex);
    const cryptoSubtle = typeof crypto !== 'undefined' ? crypto.subtle : null;

    if (!cryptoSubtle) {
      throw new Error('WebCrypto API is unavailable in current runtime.');
    }

    const cryptoKey = await cryptoSubtle.importKey(
      'raw',
      rawPublicKey as Uint8Array<ArrayBuffer>,
      { name: 'Ed25519' },
      false,
      ['verify']
    );

    const isSignatureValid = await cryptoSubtle.verify(
      'Ed25519',
      cryptoKey,
      signatureBytes as Uint8Array<ArrayBuffer>,
      payloadBytes as Uint8Array<ArrayBuffer>
    );

    if (!isSignatureValid) {
      return {
        isValid: false,
        status: 'invalid_signature',
        payload,
        error: 'Cryptographic signature mismatch! The license data has been tampered with or signed by an unauthorized key.',
        verifiedAt,
        algorithm,
        issuer,
      };
    }
  } catch (err: any) {
    return {
      isValid: false,
      status: 'invalid_signature',
      payload,
      error: `Cryptographic verification failed: ${err?.message || 'Signature check error'}`,
      verifiedAt,
      algorithm,
      issuer,
    };
  }

  // Expiration check
  if (payload.expiresAt) {
    const expiryDate = new Date(payload.expiresAt).getTime();
    if (isNaN(expiryDate) || Date.now() > expiryDate) {
      return {
        isValid: false,
        status: 'expired',
        payload,
        rawKey: trimmed,
        error: `License expired on ${payload.expiresAt}.`,
        verifiedAt,
        algorithm,
        issuer,
      };
    }
  }

  return {
    isValid: true,
    status: 'valid',
    payload,
    rawKey: trimmed,
    verifiedAt,
    algorithm,
    issuer,
  };
}

/**
 * Read and verify license stored in localStorage (if any)
 */
export async function getStoredLicense(): Promise<LicenseVerificationResult> {
  if (typeof window === 'undefined') {
    return {
      isValid: false,
      status: 'unlicensed',
      error: 'Running in non-browser environment.',
      verifiedAt: Date.now(),
      algorithm: 'Ed25519 (RFC 8032)',
      issuer: 'ZeroEgress Offline Root Authority',
    };
  }

  const storedKey = localStorage.getItem(STORAGE_KEY);
  if (!storedKey) {
    return {
      isValid: false,
      status: 'unlicensed',
      verifiedAt: Date.now(),
      algorithm: 'Ed25519 (RFC 8032)',
      issuer: 'ZeroEgress Offline Root Authority',
    };
  }

  return verifyLicenseKey(storedKey);
}

/**
 * Store a verified license in local storage
 */
export async function storeLicenseKey(rawKey: string): Promise<LicenseVerificationResult> {
  const result = await verifyLicenseKey(rawKey);
  if (result.isValid && typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, rawKey.trim());
  }
  return result;
}

/**
 * Remove stored license
 */
export function clearStoredLicense(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/**
 * Global feature flags for free tier bypass and UI display.
 * Toggle these to re-enable Pro gating and restore the license UI.
 */
export const BYPASS_PRO_RESTRICTIONS = true;
export const SHOW_PRO_BADGES = Boolean(false) as boolean;
export const SHOW_LICENSE_UI = Boolean(false) as boolean;

/**
 * Check if a specific entitlement is active on the current license.
 * Temporarily bypassed: unlocks all features for free by default without requiring an entered key.
 */
export async function hasEntitlement(entitlement: LicenseEntitlement): Promise<boolean> {
  // Temporary bypass: all Pro features unlocked for free by default
  if (BYPASS_PRO_RESTRICTIONS) {
    return true;
  }

  const lic = await getStoredLicense();
  if (!lic.isValid || !lic.payload) return false;
  return lic.payload.entitlements.includes(entitlement);
}

