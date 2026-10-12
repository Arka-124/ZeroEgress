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
  Archive,
  FileSpreadsheet,
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

// Lazy-load heavier utilities to keep initial bundle small
const MediaTools = React.lazy(() => import('./components/MediaTools/MediaTools'));
const ArchiveTools = React.lazy(() => import('./components/ArchiveTools/ArchiveTools'));
const SpreadsheetConverter = React.lazy(() => import('./components/SpreadsheetConverter/SpreadsheetConverter'));

type ActiveTool = 'image' | 'pdf' | 'metadata' | 'data' | 'media' | 'archives' | 'spreadsheet' | 'watchfolders';

const activeToolTitles: Record<ActiveTool, string> = {
  image: 'Instant Image Converter',
  pdf: 'PDF Split, Merge, Compress & Vector Redaction',
  metadata: 'Metadata Stripper',
  data: 'Data & Hashes',
  media: 'Media Studio & Transcoder',
  archives: 'Universal Archive Suite (ZIP, TAR, GZ)',
  spreadsheet: 'Spreadsheet & Table Converter',
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
    <div className="min-h-screen w-full bg-zinc-950 text-zinc-100 flex flex-col font-sans transition-colors selection:bg-zinc-800 selection:text-zinc-100 relative">
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
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Tool Switcher Navigation (Clean multi-row wrap / 2-col mobile grid) */}
        <nav
          aria-label="Tool Switcher"
          className="w-full grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center sm:justify-center gap-2 sm:gap-2.5 p-1.5 sm:p-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm shadow-lg"
        >
          <button
            type="button"
            onClick={() => setActiveTool('image')}
            className={`flex items-center justify-between sm:justify-start gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer min-h-[42px] sm:min-h-[36px] ${
              activeTool === 'image'
                ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <ImageIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="truncate">Image Converter</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool('pdf')}
            className={`flex items-center justify-between sm:justify-start gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer min-h-[42px] sm:min-h-[36px] ${
              activeTool === 'pdf'
                ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="truncate">PDF & Vector Redact</span>
            </div>
            {/* PRO badge temporarily hidden for clean unified free toolset */}
            {SHOW_PRO_BADGES && (
              <span
                className={`text-[9px] font-mono px-1 py-0.2 rounded transition-colors font-bold shrink-0 ${
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
            className={`flex items-center justify-between sm:justify-start gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer min-h-[42px] sm:min-h-[36px] ${
              activeTool === 'metadata'
                ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <ShieldAlert className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
              <span className="truncate">Metadata Stripper</span>
            </div>
            <span
              className={`hidden min-[420px]:inline text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors shrink-0 ${
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
            className={`flex items-center justify-between sm:justify-start gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer min-h-[42px] sm:min-h-[36px] ${
              activeTool === 'data'
                ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <Code2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-400 shrink-0" />
              <span className="truncate">Data & Hashes</span>
            </div>
            <span
              className={`hidden min-[420px]:inline text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors shrink-0 ${
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
            className={`flex items-center justify-between sm:justify-start gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer min-h-[42px] sm:min-h-[36px] ${
              activeTool === 'media'
                ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <Film className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-400 shrink-0" />
              <span className="truncate">Media Studio</span>
            </div>
            <span
              className={`hidden min-[420px]:inline text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors shrink-0 ${
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
            onClick={() => setActiveTool('archives')}
            className={`flex items-center justify-between sm:justify-start gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer min-h-[42px] sm:min-h-[36px] ${
              activeTool === 'archives'
                ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <Archive className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
              <span className="truncate">Archives</span>
            </div>
            <span
              className={`hidden min-[420px]:inline text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors shrink-0 ${
                activeTool === 'archives'
                  ? 'bg-zinc-300 text-zinc-950 font-semibold'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              ZIP / TAR
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool('spreadsheet')}
            className={`flex items-center justify-between sm:justify-start gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer min-h-[42px] sm:min-h-[36px] ${
              activeTool === 'spreadsheet'
                ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <FileSpreadsheet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
              <span className="truncate">Spreadsheet</span>
            </div>
            <span
              className={`hidden min-[420px]:inline text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors shrink-0 ${
                activeTool === 'spreadsheet'
                  ? 'bg-zinc-300 text-zinc-950 font-semibold'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              XLSX / CSV
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool('watchfolders')}
            className={`flex items-center justify-between sm:justify-start gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer min-h-[42px] sm:min-h-[36px] ${
              activeTool === 'watchfolders'
                ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <FolderSync className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
              <span className="truncate">Watch Folders</span>
            </div>
            <span
              className={`hidden min-[420px]:inline text-[9px] font-mono px-1.5 py-0.2 rounded transition-colors font-bold shrink-0 ${
                activeTool === 'watchfolders'
                  ? 'bg-emerald-950 text-emerald-300'
                  : 'bg-zinc-800 text-emerald-400'
              }`}
            >
              DAEMON
            </span>
          </button>
        </nav>

        {/* Active Tool View */}
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-4 sm:p-6 md:p-8 backdrop-blur-sm shadow-xl w-full">
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
          {activeTool === 'archives' && (
            <React.Suspense
              fallback={
                <div className="py-20 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-amber-400 animate-spin" />
                  <p className="text-xs font-mono text-zinc-400">
                    Loading Universal Archive Suite...
                  </p>
                </div>
              }
            >
              <ArchiveTools />
            </React.Suspense>
          )}
          {activeTool === 'spreadsheet' && (
            <React.Suspense
              fallback={
                <div className="py-20 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-emerald-400 animate-spin" />
                  <p className="text-xs font-mono text-zinc-400">
                    Loading Spreadsheet Converter...
                  </p>
                </div>
              }
            >
              <SpreadsheetConverter />
            </React.Suspense>
          )}
        </div>
      </main>

      {/* Utilitarian Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950/90 py-6 text-xs text-zinc-400 transition-colors">
        <div className="max-w-6xl w-full mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[11px]">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-zinc-400 text-center sm:text-left">
            <span className="font-semibold text-zinc-300">ZeroEgress</span>
            <span className="text-zinc-600">·</span>
            <span>No telemetry</span>
            <span className="text-zinc-600">·</span>
            <span>No logins</span>
            <span className="text-zinc-600">·</span>
            <span>100% Client-Side Sandbox</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-zinc-400">
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
