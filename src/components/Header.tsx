import React, { useState, useEffect } from 'react';
import { ShieldCheck, Moon, Sun, Wifi, WifiOff, FileCode2, Layers } from 'lucide-react';

export interface HeaderProps {
  onOpenPrivacyInfo?: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenPrivacyInfo,
  isDark,
  onToggleTheme,
}) => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md transition-colors">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
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
              airgap-v1
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

        {/* Right: Offline / PWA status & Theme Toggle */}
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

          {/* Privacy Dialog Trigger (Mobile) */}
          <button
            type="button"
            onClick={onOpenPrivacyInfo}
            className="sm:hidden p-1.5 rounded border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200"
            title="Privacy Verification"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </button>

          {/* Architecture / Source Link */}
          <button
            type="button"
            onClick={onOpenPrivacyInfo}
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors rounded hover:bg-zinc-900"
          >
            <FileCode2 className="w-3.5 h-3.5" />
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
