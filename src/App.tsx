import React, { useState, useEffect } from 'react';
import {
  FileText,
  ImageIcon,
  Film,
  Archive,
  ShieldCheck,
  Shield,
  ShieldAlert,
  UploadCloud,
  Code2,
  Key,
  FileCode2,
  FileSpreadsheet,
  Type,
  BookOpen,
  Camera,
  ScanText,
  Lock,
  Eraser,
  Hash,
  Layers,
  Compass,
} from 'lucide-react';
import { Header } from './components/Header';
import { ImageConverter } from './components/ImageConverter/ImageConverter';
import { PdfTools } from './components/PdfTools/PdfTools';
import { MetadataScrubber } from './components/MetadataScrubber/MetadataScrubber';
import { DataTools } from './components/DataTools/DataTools';
import { PrivacyInfo } from './components/PrivacyInfo';
import { LicenseModal } from './components/License/LicenseModal';
import { ArchitectureModal } from './components/Architecture/ArchitectureModal';
import { SHOW_LICENSE_UI } from './engine/license/licenseVerifier';

// Lazy-load heavier utilities to keep initial bundle small & fast
const MediaTools = React.lazy(() => import('./components/MediaTools/MediaTools'));
const VideoGifFrames = React.lazy(() => import('./components/MediaTools/VideoGifFrames'));
const ArchiveTools = React.lazy(() => import('./components/ArchiveTools/ArchiveTools'));
const SpreadsheetConverter = React.lazy(() => import('./components/SpreadsheetConverter/SpreadsheetConverter'));
const VectorFontTools = React.lazy(() => import('./components/VectorFontTools/VectorFontTools'));
const EbookTools = React.lazy(() => import('./components/EbookTools/EbookTools'));
const CaptureTools = React.lazy(() => import('./components/CaptureTools/CaptureTools'));
const ImageWatermark = React.lazy(() => import('./components/ImageConverter/ImageWatermark'));
const CadRawTools = React.lazy(() => import('./components/CadRawTools/CadRawTools'));
const PdfaArchival = React.lazy(() =>
  import('./components/PdfTools/PdfaArchival').then((m) => ({ default: m.PdfaArchival }))
);
const PdfRedact = React.lazy(() =>
  import('./components/PdfTools/PdfRedact').then((m) => ({ default: m.PdfRedact }))
);
const PdfOcr = React.lazy(() =>
  import('./components/PdfTools/PdfOcr').then((m) => ({ default: m.PdfOcr }))
);
const PdfSecurity = React.lazy(() =>
  import('./components/PdfTools/PdfSecurity').then((m) => ({ default: m.PdfSecurity }))
);
const HashAuditTool = React.lazy(() => import('./components/Privacy/HashAuditTool'));

// 5 Master Categories
export type MasterCategory = 'documents' | 'images' | 'media' | 'data' | 'privacy';

// Sub-tools for each category
export type DocumentsSubTool = 'pdf' | 'pdfa' | 'ebooks' | 'capture';
export type ImagesSubTool = 'converter' | 'watermark' | 'vectorfont' | 'cadraw';
export type MediaSubTool = 'transcoder' | 'gif_frames';
export type DataSubTool = 'archives' | 'spreadsheet' | 'structured';
export type PrivacySubTool = 'ocr' | 'security' | 'redact' | 'metadata' | 'hash_audit';

const categoryTitles: Record<MasterCategory, string> = {
  documents: 'Documents & PDF Studio',
  images: 'Images & Visual Design',
  media: 'Video & Audio Transcoder',
  data: 'Data, Archives & Tables',
  privacy: 'Privacy, Security & Forensics',
};

const LoadingSpinner: React.FC<{ label: string }> = ({ label }) => (
  <div className="py-20 flex flex-col items-center justify-center text-center space-y-3">
    <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-zinc-200 animate-spin" />
    <p className="text-xs font-mono text-zinc-400">{label}</p>
  </div>
);

export const App: React.FC = () => {
  // Navigation State: 5 Master Categories
  const [activeCategory, setActiveCategory] = useState<MasterCategory>('documents');

  // Active sub-tool state for each pillar
  const [docSubTool, setDocSubTool] = useState<DocumentsSubTool>('pdf');
  const [imgSubTool, setImgSubTool] = useState<ImagesSubTool>('converter');
  const [mediaSubTool, setMediaSubTool] = useState<MediaSubTool>('transcoder');
  const [dataSubTool, setDataSubTool] = useState<DataSubTool>('archives');
  const [privacySubTool, setPrivacySubTool] = useState<PrivacySubTool>('ocr');

  // Modals & UI State
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

    // Signal cinematic preloader that App component has hydrated
    window.dispatchEvent(new Event('zeroegress:app-ready'));

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
            Drop files to open in {categoryTitles[activeCategory]}
          </p>
          <p className="text-xs text-zinc-400 mt-1 font-mono">
            100% Client-Side Processing · Zero Network Egress
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
      <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-12 xl:px-16 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Strictly 5 Master Categories Navigation Bar (Single Row, No Clutter) */}
        <nav
          aria-label="Master Categories"
          className="w-full flex items-center justify-between sm:justify-center gap-1.5 sm:gap-2.5 lg:gap-3 p-1.5 sm:p-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm shadow-lg overflow-x-auto sm:overflow-visible no-scrollbar"
        >
          {/* 1. Documents & PDF */}
          <button
            type="button"
            onClick={() => setActiveCategory('documents')}
            className={`flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2 text-xs font-medium rounded-xl transition-all duration-150 cursor-pointer min-h-[42px] sm:min-h-[38px] flex-1 sm:flex-none ${
              activeCategory === 'documents'
                ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <FileText className="w-4 h-4 shrink-0 text-blue-500" />
            <span className="truncate">Documents & PDF</span>
            <span
              className={`hidden md:inline text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors shrink-0 ${
                activeCategory === 'documents'
                  ? 'bg-zinc-300 text-zinc-950 font-semibold'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              PDF / DOCX
            </span>
          </button>

          {/* 2. Images & Design */}
          <button
            type="button"
            onClick={() => setActiveCategory('images')}
            className={`flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2 text-xs font-medium rounded-xl transition-all duration-150 cursor-pointer min-h-[42px] sm:min-h-[38px] flex-1 sm:flex-none ${
              activeCategory === 'images'
                ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <ImageIcon className="w-4 h-4 shrink-0 text-emerald-500" />
            <span className="truncate">Images & Design</span>
            <span
              className={`hidden md:inline text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors shrink-0 ${
                activeCategory === 'images'
                  ? 'bg-zinc-300 text-zinc-950 font-semibold'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              IMG / CAD
            </span>
          </button>

          {/* 3. Video & Audio */}
          <button
            type="button"
            onClick={() => setActiveCategory('media')}
            className={`flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2 text-xs font-medium rounded-xl transition-all duration-150 cursor-pointer min-h-[42px] sm:min-h-[38px] flex-1 sm:flex-none ${
              activeCategory === 'media'
                ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <Film className="w-4 h-4 shrink-0 text-purple-500" />
            <span className="truncate">Video & Audio</span>
            <span
              className={`hidden md:inline text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors shrink-0 ${
                activeCategory === 'media'
                  ? 'bg-zinc-300 text-zinc-950 font-semibold'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              AV / GIF
            </span>
          </button>

          {/* 4. Data & Archives */}
          <button
            type="button"
            onClick={() => setActiveCategory('data')}
            className={`flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2 text-xs font-medium rounded-xl transition-all duration-150 cursor-pointer min-h-[42px] sm:min-h-[38px] flex-1 sm:flex-none ${
              activeCategory === 'data'
                ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <Archive className="w-4 h-4 shrink-0 text-amber-500" />
            <span className="truncate">Data & Archives</span>
            <span
              className={`hidden md:inline text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors shrink-0 ${
                activeCategory === 'data'
                  ? 'bg-zinc-300 text-zinc-950 font-semibold'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              ZIP / XLS
            </span>
          </button>

          {/* 5. Privacy & Security */}
          <button
            type="button"
            onClick={() => setActiveCategory('privacy')}
            className={`flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2 text-xs font-medium rounded-xl transition-all duration-150 cursor-pointer min-h-[42px] sm:min-h-[38px] flex-1 sm:flex-none ${
              activeCategory === 'privacy'
                ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <ShieldCheck className="w-4 h-4 shrink-0 text-teal-400" />
            <span className="truncate">Privacy & Security</span>
            <span
              className={`hidden md:inline text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors shrink-0 ${
                activeCategory === 'privacy'
                  ? 'bg-zinc-300 text-zinc-950 font-semibold'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              OCR / AES
            </span>
          </button>
        </nav>

        {/* Active Workspace View */}
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-4 sm:p-6 md:p-8 backdrop-blur-sm shadow-xl w-full">
          {/* ======================================================== */}
          {/* 1. DOCUMENTS & PDF WORKSPACE */}
          {/* ======================================================== */}
          {activeCategory === 'documents' && (
            <div className="space-y-6">
              {/* Secondary Sub-Tool Pill Bar */}
              <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-zinc-900/80 border border-zinc-800/80 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setDocSubTool('pdf')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    docSubTool === 'pdf'
                      ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>PDF Power Tools</span>
                  <span className="text-[10px] font-mono opacity-70">Split / Merge / Compress</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDocSubTool('pdfa')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    docSubTool === 'pdfa'
                      ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Archive className="w-3.5 h-3.5 text-indigo-400" />
                  <span>PDF/A Archival</span>
                  <span className="text-[10px] font-mono opacity-70">ISO Compliance</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDocSubTool('ebooks')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    docSubTool === 'ebooks'
                      ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5 text-blue-400" />
                  <span>Office & E-Books</span>
                  <span className="text-[10px] font-mono opacity-70">DOCX / EPUB / MD</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDocSubTool('capture')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    docSubTool === 'capture'
                      ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5 text-purple-400" />
                  <span>HTML & Web Capture</span>
                  <span className="text-[10px] font-mono opacity-70">URL to PDF</span>
                </button>
              </div>

              {/* Sub-tool Views */}
              {docSubTool === 'pdf' && <PdfTools onOpenLicense={() => setIsLicenseOpen(true)} />}
              {docSubTool === 'pdfa' && (
                <React.Suspense fallback={<LoadingSpinner label="Loading PDF/A Archival Engine..." />}>
                  <PdfaArchival />
                </React.Suspense>
              )}
              {docSubTool === 'ebooks' && (
                <React.Suspense fallback={<LoadingSpinner label="Loading Office & E-Books Suite..." />}>
                  <EbookTools />
                </React.Suspense>
              )}
              {docSubTool === 'capture' && (
                <React.Suspense fallback={<LoadingSpinner label="Loading Webpage & Capture Studio..." />}>
                  <CaptureTools />
                </React.Suspense>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* 2. IMAGES & DESIGN WORKSPACE */}
          {/* ======================================================== */}
          {activeCategory === 'images' && (
            <div className="space-y-6">
              {/* Secondary Sub-Tool Pill Bar */}
              <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-zinc-900/80 border border-zinc-800/80 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setImgSubTool('converter')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    imgSubTool === 'converter'
                      ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Image Converter</span>
                  <span className="text-[10px] font-mono opacity-70">WebP / PNG / JPG / AVIF</span>
                </button>

                <button
                  type="button"
                  onClick={() => setImgSubTool('watermark')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    imgSubTool === 'watermark'
                      ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Image Watermark</span>
                  <span className="text-[10px] font-mono opacity-70">Text & Logo Stamp</span>
                </button>

                <button
                  type="button"
                  onClick={() => setImgSubTool('vectorfont')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    imgSubTool === 'vectorfont'
                      ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Type className="w-3.5 h-3.5 text-sky-400" />
                  <span>Fonts & Vectors</span>
                  <span className="text-[10px] font-mono opacity-70">WOFF2 / SVG / Potrace</span>
                </button>

                <button
                  type="button"
                  onClick={() => setImgSubTool('cadraw')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    imgSubTool === 'cadraw'
                      ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Compass className="w-3.5 h-3.5 text-amber-400" />
                  <span>CAD & Camera RAW</span>
                  <span className="text-[10px] font-mono opacity-70">DXF / CR2 / DNG</span>
                </button>
              </div>

              {/* Sub-tool Views */}
              {imgSubTool === 'converter' && <ImageConverter />}
              {imgSubTool === 'watermark' && (
                <React.Suspense fallback={<LoadingSpinner label="Loading Image Watermark Studio..." />}>
                  <ImageWatermark />
                </React.Suspense>
              )}
              {imgSubTool === 'vectorfont' && (
                <React.Suspense fallback={<LoadingSpinner label="Loading Fonts & Vectors Studio..." />}>
                  <VectorFontTools />
                </React.Suspense>
              )}
              {imgSubTool === 'cadraw' && (
                <React.Suspense fallback={<LoadingSpinner label="Loading CAD & Camera RAW Studio..." />}>
                  <CadRawTools />
                </React.Suspense>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* 3. VIDEO & AUDIO WORKSPACE */}
          {/* ======================================================== */}
          {activeCategory === 'media' && (
            <div className="space-y-6">
              {/* Secondary Sub-Tool Pill Bar */}
              <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-zinc-900/80 border border-zinc-800/80 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setMediaSubTool('transcoder')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    mediaSubTool === 'transcoder'
                      ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Film className="w-3.5 h-3.5 text-purple-400" />
                  <span>Media Transcoder</span>
                  <span className="text-[10px] font-mono opacity-70">MP4 / MP3 / WAV / WebM</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMediaSubTool('gif_frames')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    mediaSubTool === 'gif_frames'
                      ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5 text-emerald-400" />
                  <span>GIF & Frame Capture</span>
                  <span className="text-[10px] font-mono opacity-70">Video to GIF / Stills</span>
                </button>
              </div>

              {/* Sub-tool Views */}
              {mediaSubTool === 'transcoder' && (
                <React.Suspense fallback={<LoadingSpinner label="Lazy-loading FFmpeg WebAssembly Studio..." />}>
                  <MediaTools />
                </React.Suspense>
              )}
              {mediaSubTool === 'gif_frames' && (
                <React.Suspense fallback={<LoadingSpinner label="Loading Video Frame Studio..." />}>
                  <VideoGifFrames />
                </React.Suspense>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* 4. DATA & ARCHIVES WORKSPACE */}
          {/* ======================================================== */}
          {activeCategory === 'data' && (
            <div className="space-y-6">
              {/* Secondary Sub-Tool Pill Bar */}
              <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-zinc-900/80 border border-zinc-800/80 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setDataSubTool('archives')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    dataSubTool === 'archives'
                      ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Archive className="w-3.5 h-3.5 text-amber-400" />
                  <span>Universal Archives</span>
                  <span className="text-[10px] font-mono opacity-70">ZIP / TAR / GZ</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDataSubTool('spreadsheet')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    dataSubTool === 'spreadsheet'
                      ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Spreadsheets & Tables</span>
                  <span className="text-[10px] font-mono opacity-70">XLSX / CSV / ODS</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDataSubTool('structured')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    dataSubTool === 'structured'
                      ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5 text-sky-400" />
                  <span>Structured Data</span>
                  <span className="text-[10px] font-mono opacity-70">JSON ↔ CSV ↔ YAML</span>
                </button>
              </div>

              {/* Sub-tool Views */}
              {dataSubTool === 'archives' && (
                <React.Suspense fallback={<LoadingSpinner label="Loading Universal Archive Suite..." />}>
                  <ArchiveTools />
                </React.Suspense>
              )}
              {dataSubTool === 'spreadsheet' && (
                <React.Suspense fallback={<LoadingSpinner label="Loading Spreadsheet Converter..." />}>
                  <SpreadsheetConverter />
                </React.Suspense>
              )}
              {dataSubTool === 'structured' && <DataTools />}
            </div>
          )}

          {/* ======================================================== */}
          {/* 5. PRIVACY & SECURITY WORKSPACE */}
          {/* ======================================================== */}
          {activeCategory === 'privacy' && (
            <div className="space-y-6">
              {/* Secondary Sub-Tool Pill Bar */}
              <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-zinc-900/80 border border-zinc-800/80 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setPrivacySubTool('ocr')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    privacySubTool === 'ocr'
                      ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <ScanText className="w-3.5 h-3.5 text-emerald-400" />
                  <span>On-Device OCR</span>
                  <span className="text-[10px] font-mono opacity-70">Text Recognition</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPrivacySubTool('security')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    privacySubTool === 'security'
                      ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>PDF Security</span>
                  <span className="text-[10px] font-mono opacity-70">AES-256 Encryption</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPrivacySubTool('redact')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    privacySubTool === 'redact'
                      ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Eraser className="w-3.5 h-3.5 text-rose-400" />
                  <span>Destructive Redact</span>
                  <span className="text-[10px] font-mono opacity-70">Vector Purge</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPrivacySubTool('metadata')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    privacySubTool === 'metadata'
                      ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-teal-400" />
                  <span>Metadata Stripper</span>
                  <span className="text-[10px] font-mono opacity-70">EXIF & GPS Scrubber</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPrivacySubTool('hash_audit')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    privacySubTool === 'hash_audit'
                      ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Hash className="w-3.5 h-3.5 text-sky-400" />
                  <span>Hashes & Audit</span>
                  <span className="text-[10px] font-mono opacity-70">Chain of Custody</span>
                </button>
              </div>

              {/* Sub-tool Views */}
              {privacySubTool === 'ocr' && (
                <React.Suspense fallback={<LoadingSpinner label="Loading On-Device OCR Worker..." />}>
                  <PdfOcr />
                </React.Suspense>
              )}
              {privacySubTool === 'security' && (
                <React.Suspense fallback={<LoadingSpinner label="Loading PDF Cryptography Engine..." />}>
                  <PdfSecurity />
                </React.Suspense>
              )}
              {privacySubTool === 'redact' && (
                <React.Suspense fallback={<LoadingSpinner label="Loading Vector Redaction Engine..." />}>
                  <PdfRedact />
                </React.Suspense>
              )}
              {privacySubTool === 'metadata' && <MetadataScrubber />}
              {privacySubTool === 'hash_audit' && (
                <React.Suspense fallback={<LoadingSpinner label="Loading Hash & Audit Engine..." />}>
                  <HashAuditTool />
                </React.Suspense>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Utilitarian Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950/90 py-6 text-xs text-zinc-400 transition-colors">
        <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-12 xl:px-16 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[11px]">
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
