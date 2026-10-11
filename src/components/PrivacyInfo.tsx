import { ShieldCheck, Cpu, HardDrive, X, Layers, CheckCircle2, Lock } from 'lucide-react';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { engine } from '../engine';

export interface PrivacyInfoProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyInfo: React.FC<PrivacyInfoProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';
  const hasServiceWorker = 'serviceWorker' in navigator;
  const hasWebAssembly = typeof WebAssembly !== 'undefined';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-6 text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
                <span>Air-Gapped Privacy Architecture</span>
                <Badge variant="success" dot size="sm">
                  100% Client-Side
                </Badge>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Zero server telemetry, zero uploads, zero persistent cookies.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Security Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl border border-zinc-800/80 bg-zinc-900/40 space-y-1">
            <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-medium text-zinc-300">Data Boundary</span>
            </div>
            <p className="text-xs font-semibold text-zinc-100">Local Browser RAM</p>
            <p className="text-[11px] text-zinc-500">Files never leave your machine.</p>
          </div>

          <div className="p-3 rounded-xl border border-zinc-800/80 bg-zinc-900/40 space-y-1">
            <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
              <Cpu className="w-3.5 h-3.5 text-sky-400" />
              <span className="font-medium text-zinc-300">Execution Engine</span>
            </div>
            <p className="text-xs font-semibold text-zinc-100">{engine.name}</p>
            <p className="text-[11px] text-zinc-500">Pure Canvas & pdf-lib JS.</p>
          </div>

          <div className="p-3 rounded-xl border border-zinc-800/80 bg-zinc-900/40 space-y-1">
            <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
              <HardDrive className="w-3.5 h-3.5 text-purple-400" />
              <span className="font-medium text-zinc-300">Offline PWA</span>
            </div>
            <p className="text-xs font-semibold text-zinc-100">Service Worker Cached</p>
            <p className="text-[11px] text-zinc-500">Operates without internet.</p>
          </div>
        </div>

        {/* Decoupled Engine Layer Architecture */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-zinc-300 flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-zinc-400" />
            Decoupled Engine Layer Architecture
          </span>
          <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/20 font-mono text-[11px] space-y-2 text-zinc-400">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60">
              <span className="text-zinc-300">Abstraction Module:</span>
              <span className="text-emerald-400 font-semibold">src/engine/types.ts</span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60">
              <span className="text-zinc-300">Active Adapter:</span>
              <span className="text-zinc-200">src/engine/adapters/browserAdapter.ts</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-300">Future Drop-in Runtime:</span>
              <span className="text-zinc-500">src/engine/adapters/tauriRustAdapter.ts</span>
            </div>
          </div>
          <p className="text-[11px] text-zinc-500">
            Conversions are strictly decoupled from UI views through the standardized <code className="text-zinc-400">EngineAdapter</code> interface, enabling zero-change swapping with a native Rust backend.
          </p>
        </div>

        {/* Client Capability Diagnostic */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-zinc-300">Client Runtime Diagnostics</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
            <div className="flex items-center gap-2 p-2 rounded bg-zinc-900/50 border border-zinc-800">
              <CheckCircle2
                className={`w-3.5 h-3.5 shrink-0 ${
                  hasWebAssembly ? 'text-emerald-400' : 'text-amber-400'
                }`}
              />
              <span className="text-zinc-300 text-[11px]">WebAssembly</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded bg-zinc-900/50 border border-zinc-800">
              <CheckCircle2
                className={`w-3.5 h-3.5 shrink-0 ${
                  hasOffscreenCanvas ? 'text-emerald-400' : 'text-amber-400'
                }`}
              />
              <span className="text-zinc-300 text-[11px]">OffscreenCanvas</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded bg-zinc-900/50 border border-zinc-800">
              <CheckCircle2
                className={`w-3.5 h-3.5 shrink-0 ${
                  hasServiceWorker ? 'text-emerald-400' : 'text-amber-400'
                }`}
              />
              <span className="text-zinc-300 text-[11px]">PWA Worker</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close Inspector
          </Button>
        </div>
      </div>
    </div>
  );
};
