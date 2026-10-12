import React, { useState, useEffect } from 'react';
import { ShieldCheck, Moon, Sun, Wifi, WifiOff, FileCode2, Layers, Key } from 'lucide-react';
import { getStoredLicense, SHOW_LICENSE_UI } from '../engine/license/licenseVerifier.ts';
import type { LicenseVerificationResult } from '../engine/license/types.ts';

export interface HeaderProps {
  onOpenPrivacyInfo?: () => void;
  onOpenLicense?: () => void;
  onOpenArchitecture?: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenPrivacyInfo,
  onOpenLicense,
  onOpenArchitecture,
  isDark,
  onToggleTheme,
}) => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [license, setLicense] = useState<LicenseVerificationResult | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const refreshLic = () => {
      getStoredLicense().then(setLicense).catch(() => {});
    };
    refreshLic();

    window.addEventListener('zeroegress:license-updated', refreshLic);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('zeroegress:license-updated', refreshLic);
    };
  }, []);

  const tier = license?.isValid && license.payload?.tier ? license.payload.tier.toUpperCase() : null;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md transition-colors">
      <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-12 xl:px-16 h-14 flex items-center justify-between gap-4">
        {/* Left: Brand Identity */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-100 shadow-sm">
            <Layers className="w-4 h-4 text-zinc-200" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight text-zinc-100">
              ZeroEgress
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
              v-3
            </span>
          </div>
        </div>

        {/* Center: Privacy Indicator Badge */}
        <div className="hidden sm:flex items-center">
          <button
            type="button"
            onClick={onOpenPrivacyInfo}
            className="group flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900 hover:border-zinc-700 transition-all cursor-pointer"
            title="Click to view air-gapped security details"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[11px] font-mono text-zinc-300 group-hover:text-zinc-100 tracking-tight">
              Air-Gapped: 100% Client-Side (Zero Server Uploads)
            </span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 group-hover:text-emerald-300 transition-colors" />
          </button>
        </div>

        {/* Right: Actions, License & Theme Toggle */}
        <div className="flex items-center gap-2">
          {/* Offline / Online Network Indicator */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded border border-zinc-800/80 bg-zinc-900/40 text-[11px] font-mono text-zinc-400"
            title={
              isOnline
                ? 'Online (PWA cached for offline use)'
                : 'Offline Mode Active (Running 100% locally)'
            }
          >
            {isOnline ? (
              <>
                <Wifi className="w-3 h-3 text-zinc-400" />
                <span className="hidden md:inline text-zinc-400">PWA Ready</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-amber-400" />
                <span className="text-amber-400 font-medium">Offline</span>
              </>
            )}
          </div>

          {/* License & Compliance Button (temporarily hidden for free public access) */}
          {SHOW_LICENSE_UI && (
            <button
              type="button"
              onClick={onOpenLicense}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer"
              title="View offline Ed25519 cryptographic license status and compliance audit report"
            >
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline font-mono text-[11px]">
                {tier ? `${tier}` : 'License'}
              </span>
              {tier && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              )}
            </button>
          )}

          {/* Architecture Dialog Trigger */}
          <button
            type="button"
            onClick={onOpenArchitecture}
            className="hidden lg:flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors rounded hover:bg-zinc-900 cursor-pointer"
            title="View system architecture and technical blueprint"
          >
            <FileCode2 className="w-3.5 h-3.5 text-sky-400" />
            <span>Architecture</span>
          </button>

          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="p-2 rounded-md border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors cursor-pointer"
            aria-label="Toggle theme"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </header>
  );
};
