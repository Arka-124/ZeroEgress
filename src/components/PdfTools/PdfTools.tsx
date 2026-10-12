import React, { useState, useEffect } from 'react';
import {
  FileText,
  Files,
  Scissors,
  ArrowUp,
  ArrowDown,
  Trash2,
  Download,
  Archive,
  FileCheck,
  Layers,
  AlertCircle,
  X,
  Lock,
  Eraser,
  ScanText,
  Sparkles,
  Minimize2,
  RotateCw,
  ShieldCheck,
  Stamp,
} from 'lucide-react';
import { Dropzone } from '../ui/Dropzone';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { PdfCompressor } from './PdfCompressor';
import { PdfRotate } from './PdfRotate';
import { PdfSecurity } from './PdfSecurity';
import { PdfWatermark } from './PdfWatermark';
import { PdfOcr } from './PdfOcr';
import { PdfaArchival } from './PdfaArchival';
import { engine } from '../../engine';
import type { PdfMergeItem, TaskResultSuccess, PdfMetadata } from '../../engine/types';
import { formatBytes, downloadBlob, downloadZip, parsePageRange } from '../../utils/fileUtils';
import { hasEntitlement, SHOW_PRO_BADGES } from '../../engine/license/licenseVerifier.ts';

type PdfToolMode = 'merge' | 'split' | 'compress' | 'rotate' | 'security' | 'watermark' | 'redact' | 'ocr' | 'pdfa';

export interface PdfToolsProps {
  onOpenLicense?: () => void;
  initialTab?: PdfToolMode;
  filterModes?: PdfToolMode[];
}

export const PdfTools: React.FC<PdfToolsProps> = ({ onOpenLicense, initialTab, filterModes }) => {
  const [selectedTab, setSelectedTab] = useState<PdfToolMode | null>(null);
  const activeTab = selectedTab || initialTab || (filterModes && filterModes[0]) || 'merge';
  const setActiveTab = (tab: PdfToolMode) => setSelectedTab(tab);

  const [errorAlert, setErrorAlert] = useState<string | null>(null);
  const [hasVectorLic, setHasVectorLic] = useState(true);
  useEffect(() => {
    hasEntitlement('vector_pdf_redaction').then(setHasVectorLic).catch(() => {});
  }, []);

  // --- MERGE STATE ---
  const [mergeItems, setMergeItems] = useState<PdfMergeItem[]>([]);
  const [mergedOutputName, setMergedOutputName] = useState('merged_document.pdf');
  const [isMerging, setIsMerging] = useState(false);
  const [mergeProgress, setMergeProgress] = useState(0);
  const [mergedResult, setMergedResult] = useState<{
    blob: Blob;
    name: string;
    size: number;
    durationMs: number;
  } | null>(null);

  // --- SPLIT STATE ---
  const [splitFile, setSplitFile] = useState<File | null>(null);
  const [splitMetadata, setSplitMetadata] = useState<PdfMetadata | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [pageRangeInput, setPageRangeInput] = useState('');
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [splitMode, setSplitMode] = useState<'extract' | 'separate-all'>('extract');
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitProgress, setSplitProgress] = useState(0);
  const [splitResult, setSplitResult] = useState<{
    blobOrBlobs: Blob | Blob[];
    name: string;
    size: number;
    durationMs: number;
    mode: 'extract' | 'separate-all';
  } | null>(null);

  // --- VECTOR REDACTION STATE ---
  const [redactFile, setRedactFile] = useState<File | null>(null);
  const [redactTerms, setRedactTerms] = useState('CONFIDENTIAL, SSN, PRIVATE');
  const [redactVectors, setRedactVectors] = useState(true);
  const [drawRedactionBoxes, setDrawRedactionBoxes] = useState(true);
  const [isRedacting, setIsRedacting] = useState(false);
  const [redactProgress, setRedactProgress] = useState(0);
  const [redactedResult, setRedactedResult] = useState<{
    blob: Blob;
    name: string;
    size: number;
    durationMs: number;
  } | null>(null);

  // ===================== REDACT HANDLERS =====================
  const handleRedactFileAdded = (files: File[]) => {
    const pdf = files.find((f) => f.type.includes('pdf') || f.name.endsWith('.pdf'));
    if (!pdf) return;
    setRedactFile(pdf);
    setRedactedResult(null);
    setErrorAlert(null);
  };

  const executeRedact = async () => {
    if (!redactFile) return;
    const terms = redactTerms.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
    if (terms.length === 0) {
      setErrorAlert('Please enter at least one keyword or term to redact.');
      return;
    }

    setIsRedacting(true);
    setRedactProgress(0);
    setErrorAlert(null);

    try {
      const res = await engine.redactPdfVector(
        {
          id: `redact_${Date.now()}`,
          type: 'pdf-redact',
          file: redactFile,
          fileName: redactFile.name,
          createdAt: Date.now(),
          options: {
            searchTerms: terms,
            redactVectors,
            drawRedactionBoxes,
          },
        },
        (progress) => setRedactProgress(Math.round(progress * 100))
      );

      if (res.success) {
        setRedactedResult({
          blob: res.data,
          name: res.outputFileName,
          size: res.resultSize,
          durationMs: res.durationMs,
        });
      } else {
        setErrorAlert(res.error);
      }
    } catch (err: any) {
      setErrorAlert(err?.message || 'Vector redaction failed.');
    } finally {
      setIsRedacting(false);
    }
  };

  const handleDownloadRedacted = () => {
    if (redactedResult) {
      downloadBlob(redactedResult.blob, redactedResult.name);
    }
  };

  // ===================== MERGE HANDLERS =====================
  const handleMergeFilesAdded = async (files: File[]) => {
    const pdfFiles = files.filter((f) => f.type.includes('pdf') || f.name.endsWith('.pdf'));
    if (pdfFiles.length === 0) return;

    for (const file of pdfFiles) {
      const id = `${file.name}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      let pageCount: number | undefined = undefined;
      try {
        const inspection = await engine.inspectPdf({
          id,
          type: 'pdf-inspect',
          file,
          fileName: file.name,
          createdAt: Date.now(),
        });
        if (inspection.success) {
          pageCount = inspection.data.pageCount;
        } else {
          setErrorAlert(`Unable to load "${file.name}": ${inspection.error}`);
          continue;
        }
      } catch (err: any) {
        setErrorAlert(`Unable to load "${file.name}": ${err?.message || 'Unsupported PDF file'}`);
        continue;
      }

      setMergeItems((prev) => [
        ...prev,
        {
          id,
          file,
          name: file.name,
          size: file.size,
          pageCount,
        },
      ]);
    }
  };

  const moveMergeItem = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= mergeItems.length) return;

    const updated = [...mergeItems];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    setMergeItems(updated);
  };

  const removeMergeItem = (id: string) => {
    setMergeItems((prev) => prev.filter((item) => item.id !== id));
  };

  const executeMerge = async () => {
    if (mergeItems.length === 0) return;
    setIsMerging(true);
    setMergeProgress(10);
    setMergedResult(null);
    setErrorAlert(null);

    const task = {
      id: `merge-${Date.now()}`,
      type: 'pdf-merge' as const,
      items: mergeItems,
      outputFileName: mergedOutputName.trim().endsWith('.pdf')
        ? mergedOutputName.trim()
        : `${mergedOutputName.trim()}.pdf`,
      createdAt: Date.now(),
    };

    const result = await engine.mergePdfs(task, (ratio) => {
      setMergeProgress(Math.round(ratio * 100));
    });

    setIsMerging(false);

    if (result.success) {
      const res = result as TaskResultSuccess<Blob>;
      setMergedResult({
        blob: res.data,
        name: res.outputFileName,
        size: res.resultSize,
        durationMs: res.durationMs,
      });
    } else {
      setErrorAlert(`Merge failed: ${result.error}`);
    }
  };

  // ===================== SPLIT HANDLERS =====================
  const handleSplitFileAdded = async (files: File[]) => {
    const pdfFile = files.find((f) => f.type.includes('pdf') || f.name.endsWith('.pdf'));
    if (!pdfFile) return;

    setErrorAlert(null);
    setSplitFile(pdfFile);
    setSplitMetadata(null);
    setSplitResult(null);
    setIsInspecting(true);

    try {
      const inspection = await engine.inspectPdf({
        id: `inspect-${Date.now()}`,
        type: 'pdf-inspect',
        file: pdfFile,
        fileName: pdfFile.name,
        createdAt: Date.now(),
      });

      if (inspection.success) {
        setSplitMetadata(inspection.data);
        // By default select all pages
        const all = Array.from({ length: inspection.data.pageCount }, (_, i) => i + 1);
        setSelectedPages(all);
        setPageRangeInput(`1-${inspection.data.pageCount}`);
      } else {
        setErrorAlert(`Unable to open "${pdfFile.name}": ${inspection.error}`);
        setSplitFile(null);
      }
    } catch (err: any) {
      setErrorAlert(`Unable to open "${pdfFile.name}": ${err?.message || 'Unsupported PDF file'}`);
      setSplitFile(null);
    } finally {
      setIsInspecting(false);
    }
  };

  React.useEffect(() => {
    const handleGlobalDrop = (e: Event) => {
      const files = (e as CustomEvent<File[]>).detail;
      if (files && files.length > 0) {
        if (activeTab === 'merge') {
          handleMergeFilesAdded(files);
        } else {
          handleSplitFileAdded(files);
        }
      }
    };
    window.addEventListener('zeroegress:files-dropped', handleGlobalDrop);
    return () => window.removeEventListener('zeroegress:files-dropped', handleGlobalDrop);
  }, [activeTab]);

  const handleRangeInputChange = (input: string) => {
    setPageRangeInput(input);
    if (splitMetadata) {
      const parsed = parsePageRange(input, splitMetadata.pageCount);
      setSelectedPages(parsed);
    }
  };

  const togglePageChip = (pageNum: number) => {
    if (!splitMetadata) return;
    let nextPages: number[];
    if (selectedPages.includes(pageNum)) {
      nextPages = selectedPages.filter((p) => p !== pageNum);
    } else {
      nextPages = [...selectedPages, pageNum].sort((a, b) => a - b);
    }
    setSelectedPages(nextPages);

    // Format into compact range string
    if (nextPages.length === 0) {
      setPageRangeInput('');
    } else {
      setPageRangeInput(nextPages.join(', '));
    }
  };

  const setPresetPages = (type: 'all' | 'none' | 'odd' | 'even') => {
    if (!splitMetadata) return;
    const total = splitMetadata.pageCount;
    let next: number[] = [];

    if (type === 'all') {
      next = Array.from({ length: total }, (_, i) => i + 1);
      setPageRangeInput(`1-${total}`);
    } else if (type === 'none') {
      next = [];
      setPageRangeInput('');
    } else if (type === 'odd') {
      next = Array.from({ length: total }, (_, i) => i + 1).filter((p) => p % 2 !== 0);
      setPageRangeInput(next.join(', '));
    } else if (type === 'even') {
      next = Array.from({ length: total }, (_, i) => i + 1).filter((p) => p % 2 === 0);
      setPageRangeInput(next.join(', '));
    }
    setSelectedPages(next);
  };

  const executeSplit = async () => {
    if (!splitFile || !splitMetadata) return;
    setIsSplitting(true);
    setSplitProgress(10);
    setSplitResult(null);

    const task = {
      id: `split-${Date.now()}`,
      type: 'pdf-split' as const,
      file: splitFile,
      fileName: splitFile.name,
      pageRanges: pageRangeInput,
      splitMode,
      createdAt: Date.now(),
    };

    const result = await engine.splitPdf(task, (ratio) => {
      setSplitProgress(Math.round(ratio * 100));
    });

    setIsSplitting(false);

    if (result.success) {
      const res = result as TaskResultSuccess<Blob | Blob[]>;
      setSplitResult({
        blobOrBlobs: res.data,
        name: res.outputFileName,
        size: res.resultSize,
        durationMs: res.durationMs,
        mode: splitMode,
      });
    } else {
      setErrorAlert(`Split failed: ${result.error}`);
    }
  };

  const handleDownloadSplit = async () => {
    if (!splitResult) return;
    if (splitResult.mode === 'extract' && splitResult.blobOrBlobs instanceof Blob) {
      downloadBlob(splitResult.blobOrBlobs, splitResult.name);
    } else if (Array.isArray(splitResult.blobOrBlobs)) {
      // Package individual single-page PDFs into a ZIP archive
      const files = splitResult.blobOrBlobs.map((blob, idx) => ({
        name: `page_${selectedPages[idx] || idx + 1}.pdf`,
        blob,
      }));
      await downloadZip(files, `${splitResult.name}.zip`);
    }
  };

  const totalMergePages = mergeItems.reduce((acc, item) => acc + (item.pageCount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Banner / Tool Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
            <span>
              {filterModes?.includes('compress') || filterModes?.includes('rotate')
                ? 'PDF Compress & Rotate'
                : filterModes?.includes('security') || filterModes?.includes('watermark')
                ? 'PDF Security & Watermark'
                : 'PDF Split & Merge'}
            </span>
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
              pdf-lib WebAssembly / JS
            </span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            {filterModes?.includes('compress') || filterModes?.includes('rotate')
              ? 'Compress file sizes and rotate page orientation permanently in your browser.'
              : filterModes?.includes('security') || filterModes?.includes('watermark')
              ? 'Lock with AES-256 passwords and stamp customizable text/logo watermarks.'
              : 'Reorder, merge, split, and extract PDF pages directly in your browser without cloud uploads.'}
          </p>
        </div>

        {/* Tab Switcher - only show if multiple modes are permitted */}
        {(!filterModes || filterModes.length > 1) && (
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg border border-zinc-800 bg-zinc-900/60 w-full sm:w-auto">
            {(!filterModes || filterModes.includes('merge')) && (
              <button
                type="button"
                onClick={() => setActiveTab('merge')}
                className={`flex items-center justify-center gap-2 px-3 py-2 sm:py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer min-h-[38px] flex-1 sm:flex-none ${
                  activeTab === 'merge'
                    ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Files className="w-3.5 h-3.5" />
                <span>Merge PDFs</span>
                {mergeItems.length > 0 && (
                  <span className="text-[10px] px-1 rounded bg-zinc-800 text-zinc-300 font-mono">
                    {mergeItems.length}
                  </span>
                )}
              </button>
            )}

            {(!filterModes || filterModes.includes('split')) && (
              <button
                type="button"
                onClick={() => setActiveTab('split')}
                className={`flex items-center justify-center gap-2 px-3 py-2 sm:py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer min-h-[38px] flex-1 sm:flex-none ${
                  activeTab === 'split'
                    ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>Split & Extract</span>
                {splitFile && (
                  <span className="text-[10px] px-1 rounded bg-zinc-800 text-zinc-300 font-mono">
                    Active
                  </span>
                )}
              </button>
            )}

            {(!filterModes || filterModes.includes('compress')) && (
              <button
                type="button"
                onClick={() => setActiveTab('compress')}
                className={`flex items-center justify-center gap-2 px-3 py-2 sm:py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer min-h-[38px] flex-1 sm:flex-none ${
                  activeTab === 'compress'
                    ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Minimize2 className="w-3.5 h-3.5 text-blue-400" />
                <span>Compress PDF</span>
              </button>
            )}

            {(!filterModes || filterModes.includes('rotate')) && (
              <button
                type="button"
                onClick={() => setActiveTab('rotate')}
                className={`flex items-center justify-center gap-2 px-3 py-2 sm:py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer min-h-[38px] flex-1 sm:flex-none ${
                  activeTab === 'rotate'
                    ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <RotateCw className="w-3.5 h-3.5 text-emerald-400" />
                <span>Rotate</span>
              </button>
            )}

            {(!filterModes || filterModes.includes('watermark')) && (
              <button
                type="button"
                onClick={() => setActiveTab('watermark')}
                className={`flex items-center justify-center gap-2 px-3 py-2 sm:py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer min-h-[38px] flex-1 sm:flex-none ${
                  activeTab === 'watermark'
                    ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Stamp className="w-3.5 h-3.5 text-purple-400" />
                <span>Watermark</span>
              </button>
            )}

            {(!filterModes || filterModes.includes('security')) && (
              <button
                type="button"
                onClick={() => setActiveTab('security')}
                className={`flex items-center justify-center gap-2 px-3 py-2 sm:py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer min-h-[38px] flex-1 sm:flex-none ${
                  activeTab === 'security'
                    ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                <span>Security</span>
              </button>
            )}

            {(!filterModes || filterModes.includes('redact')) && (
              <button
                type="button"
                onClick={() => setActiveTab('redact')}
                className={`flex items-center justify-center gap-2 px-3 py-2 sm:py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer min-h-[38px] flex-1 sm:flex-none ${
                  activeTab === 'redact'
                    ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Eraser className="w-3.5 h-3.5 text-rose-400" />
                <span>Vector Redact</span>
                {SHOW_PRO_BADGES && (
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-zinc-800 text-zinc-300 font-bold">
                    PRO
                  </span>
                )}
              </button>
            )}

            {(!filterModes || filterModes.includes('ocr')) && (
              <button
                type="button"
                onClick={() => setActiveTab('ocr')}
                className={`flex items-center justify-center gap-2 px-3 py-2 sm:py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer min-h-[38px] flex-1 sm:flex-none ${
                  activeTab === 'ocr'
                    ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <ScanText className="w-3.5 h-3.5 text-amber-400" />
                <span>On-Device OCR</span>
                {SHOW_PRO_BADGES && (
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-zinc-800 text-zinc-300 font-bold">
                    PRO
                  </span>
                )}
              </button>
            )}

            {(!filterModes || filterModes.includes('pdfa')) && (
              <button
                type="button"
                onClick={() => setActiveTab('pdfa')}
                className={`flex items-center justify-center gap-2 px-3 py-2 sm:py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer min-h-[38px] flex-1 sm:flex-none ${
                  activeTab === 'pdfa'
                    ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Archive className="w-3.5 h-3.5 text-indigo-400" />
                <span>PDF/A Archival</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* User-facing Error Alert Banner */}
      {errorAlert && (
        <div className="p-4 rounded-xl border border-rose-900/60 bg-rose-950/30 flex items-start justify-between gap-3 text-xs animate-in fade-in duration-150">
          <div className="flex items-start gap-2.5 text-rose-300">
            {errorAlert.toLowerCase().includes('encrypted') || errorAlert.toLowerCase().includes('password') ? (
              <Lock className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold text-rose-200">PDF Document Notice</p>
              <p className="text-rose-300/90 mt-0.5 font-mono text-[11px]">{errorAlert}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setErrorAlert(null)}
            className="p-1 rounded text-rose-400 hover:text-rose-200 hover:bg-rose-900/40 cursor-pointer"
            title="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ======================= MERGE VIEW ======================= */}
      {activeTab === 'merge' && (
        <div className="space-y-5">
          <Dropzone
            onFilesSelected={handleMergeFilesAdded}
            accept=".pdf,application/pdf"
            title="Drop multiple PDF files here to merge"
            subtitle="Click or paste files · Documents will be merged in the specified queue order"
            hint="Zero Uploads · 100% Client-Side"
          />

          {mergeItems.length > 0 && (
            <div className="space-y-4">
              {/* Queue Controls & Output Name */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40">
                <div className="flex items-center gap-2 text-xs text-zinc-300">
                  <span className="font-semibold text-zinc-100">{mergeItems.length} documents</span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-400 font-mono">
                    {formatBytes(mergeItems.reduce((acc, i) => acc + i.size, 0))}
                  </span>
                  {totalMergePages > 0 && (
                    <>
                      <span className="text-zinc-600">·</span>
                      <Badge variant="info" size="sm">
                        {totalMergePages} total pages
                      </Badge>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={mergedOutputName}
                    onChange={(e) => setMergedOutputName(e.target.value)}
                    placeholder="Output filename.pdf"
                    className="px-2.5 py-1 text-xs bg-zinc-950 border border-zinc-800 rounded text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 font-mono w-48"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={executeMerge}
                    loading={isMerging}
                    disabled={mergeItems.length === 0}
                    icon={<Layers className="w-3.5 h-3.5" />}
                  >
                    {isMerging ? `Merging (${mergeProgress}%)` : 'Merge Now'}
                  </Button>
                </div>
              </div>

              {/* Merged Download Result Card */}
              {mergedResult && (
                <div className="p-4 rounded-xl border border-emerald-900/40 bg-emerald-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
                      <FileCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-emerald-300">
                        Merged Successfully ({mergedResult.durationMs}ms)
                      </p>
                      <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                        {mergedResult.name} · {formatBytes(mergedResult.size)}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => downloadBlob(mergedResult.blob, mergedResult.name)}
                    icon={<Download className="w-3.5 h-3.5" />}
                  >
                    Download Merged PDF
                  </Button>
                </div>
              )}

              {/* Draggable / Orderable Items List */}
              <div className="space-y-2">
                {mergeItems.map((item, index) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-zinc-800/80 bg-zinc-950/60 hover:border-zinc-700/80 transition-colors gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-xs text-zinc-500 w-5 text-center shrink-0">
                        {index + 1}.
                      </span>
                      <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-zinc-200 truncate max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl">
                          {item.name}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-zinc-500 font-mono mt-0.5">
                          <span>{formatBytes(item.size)}</span>
                          {item.pageCount !== undefined && (
                            <>
                              <span>·</span>
                              <span className="text-zinc-400 font-medium">
                                {item.pageCount} {item.pageCount === 1 ? 'page' : 'pages'}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Reorder and Delete Controls */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveMergeItem(index, 'up')}
                        disabled={index === 0}
                        className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 disabled:opacity-20 cursor-pointer"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveMergeItem(index, 'down')}
                        disabled={index === mergeItems.length - 1}
                        className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 disabled:opacity-20 cursor-pointer"
                        title="Move Down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <div className="w-px h-3.5 bg-zinc-800 mx-1" />
                      <button
                        type="button"
                        onClick={() => removeMergeItem(item.id)}
                        className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-900 cursor-pointer"
                        title="Remove Document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================= SPLIT VIEW ======================= */}
      {activeTab === 'split' && (
        <div className="space-y-5">
          {!splitFile ? (
            <Dropzone
              onFilesSelected={handleSplitFileAdded}
              multiple={false}
              accept=".pdf,application/pdf"
              title="Drop a PDF file here to split or extract pages"
              subtitle="Parses page numbers and geometry in real-time"
              hint="Pure In-Browser pdf-lib Execution"
            />
          ) : (
            <div className="space-y-5">
              {/* Selected File Card */}
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-200 truncate">{splitFile.name}</p>
                    <div className="flex items-center gap-2 text-[11px] text-zinc-500 font-mono mt-0.5">
                      <span>{formatBytes(splitFile.size)}</span>
                      {splitMetadata && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-400 font-medium">
                            {splitMetadata.pageCount} Total Pages
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSplitFile(null);
                    setSplitMetadata(null);
                    setSplitResult(null);
                  }}
                  icon={<Trash2 className="w-3.5 h-3.5 text-zinc-400" />}
                >
                  Change File
                </Button>
              </div>

              {isInspecting && (
                <div className="p-6 text-center text-xs text-zinc-400 font-mono">
                  Inspecting PDF structure...
                </div>
              )}

              {splitMetadata && (
                <div className="space-y-5">
                  {/* Split Mode Selector */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSplitMode('extract')}
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                        splitMode === 'extract'
                          ? 'bg-zinc-100 text-zinc-950 border-zinc-100 shadow-sm'
                          : 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs">Extract Custom Pages</span>
                        <Badge
                          variant={splitMode === 'extract' ? 'default' : 'outline'}
                          size="sm"
                        >
                          Single PDF
                        </Badge>
                      </div>
                      <p
                        className={`text-[11px] mt-1 ${
                          splitMode === 'extract' ? 'text-zinc-700' : 'text-zinc-500'
                        }`}
                      >
                        Combines selected pages into a single new PDF file.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSplitMode('separate-all')}
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                        splitMode === 'separate-all'
                          ? 'bg-zinc-100 text-zinc-950 border-zinc-100 shadow-sm'
                          : 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs">Split Every Page</span>
                        <Badge
                          variant={splitMode === 'separate-all' ? 'default' : 'outline'}
                          size="sm"
                        >
                          ZIP Archive
                        </Badge>
                      </div>
                      <p
                        className={`text-[11px] mt-1 ${
                          splitMode === 'separate-all' ? 'text-zinc-700' : 'text-zinc-500'
                        }`}
                      >
                        Generates a separate 1-page PDF for each page as a ZIP download.
                      </p>
                    </button>
                  </div>

                  {/* Range Input & Real-Time Controls */}
                  <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/30 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <label className="text-xs font-medium text-zinc-300 block">
                          Page Selection Range
                        </label>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          Specify comma-separated pages or intervals (e.g. 1-3, 5, 8-10)
                        </p>
                      </div>

                      {/* Quick Presets */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPresetPages('all')}
                          className="px-2 py-0.5 text-[11px] font-mono rounded border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                        >
                          All ({splitMetadata.pageCount})
                        </button>
                        <button
                          type="button"
                          onClick={() => setPresetPages('odd')}
                          className="px-2 py-0.5 text-[11px] font-mono rounded border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                        >
                          Odd
                        </button>
                        <button
                          type="button"
                          onClick={() => setPresetPages('even')}
                          className="px-2 py-0.5 text-[11px] font-mono rounded border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                        >
                          Even
                        </button>
                        <button
                          type="button"
                          onClick={() => setPresetPages('none')}
                          className="px-2 py-0.5 text-[11px] font-mono rounded border border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        value={pageRangeInput}
                        onChange={(e) => handleRangeInputChange(e.target.value)}
                        placeholder={`e.g. 1-3, 5 (up to ${splitMetadata.pageCount})`}
                        className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
                      />
                      <Badge variant="info" size="md">
                        {selectedPages.length} of {splitMetadata.pageCount} pages selected
                      </Badge>
                    </div>

                    {/* Interactive Visual Page Grid / Chips */}
                    <div className="pt-2">
                      <span className="text-[11px] font-mono text-zinc-500 block mb-2">
                        Interactive Page Selector (Click to toggle):
                      </span>
                      <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                        {Array.from({ length: splitMetadata.pageCount }, (_, idx) => {
                          const pageNum = idx + 1;
                          const isSelected = selectedPages.includes(pageNum);

                          return (
                            <button
                              key={pageNum}
                              type="button"
                              onClick={() => togglePageChip(pageNum)}
                              className={`px-2 py-1 text-[11px] font-mono rounded border transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-zinc-200 text-zinc-950 border-zinc-300 font-semibold'
                                  : 'bg-zinc-900/60 text-zinc-500 border-zinc-800 hover:text-zinc-300 hover:border-zinc-700'
                              }`}
                            >
                              p.{pageNum}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Split Action Button */}
                  <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40">
                    <span className="text-xs text-zinc-400 font-mono">
                      Extracting {selectedPages.length} pages
                    </span>
                    <Button
                      variant="primary"
                      size="md"
                      onClick={executeSplit}
                      loading={isSplitting}
                      disabled={selectedPages.length === 0}
                      icon={<Scissors className="w-3.5 h-3.5" />}
                    >
                      {isSplitting
                        ? `Processing (${splitProgress}%)`
                        : splitMode === 'extract'
                        ? 'Extract Selected Pages'
                        : 'Split All to ZIP'}
                    </Button>
                  </div>

                  {/* Download Result Card */}
                  {splitResult && (
                    <div className="p-4 rounded-xl border border-emerald-900/40 bg-emerald-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
                          {splitResult.mode === 'extract' ? (
                            <FileCheck className="w-5 h-5" />
                          ) : (
                            <Archive className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-emerald-300">
                            Processed in {splitResult.durationMs}ms
                          </p>
                          <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                            {splitResult.name} · {formatBytes(splitResult.size)}
                          </p>
                        </div>
                      </div>

                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleDownloadSplit}
                        icon={
                          splitResult.mode === 'extract' ? (
                            <Download className="w-3.5 h-3.5" />
                          ) : (
                            <Archive className="w-3.5 h-3.5" />
                          )
                        }
                      >
                        {splitResult.mode === 'extract'
                          ? 'Download Extracted PDF'
                          : 'Download All Pages (ZIP)'}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ======================= COMPRESS VIEW ======================= */}
      {activeTab === 'compress' && <PdfCompressor />}

      {/* ======================= VECTOR REDACT VIEW (PRO) ======================= */}
      {activeTab === 'redact' && (
        <div className="space-y-5">
          {!hasVectorLic && (
            <div className="p-3.5 rounded-xl border border-rose-950/70 bg-rose-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 text-rose-300">
                <Sparkles className="w-4 h-4 text-rose-400 shrink-0" />
                <span>
                  <strong>True Vector Stream Redaction</strong> permanently purges text and operator streams. Requires an offline license key or evaluation key.
                </span>
              </div>
              <button
                type="button"
                onClick={onOpenLicense}
                className="px-3 py-1 rounded-lg bg-rose-500 hover:bg-rose-400 text-zinc-950 font-semibold text-xs transition-colors shrink-0 cursor-pointer"
              >
                Unlock Pro Features
              </button>
            </div>
          )}

          {!redactFile ? (
            <Dropzone
              onFilesSelected={handleRedactFileAdded}
              accept=".pdf,application/pdf"
              title="Drop PDF file to purge confidential content"
              subtitle="Select PDF · Targeted text strings and vector paths will be permanently erased from content streams"
              hint="True Vector Erasure · Zero Uploads"
            />
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-zinc-800 bg-zinc-900/40">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-200">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-100">{redactFile.name}</p>
                    <p className="text-[11px] font-mono text-zinc-400">{formatBytes(redactFile.size)}</p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setRedactFile(null);
                    setRedactedResult(null);
                  }}
                  icon={<X className="w-3.5 h-3.5" />}
                >
                  Change File
                </Button>
              </div>

              {/* Redaction Options Form */}
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/30 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-zinc-200 block mb-1.5">
                    Search Terms / Phrases to Obliterate (Comma-Separated):
                  </label>
                  <input
                    type="text"
                    value={redactTerms}
                    onChange={(e) => setRedactTerms(e.target.value)}
                    placeholder="e.g. Confidential, 123-45-6789, Top Secret, Jane Doe"
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:border-zinc-600 font-mono"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1 font-mono">
                    All matching literal strings, hex sequences, and TJ glyph array operations will be purged from the PDF streams.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-6 pt-1">
                  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={redactVectors}
                      onChange={(e) => setRedactVectors(e.target.checked)}
                      className="rounded border-zinc-700 bg-zinc-900 text-rose-500 focus:ring-0"
                    />
                    <span>Purge Vector Path Operators (drawings/shapes)</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={drawRedactionBoxes}
                      onChange={(e) => setDrawRedactionBoxes(e.target.checked)}
                      className="rounded border-zinc-700 bg-zinc-900 text-rose-500 focus:ring-0"
                    />
                    <span>Draw Solid Blackout Redaction Blocks</span>
                  </label>
                </div>

                <div className="pt-2 flex items-center justify-end">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={executeRedact}
                    loading={isRedacting}
                    icon={<Eraser className="w-3.5 h-3.5 text-rose-400" />}
                  >
                    {isRedacting ? `Purging Streams (${redactProgress}%)` : 'Purge Vector Streams & Sanitize'}
                  </Button>
                </div>
              </div>

              {/* Redacted Result Download Card */}
              {redactedResult && (
                <div className="p-4 rounded-xl border border-emerald-900/40 bg-emerald-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
                      <FileCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-emerald-300">
                        Vector Streams Sanitized Successfully ({redactedResult.durationMs}ms)
                      </p>
                      <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                        {redactedResult.name} · {formatBytes(redactedResult.size)} · 0 Egress
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleDownloadRedacted}
                    icon={<Download className="w-3.5 h-3.5" />}
                  >
                    Download Sanitized PDF
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ======================= ROTATE VIEW ======================= */}
      {activeTab === 'rotate' && <PdfRotate />}

      {/* ======================= WATERMARK VIEW ======================= */}
      {activeTab === 'watermark' && <PdfWatermark />}

      {/* ======================= SECURITY VIEW ======================= */}
      {activeTab === 'security' && <PdfSecurity />}

      {/* ======================= ON-DEVICE OCR VIEW ======================= */}
      {activeTab === 'ocr' && <PdfOcr />}

      {/* ======================= PDF/A ARCHIVAL VIEW ======================= */}
      {activeTab === 'pdfa' && <PdfaArchival />}
    </div>
  );
};

