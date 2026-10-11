/**
 * ZeroEgress Cryptographic Offline License & Compliance Types
 *
 * Implements strict offline Ed25519 asymmetric signature contracts.
 * Zero network calls, zero server telemetry, 100% on-device validation.
 */

export type LicenseTier = 'pro' | 'enterprise' | 'evaluation';

export type LicenseEntitlement =
  | 'vector_pdf_redaction'
  | 'on_device_ocr'
  | 'automated_watch_folders';

export interface LicensePayload {
  /** Unique license credential identifier */
  id: string;
  /** Name of the licensee (individual or legal entity) */
  licensee: string;
  /** Registered organization name or security domain */
  organization?: string;
  /** License tier */
  tier: LicenseTier;
  /** ISO 8601 timestamp when license was created */
  issuedAt: string;
  /** ISO 8601 timestamp when license expires, or null for perpetual */
  expiresAt: string | null;
  /** List of cryptographically granted feature entitlements */
  entitlements: LicenseEntitlement[];
  /** Cryptographic security claims */
  airGappedVerified: boolean;
}

export type LicenseVerificationStatus =
  | 'valid'
  | 'expired'
  | 'invalid_signature'
  | 'malformed'
  | 'unlicensed';

export interface LicenseVerificationResult {
  isValid: boolean;
  status: LicenseVerificationStatus;
  payload?: LicensePayload;
  rawKey?: string;
  error?: string;
  verifiedAt: number;
  algorithm: 'Ed25519 (RFC 8032)';
  issuer: 'ZeroEgress Offline Root Authority';
}

export interface ComplianceAuditReport {
  reportId: string;
  generatedAt: string;
  environment: 'Tauri Native Desktop' | 'Client-Side Web PWA';
  licenseStatus: LicenseVerificationStatus;
  licenseDetails?: LicensePayload;
  cryptography: {
    algorithm: 'Ed25519 (RFC 8032)';
    rootAuthority: string;
    signatureVerifiedOffline: boolean;
    zeroNetworkEgressVerified: boolean;
  };
  securityAudit: {
    telemetryActive: false;
    externalHttpConnections: 0;
    localSandboxEnforced: true;
    allProcessingOnDevice: true;
  };
  unlockedFeatures: {
    vectorPdfRedaction: boolean;
    onDeviceOcr: boolean;
    automatedWatchFolders: boolean;
  };
}
