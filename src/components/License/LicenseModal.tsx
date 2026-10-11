import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Key,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  Trash2,
  Lock,
  Sparkles,
  X,
  FileCheck2,
} from 'lucide-react';
import {
  verifyLicenseKey,
  getStoredLicense,
  storeLicenseKey,
  clearStoredLicense,
} from '../../engine/license/licenseVerifier.ts';
import {
  SAMPLE_ENTERPRISE_KEY,
  SAMPLE_EXPIRED_KEY,
  SAMPLE_TAMPERED_KEY,
} from '../../engine/license/licenseGenerator.ts';
import {
  generateComplianceReport,
  downloadComplianceReportJson,
  downloadComplianceReportHtml,
} from '../../engine/license/complianceReport.ts';
import type { LicenseVerificationResult } from '../../engine/license/types.ts';
import { isTauriEnvironment } from '../../engine/adapters/desktopAdapter.ts';

export interface LicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLicenseChanged?: () => void;
}

export const LicenseModal: React.FC<LicenseModalProps> = ({
  isOpen,
  onClose,
  onLicenseChanged,
}) => {
  const [keyInput, setKeyInput] = useState('');
  const [currentLicense, setCurrentLicense] = useState<LicenseVerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Load active stored license on modal open
  useEffect(() => {
    if (isOpen) {
      getStoredLicense().then((res) => {
        setCurrentLicense(res);
        if (res.rawKey) {
          setKeyInput(res.rawKey);
        }
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleVerifyAndActivate = async () => {
    setIsVerifying(true);
    setNotification(null);
    try {
      const res = await verifyLicenseKey(keyInput);

      if (res.isValid) {
        await storeLicenseKey(keyInput);
        setCurrentLicense(res);
        setNotification('License cryptographically verified and activated successfully!');
        onLicenseChanged?.();
      } else {
        setNotification(res.error || 'Verification failed: invalid cryptographic signature.');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDeactivate = () => {
    clearStoredLicense();
    setCurrentLicense(null);
    setKeyInput('');
    setNotification('License deactivated. App running in standard Air-Gap mode.');
    onLicenseChanged?.();
  };

  const handleLoadSample = (sampleKey: string) => {
    setKeyInput(sampleKey);
    setNotification('Sample key populated. Click "Verify & Activate" to test offline math.');
  };

  const handleExportJson = () => {
    const lic = currentLicense || {
      isValid: false,
      status: 'unlicensed' as const,
      verifiedAt: Date.now(),
      algorithm: 'Ed25519 (RFC 8032)' as const,
      issuer: 'ZeroEgress Offline Root Authority' as const,
    };
    const report = generateComplianceReport(lic);
    downloadComplianceReportJson(report);
  };

  const handleExportHtml = () => {
    const lic = currentLicense || {
      isValid: false,
      status: 'unlicensed' as const,
      verifiedAt: Date.now(),
      algorithm: 'Ed25519 (RFC 8032)' as const,
      issuer: 'ZeroEgress Offline Root Authority' as const,
    };
    const report = generateComplianceReport(lic);
    downloadComplianceReportHtml(report);
  };

  const isTauri = isTauriEnvironment();
  const activeStatus = currentLicense?.status || 'unlicensed';
  const entitlements = currentLicense?.payload?.entitlements || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 sm:p-8 text-zinc-100 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-800/80 border border-zinc-700/80 flex items-center justify-center text-zinc-100">
              <Key className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
                Offline Cryptographic Licensing & Compliance
              </h2>
              <p className="text-xs text-zinc-400 font-mono">
                RFC 8032 Ed25519 Asymmetric Verification · Zero Phone-Home
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Callout Banner */}
        <div className="flex items-center justify-between p-4 rounded-xl border border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-3">
            {activeStatus === 'valid' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : activeStatus === 'expired' ? (
              <Clock className="w-5 h-5 text-amber-400 shrink-0" />
            ) : activeStatus === 'invalid_signature' ? (
              <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-zinc-400 shrink-0" />
            )}
            <div>
              <div className="text-xs font-semibold flex items-center gap-2">
                <span>License Status:</span>
                <span
                  className={`font-mono px-2 py-0.5 rounded text-[10px] ${
                    activeStatus === 'valid'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : activeStatus === 'expired'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800'
                      : activeStatus === 'invalid_signature'
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : 'bg-zinc-800 text-zinc-300'
                  }`}
                >
                  {activeStatus.toUpperCase()}
                </span>
                {currentLicense?.payload?.tier && (
                  <span className="text-[10px] font-mono text-zinc-400">
                    ({currentLicense.payload.tier.toUpperCase()} TIER)
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {currentLicense?.payload
                  ? `Licensed to: ${currentLicense.payload.licensee} ${
                      currentLicense.payload.organization ? `(${currentLicense.payload.organization})` : ''
                    }`
                  : 'Operating in client-side evaluation mode. Enter an Ed25519 signed key to unlock Pro capabilities.'}
              </p>
            </div>
          </div>
          {currentLicense?.isValid && (
            <button
              type="button"
              onClick={handleDeactivate}
              className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-rose-400 hover:border-rose-800 transition-colors text-xs flex items-center gap-1 cursor-pointer"
              title="Deactivate license"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Entitlements Checklist */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono">
            Pro Feature Entitlements (Offline Enforced)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-950/40 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-200">Vector PDF Redaction</span>
                {entitlements.includes('vector_pdf_redaction') ? (
                  <span className="text-[10px] font-mono text-emerald-400 font-bold">UNLOCKED</span>
                ) : (
                  <Lock className="w-3.5 h-3.5 text-zinc-500" />
                )}
              </div>
              <p className="text-[10px] text-zinc-400 leading-relaxed">
                Purge target strings directly from PDF binary streams.
              </p>
            </div>

            <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-950/40 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-200">On-Device OCR</span>
                {entitlements.includes('on_device_ocr') ? (
                  <span className="text-[10px] font-mono text-emerald-400 font-bold">UNLOCKED</span>
                ) : (
                  <Lock className="w-3.5 h-3.5 text-zinc-500" />
                )}
              </div>
              <p className="text-[10px] text-zinc-400 leading-relaxed">
                Inject ISO 32000-1 searchable text layers on scanned pages.
              </p>
            </div>

            <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-950/40 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-200">Watch Folders</span>
                {entitlements.includes('automated_watch_folders') ? (
                  <span className="text-[10px] font-mono text-emerald-400 font-bold">UNLOCKED</span>
                ) : (
                  <Lock className="w-3.5 h-3.5 text-zinc-500" />
                )}
              </div>
              <p className="text-[10px] text-zinc-400 leading-relaxed">
                Automated background conversions from monitored local folders.
              </p>
            </div>
          </div>
        </div>

        {/* License Key Input Box */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label htmlFor="license-input-box" className="text-xs font-semibold text-zinc-300">
              Enter Signed Offline License String:
            </label>
            <span className="text-[10px] font-mono text-zinc-500">
              Format: ZE-PRO.&lt;payload&gt;.&lt;signature&gt;
            </span>
          </div>

          <textarea
            id="license-input-box"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Paste ZE-PRO signed license key here..."
            rows={3}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-600 transition-colors resize-none"
          />

          {notification && (
            <div className="p-2.5 rounded-lg border border-zinc-800 bg-zinc-950/70 text-xs font-mono text-zinc-300 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{notification}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleLoadSample(SAMPLE_ENTERPRISE_KEY)}
                className="px-2.5 py-1 text-[11px] font-mono rounded-lg border border-zinc-800 bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                + Enterprise Perpetual Key
              </button>
              <button
                type="button"
                onClick={() => handleLoadSample(SAMPLE_EXPIRED_KEY)}
                className="px-2.5 py-1 text-[11px] font-mono rounded-lg border border-zinc-800 bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                + Test Expired Key
              </button>
              <button
                type="button"
                onClick={() => handleLoadSample(SAMPLE_TAMPERED_KEY)}
                className="px-2.5 py-1 text-[11px] font-mono rounded-lg border border-zinc-800 bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                + Test Tampered Key
              </button>
            </div>

            <button
              type="button"
              onClick={handleVerifyAndActivate}
              disabled={isVerifying || !keyInput.trim()}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              {isVerifying ? (
                <>
                  <div className="w-3 h-3 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                  <span>Verifying Math...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Verify & Activate</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Corporate Compliance Audit Export Section */}
        <div className="border-t border-zinc-800/80 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                <FileCheck2 className="w-4 h-4 text-emerald-400" />
                <span>Corporate Compliance Audit Certification</span>
              </h3>
              <p className="text-[11px] text-zinc-400">
                Export cryptographic proof of zero telemetry, air-gap validation, and license integrity.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportJson}
                className="px-3 py-1 text-xs font-mono rounded-lg border border-zinc-800 bg-zinc-950 hover:bg-zinc-800 text-zinc-300 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3 h-3 text-zinc-400" />
                <span>Audit JSON</span>
              </button>
              <button
                type="button"
                onClick={handleExportHtml}
                className="px-3 py-1 text-xs font-mono rounded-lg border border-zinc-800 bg-zinc-950 hover:bg-zinc-800 text-zinc-300 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3 h-3 text-emerald-400" />
                <span>Audit Certificate (HTML)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="border-t border-zinc-800/60 pt-3 flex items-center justify-between text-[11px] font-mono text-zinc-500">
          <span>Engine: {isTauri ? 'Tauri Rust Native Desktop' : 'WebAssembly Sandbox (PWA)'}</span>
          <span>Zero External Server Uploads Confirmed</span>
        </div>
      </div>
    </div>
  );
};
