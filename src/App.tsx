import React, { useState, useEffect } from 'react';
import {
  ImageIcon,
  FileText,
  Shield,
  ShieldAlert,
  UploadCloud,
  Code2,
  Film,
  FolderSync,
  Key,
  FileCode2,
} from 'lucide-react';
import { Header } from './components/Header';
import { ImageConverter } from './components/ImageConverter/ImageConverter';
import { PdfTools } from './components/PdfTools/PdfTools';
import { MetadataScrubber } from './components/MetadataScrubber/MetadataScrubber';
import { DataTools } from './components/DataTools/DataTools';
import { WatchFolders } from './components/WatchFolders/WatchFolders';
import { PrivacyInfo } from './components/PrivacyInfo';
import { LicenseModal } from './components/License/LicenseModal';
import { ArchitectureModal } from './components/Architecture/ArchitectureModal';
import { SHOW_PRO_BADGES, SHOW_LICENSE_UI } from './engine/license/licenseVerifier';

// Lazy-load MediaTools to keep initial bundle small and defer FFmpeg WebAssembly core
const MediaTools = React.lazy(() => import('./components/MediaTools/MediaTools'));

type ActiveTool = 'image' | 'pdf' | 'metadata' | 'data' | 'media' | 'watchfolders';

const activeToolTitles: Record<ActiveTool, string> = {
  image: 'Instant Image Converter',
  pdf: 'PDF Split, Merge & Vector Redaction',
  metadata: 'Metadata Stripper',
  data: 'Data & Hashes',
  media: 'Media Studio & Transcoder',
  watchfolders: 'Automated Watch Folders Pipeline',
};

export const App: React.FC = () => {
  const [activeTool, setActiveTool] = useState<ActiveTool>('image');
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isLicenseOpen, setIsLicenseOpen] = useState(false);
  const [isArchitectureOpen, setIsArchitectureOpen] = useState(false);
  const [isWindowDragging, setIsWindowDragging] = useState(false);

  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('zeroegress-theme');
      return saved ? saved === 'dark' : true; // Default dark mode
    }
    return true;
  });

  useEffect(() => {
    const root = document.documentElement;
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('zeroegress-theme', 'dark');
      if (themeColorMeta) themeColorMeta.setAttribute('content', '#09090b');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('zeroegress-theme', 'light');
      if (themeColorMeta) themeColorMeta.setAttribute('content', '#f8fafc');
    }
  }, [isDark]);

  // Global window drag-and-drop listener to route drops anywhere into the active tool
  useEffect(() => {
    let dragCounter = 0;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
        setIsWindowDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        setIsWindowDragging(false);
        dragCounter = 0;
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter = 0;
      setIsWindowDragging(false);

      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files);
        window.dispatchEvent(new CustomEvent('zeroegress:files-dropped', { detail: files }));
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  const toggleTheme = () => setIsDark((prev) => !prev);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans transition-colors selection:bg-zinc-800 selection:text-zinc-100 relative">
      {/* Global Drag Overlay */}
      {isWindowDragging && (
        <div className="fixed inset-0 z-50 pointer-events-none bg-zinc-950/85 backdrop-blur-md border-2 border-dashed border-zinc-400 flex flex-col items-center justify-center p-8 animate-in fade-in duration-100">
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-100 mb-4 shadow-2xl">
            <UploadCloud className="w-8 h-8 text-zinc-200 animate-pulse" />
          </div>
          <p className="text-lg font-bold tracking-tight text-zinc-100">
            Drop files to open in {activeToolTitles[activeTool]}
          </p>
          <p className="text-xs text-zinc-400 mt-1 font-mono">
            100% Client-Side Processing · Never Uploaded
          </p>
        </div>
      )}

      {/* Top Header */}
      <Header
        isDark={isDark}
        onToggleTheme={toggleTheme}
        onOpenPrivacyInfo={() => setIsPrivacyOpen(true)}
        onOpenLicense={() => setIsLicenseOpen(true)}
        onOpenArchitecture={() => setIsArchitectureOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 space-y-8">
        {/* Tool Switcher Navigation (Linear / Raycast utilitarian tab bar) */}
        <div className="flex items-center justify-center w-full overflow-x-auto py-1">
          <div className="inline-flex flex-nowrap items-center p-1 rounded-xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm gap-1 shadow-lg shrink-0">
            <button
              type="button"
              onClick={() => setActiveTool('image')}
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTool === 'image'
                  ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Image Converter</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTool('pdf')}
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTool === 'pdf'
                  ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>PDF & Vector Redact</span>
              {/* PRO badge temporarily hidden for clean unified free toolset */}
              {SHOW_PRO_BADGES && (
                <span
                  className={`text-[9px] font-mono px-1 py-0.2 rounded transition-colors font-bold ${
                    activeTool === 'pdf'
                      ? 'bg-zinc-300 text-zinc-950'
                      : 'bg-zinc-800 text-zinc-300'
                  }`}
                >
                  PRO
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTool('metadata')}
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTool === 'metadata'
                  ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
              <span>Metadata Stripper</span>
              <span
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors ${
                  activeTool === 'metadata'
                    ? 'bg-zinc-300 text-zinc-950 font-semibold'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                GPS / EXIF
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTool('data')}
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTool === 'data'
                  ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <Code2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-400" />
              <span>Data & Hashes</span>
              <span
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors ${
                  activeTool === 'data'
                    ? 'bg-zinc-300 text-zinc-950 font-semibold'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                JSON / SHA
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTool('media')}
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTool === 'media'
                  ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <Film className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-400" />
              <span>Media Studio</span>
              <span
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors ${
                  activeTool === 'media'
                    ? 'bg-zinc-300 text-zinc-950 font-semibold'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                WASM
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTool('watchfolders')}
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTool === 'watchfolders'
                  ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <FolderSync className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
              <span>Watch Folders</span>
              <span
                className={`text-[9px] font-mono px-1.5 py-0.2 rounded transition-colors font-bold ${
                  activeTool === 'watchfolders'
                    ? 'bg-emerald-950 text-emerald-300'
                    : 'bg-zinc-800 text-emerald-400'
                }`}
              >
                DAEMON
              </span>
            </button>
          </div>
        </div>

        {/* Active Tool View */}
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-6 md:p-8 backdrop-blur-sm shadow-xl">
          {activeTool === 'image' && <ImageConverter />}
          {activeTool === 'pdf' && <PdfTools onOpenLicense={() => setIsLicenseOpen(true)} />}
          {activeTool === 'metadata' && <MetadataScrubber />}
          {activeTool === 'data' && <DataTools />}
          {activeTool === 'watchfolders' && (
            <WatchFolders onOpenLicense={() => setIsLicenseOpen(true)} />
          )}
          {activeTool === 'media' && (
            <React.Suspense
              fallback={
                <div className="py-20 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-zinc-300 animate-spin" />
                  <p className="text-xs font-mono text-zinc-400">
                    Lazy-loading FFmpeg WebAssembly Studio...
                  </p>
                </div>
              }
            >
              <MediaTools />
            </React.Suspense>
          )}
        </div>
      </main>

      {/* Utilitarian Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950/90 py-6 text-xs text-zinc-400 transition-colors">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[11px]">
          <div className="flex items-center gap-2 text-zinc-400">
            <span className="font-semibold text-zinc-300">ZeroEgress</span>
            <span className="text-zinc-600">·</span>
            <span>No telemetry</span>
            <span className="text-zinc-600">·</span>
            <span>No logins</span>
            <span className="text-zinc-600">·</span>
            <span>100% Client-Side Sandbox</span>
          </div>

          <div className="flex items-center gap-4 text-zinc-400">
            <button
              type="button"
              onClick={() => setIsArchitectureOpen(true)}
              className="hover:text-sky-300 transition-colors flex items-center gap-1 cursor-pointer"
              title="View full system architecture & technical blueprint"
            >
              <FileCode2 className="w-3 h-3 text-sky-400" />
              <span>Architecture Blueprint</span>
            </button>
            <span className="text-zinc-700">|</span>
            <button
              type="button"
              onClick={() => setIsPrivacyOpen(true)}
              className="hover:text-emerald-300 transition-colors flex items-center gap-1 cursor-pointer"
              title="View air-gap network audit & memory diagnostics"
            >
              <Shield className="w-3 h-3 text-emerald-400" />
              <span>Air-Gap Diagnostics</span>
            </button>
            {/* Offline Licensing button temporarily hidden for free access */}
            {SHOW_LICENSE_UI && (
              <>
                <span className="text-zinc-700">|</span>
                <button
                  type="button"
                  onClick={() => setIsLicenseOpen(true)}
                  className="hover:text-amber-300 transition-colors flex items-center gap-1 cursor-pointer"
                  title="View offline Ed25519 cryptographic licensing & compliance"
                >
                  <Key className="w-3 h-3 text-amber-400" />
                  <span>Offline Licensing</span>
                </button>
              </>
            )}
          </div>
        </div>
      </footer>

      {/* Modals */}
      <ArchitectureModal
        isOpen={isArchitectureOpen}
        onClose={() => setIsArchitectureOpen(false)}
      />
      <PrivacyInfo isOpen={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)} />
      <LicenseModal
        isOpen={isLicenseOpen}
        onClose={() => setIsLicenseOpen(false)}
        onLicenseChanged={() => {
          window.dispatchEvent(new CustomEvent('zeroegress:license-updated'));
        }}
      />
    </div>
  );
};

export default App;
