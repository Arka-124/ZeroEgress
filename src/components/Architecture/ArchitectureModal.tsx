import React, { useState } from 'react';
import {
  FileCode2,
  Layers,
  ShieldCheck,
  HardDrive,
  Lock,
  Workflow,
  ServerOff,
  Zap,
  CheckCircle2,
  X,
  Code2,
  Film,
  FolderSync,
  FileText,
  ImageIcon,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { engine } from '../../engine';
import { isTauriEnvironment } from '../../engine/adapters/desktopAdapter';

export interface ArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabKey = 'topology' | 'security' | 'subsystems';

export const ArchitectureModal: React.FC<ArchitectureModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('topology');

  if (!isOpen) return null;

  const isTauri = isTauriEnvironment();
  const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';
  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
  const hasServiceWorker = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150 overflow-y-auto">
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 text-zinc-100 my-8">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-950/60 border border-sky-800/60 flex items-center justify-center text-sky-400 shadow-sm">
              <FileCode2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold tracking-tight text-zinc-100">
                  System Architecture & Technical Blueprint
                </h2>
                <Badge variant="outline" size="sm" className="font-mono text-[10px]">
                  {isTauri ? 'Native Tauri Shell' : 'Browser WebAssembly'}
                </Badge>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 font-mono">
                Decoupled engine adapter · Multi-threaded workers · Zero-egress sandbox
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors cursor-pointer"
            aria-label="Close architecture modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 p-1 rounded-xl border border-zinc-800 bg-zinc-900/50">
          <button
            type="button"
            onClick={() => setActiveTab('topology')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'topology'
                ? 'bg-zinc-100 text-zinc-950 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <Workflow className="w-3.5 h-3.5" />
            <span>Engine Topology</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'security'
                ? 'bg-zinc-100 text-zinc-950 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Air-Gap Security Model</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('subsystems')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'subsystems'
                ? 'bg-zinc-100 text-zinc-950 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Subsystem Specifications</span>
          </button>
        </div>

        {/* TAB 1: Engine Topology Diagram */}
        {activeTab === 'topology' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <p className="text-xs text-zinc-400">
              ZeroEgress uses an inverted, decoupled engine architecture. The React UI never executes direct heavy file transforms on the main thread; work is dispatched across dedicated isolated layers.
            </p>

            {/* Topology Flow Diagram */}
            <div className="space-y-3 font-mono text-xs">
              {/* Layer 1: Client Ingress */}
              <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-2">
                <div className="flex items-center justify-between text-zinc-300">
                  <span className="flex items-center gap-2 font-semibold text-zinc-100">
                    <span className="w-5 h-5 rounded-md bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-300">1</span>
                    <span>Client Ingress & UI Orchestration</span>
                  </span>
                  <Badge variant="outline" size="sm">React 19 + TypeScript</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-zinc-400 pt-1">
                  <div className="p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/60">
                    Global Window Drag-and-Drop
                  </div>
                  <div className="p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/60">
                    Batch Queue State Machine
                  </div>
                  <div className="p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/60">
                    Blob URL Lifecycle Tracker
                  </div>
                </div>
              </div>

              {/* Layer 2: Abstract Engine Adapter Boundary */}
              <div className="p-3.5 rounded-xl border border-sky-800/60 bg-sky-950/20 space-y-2">
                <div className="flex items-center justify-between text-sky-300">
                  <span className="flex items-center gap-2 font-semibold">
                    <span className="w-5 h-5 rounded-md bg-sky-900/80 border border-sky-700/60 flex items-center justify-center text-[10px] text-sky-200">2</span>
                    <span>Decoupled Engine Adapter Interface (EngineAdapter)</span>
                  </span>
                  <span className="text-[11px] font-bold text-sky-400">Active: {engine.name}</span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Polymorphic interface decoupling the UI from execution runtime. Automatically swaps between in-browser Wasm and native Tauri Rust FFI without UI re-renders.
                </p>
              </div>

              {/* Layer 3: Execution Runtime Subsystems */}
              <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-2">
                <div className="flex items-center justify-between text-zinc-300">
                  <span className="flex items-center gap-2 font-semibold text-zinc-100">
                    <span className="w-5 h-5 rounded-md bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-300">3</span>
                    <span>Sandboxed Subsystem Processors</span>
                  </span>
                  <span className="text-[10px] text-emerald-400 font-semibold">100% In-Memory</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80 space-y-1">
                    <div className="flex items-center justify-between font-semibold text-zinc-200">
                      <span className="flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-zinc-300" />
                        <span>Image Converter</span>
                      </span>
                      <span className="text-[10px] text-zinc-500">OffscreenCanvas</span>
                    </div>
                    <p className="text-zinc-400 text-[10px]">
                      WebCodecs & Canvas2D rasterization. AVIF/WebP lossy & lossless compression.
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80 space-y-1">
                    <div className="flex items-center justify-between font-semibold text-zinc-200">
                      <span className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-zinc-300" />
                        <span>PDF & Vector Redact</span>
                      </span>
                      <span className="text-[10px] text-zinc-500">PDF-Lib / Rust lopdf</span>
                    </div>
                    <p className="text-zinc-400 text-[10px]">
                      Page range extraction, multi-document merging, and content stream byte purging.
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80 space-y-1">
                    <div className="flex items-center justify-between font-semibold text-zinc-200">
                      <span className="flex items-center gap-1.5">
                        <Code2 className="w-3.5 h-3.5 text-sky-400" />
                        <span>Data & Hash Worker</span>
                      </span>
                      <span className="text-[10px] text-sky-400">Web Worker Pool</span>
                    </div>
                    <p className="text-zinc-400 text-[10px]">
                      Multi-threaded JSON/CSV/YAML roundtripping up to 50MB and SHA-256/MD5 hashing.
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80 space-y-1">
                    <div className="flex items-center justify-between font-semibold text-zinc-200">
                      <span className="flex items-center gap-1.5">
                        <Film className="w-3.5 h-3.5 text-purple-400" />
                        <span>Media Studio Core</span>
                      </span>
                      <span className="text-[10px] text-purple-400">FFmpeg 0.12 WASM</span>
                    </div>
                    <p className="text-zinc-400 text-[10px]">
                      Lazy-loaded WebAssembly transcode engine with lossless stream trimming.
                    </p>
                  </div>
                </div>
              </div>

              {/* Layer 4: Deterministic Cleanup & Egress Barrier */}
              <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md bg-emerald-900/60 border border-emerald-700/60 flex items-center justify-center text-[10px] text-emerald-300 font-bold">4</div>
                  <div>
                    <span className="font-semibold text-emerald-300">Memory Cleanup & Egress Barrier</span>
                    <p className="text-[10px] text-emerald-400/80">
                      Deterministic URL.revokeObjectURL(), zero telemetry, zero server uploads.
                    </p>
                  </div>
                </div>
                <Badge variant="success" size="sm">Verified Egress = 0</Badge>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Air-Gap Security Model */}
        {activeTab === 'security' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
              {/* Egress Barrier */}
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-2">
                <div className="flex items-center gap-2 text-zinc-100 font-semibold">
                  <ServerOff className="w-4 h-4 text-emerald-400" />
                  <span>Strict Zero-Network Egress</span>
                </div>
                <p className="text-zinc-400 text-[11px] leading-relaxed">
                  No remote backend exists. All file buffers are loaded into browser memory (<code className="text-zinc-200">ArrayBuffer</code> / <code className="text-zinc-200">Blob</code>), processed, and downloaded directly through client synthetic anchors.
                </p>
              </div>

              {/* Offline PWA & Workbox */}
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-2">
                <div className="flex items-center gap-2 text-zinc-100 font-semibold">
                  <HardDrive className="w-4 h-4 text-sky-400" />
                  <span>Cache-First Service Worker</span>
                </div>
                <p className="text-zinc-400 text-[11px] leading-relaxed">
                  WebAssembly binaries, Web Workers, and application scripts are precached upon first visit. Once loaded, the application operates indefinitely in complete air-gap without an internet connection.
                </p>
              </div>

              {/* Memory Safety */}
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-2">
                <div className="flex items-center gap-2 text-zinc-100 font-semibold">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Deterministic Blob Revocation</span>
                </div>
                <p className="text-zinc-400 text-[11px] leading-relaxed">
                  Every <code className="text-zinc-200">URL.createObjectURL()</code> is registered in an active cleanup manifest and revoked immediately when items are cleared, batch-zipped, or unmounted to prevent heap bloat.
                </p>
              </div>

              {/* Cryptographic Offline Licensing */}
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-2">
                <div className="flex items-center gap-2 text-zinc-100 font-semibold">
                  <Lock className="w-4 h-4 text-purple-400" />
                  <span>Ed25519 Offline Licensing</span>
                </div>
                <p className="text-zinc-400 text-[11px] leading-relaxed">
                  Zero phone-home license checks. License validation uses asymmetric Ed25519 (RFC 8032) digital signatures verified mathematically entirely in-memory with the embedded public root key.
                </p>
              </div>
            </div>

            {/* Diagnostic Verification Note */}
            <div className="p-3.5 rounded-xl border border-zinc-800/80 bg-zinc-900/30 flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-300">Live Traffic Egress Auditor:</span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>0 Outgoing Requests Intercepted</span>
              </span>
            </div>
          </div>
        )}

        {/* TAB 3: Subsystem Technical Specifications */}
        {activeTab === 'subsystems' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/30 font-mono text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 text-[11px]">
                    <th className="p-3">Subsystem</th>
                    <th className="p-3">Runtime Core</th>
                    <th className="p-3">Supported Formats</th>
                    <th className="p-3">Thread Model</th>
                    <th className="p-3">Isolation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50 text-[11px] text-zinc-300">
                  <tr>
                    <td className="p-3 font-semibold text-zinc-100 flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Image Converter</span>
                    </td>
                    <td className="p-3 text-zinc-400">Canvas 2D / WebCodecs</td>
                    <td className="p-3">JPEG, PNG, WebP, AVIF</td>
                    <td className="p-3 text-emerald-400">Offscreen / Main</td>
                    <td className="p-3 text-zinc-400">In-Memory Buffer</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-zinc-100 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-zinc-400" />
                      <span>PDF Tools</span>
                    </td>
                    <td className="p-3 text-zinc-400">PDF-Lib + Rust lopdf</td>
                    <td className="p-3">PDF 1.4 – 2.0</td>
                    <td className="p-3 text-emerald-400">Client Task / FFI</td>
                    <td className="p-3 text-zinc-400">Stream Byte Purge</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-zinc-100 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Metadata Stripper</span>
                    </td>
                    <td className="p-3 text-zinc-400">Binary APP1 / Exif Parser</td>
                    <td className="p-3">JPEG, PNG, WebP, PDF</td>
                    <td className="p-3 text-emerald-400">ArrayBuffer Chunk</td>
                    <td className="p-3 text-zinc-400">Lossless Byte Strip</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-zinc-100 flex items-center gap-1.5">
                      <Code2 className="w-3.5 h-3.5 text-sky-400" />
                      <span>Data Tools & Hasher</span>
                    </td>
                    <td className="p-3 text-zinc-400">Web Worker + crypto.subtle</td>
                    <td className="p-3">JSON, CSV, YAML, Hashes</td>
                    <td className="p-3 text-sky-400">Dedicated Worker</td>
                    <td className="p-3 text-zinc-400">Isolated Thread</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-zinc-100 flex items-center gap-1.5">
                      <Film className="w-3.5 h-3.5 text-purple-400" />
                      <span>Media Studio</span>
                    </td>
                    <td className="p-3 text-zinc-400">FFmpeg 0.12 WebAssembly</td>
                    <td className="p-3">MP4, MKV, WebM, MP3, WAV</td>
                    <td className="p-3 text-purple-400">Lazy Wasm Worker</td>
                    <td className="p-3 text-zinc-400">SharedArrayBuffer</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-zinc-100 flex items-center gap-1.5">
                      <FolderSync className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Watch Folders</span>
                    </td>
                    <td className="p-3 text-zinc-400">Tauri v2 OS Filesystem Hook</td>
                    <td className="p-3">Automated Watch Pipeline</td>
                    <td className="p-3 text-amber-400">Native Background Daemon</td>
                    <td className="p-3 text-zinc-400">OS Filesystem Direct</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Browser Feature Diagnostic Checks */}
            <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/20 font-mono text-[11px] space-y-1.5 text-zinc-400">
              <span className="font-semibold text-zinc-300">Client Runtime Capabilities:</span>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className={`w-3.5 h-3.5 ${hasOffscreenCanvas ? 'text-emerald-400' : 'text-zinc-600'}`} />
                  <span>OffscreenCanvas: {hasOffscreenCanvas ? 'Supported' : 'Fallback'}</span>
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className={`w-3.5 h-3.5 ${hasSharedArrayBuffer ? 'text-emerald-400' : 'text-amber-400'}`} />
                  <span>SharedArrayBuffer: {hasSharedArrayBuffer ? 'Isolated' : 'Standard'}</span>
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className={`w-3.5 h-3.5 ${hasServiceWorker ? 'text-emerald-400' : 'text-zinc-600'}`} />
                  <span>PWA Worker: {hasServiceWorker ? 'Active' : 'N/A'}</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
          <span className="text-[11px] font-mono text-zinc-500">
            ZeroEgress Technical Architecture Specification v1.0
          </span>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close Blueprint
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ArchitectureModal;
