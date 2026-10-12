import React, { useState, useEffect, useMemo, useRef, useTransition } from 'react';
import {
  Hash,
  Copy,
  Check,
  Download,
  Upload,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  FileCheck2,
  Sparkles,
  ArrowRightLeft,
  Minimize2,
  Maximize2,
  HelpCircle,
} from 'lucide-react';
import { detectFormat } from '../../engine/data/dataConverter.ts';
import { dataWorkerService } from '../../engine/data/dataWorkerService.ts';
import type { DataFormat } from '../../engine/types.ts';
import { formatBytes, downloadBlob } from '../../utils/fileUtils.ts';
import { CodeDisplay } from './syntaxHighlighter.tsx';

type SubTool = 'converter' | 'hasher';
type DelimiterType = ',' | ';' | '\t';

const SAMPLE_DATA = JSON.stringify(
  [
    {
      id: "SAT-01",
      name: "Voyager Deep Space",
      mission: "Interstellar Exploration",
      status: "active",
      distance_au: 161.4,
      air_gapped: true
    },
    {
      id: "SAT-02",
      name: "James Webb Telescope",
      mission: "Infrared Astronomy",
      status: "nominal",
      distance_au: 0.01,
      air_gapped: true
    },
    {
      id: "SAT-03",
      name: "Perseverance Rover",
      mission: "Mars Astrobiology",
      status: "sampling",
      distance_au: 1.52,
      air_gapped: true
    }
  ],
  null,
  2
);

export const DataTools: React.FC = () => {
  const [activeSubTool, setActiveSubTool] = useState<SubTool>('converter');

  // ================= CONVERTER STATE =================
  const [inputContent, setInputContent] = useState<string>(SAMPLE_DATA);
  const [inputFormatSelection, setInputFormatSelection] = useState<'auto' | DataFormat>('auto');
  const [targetFormat, setTargetFormat] = useState<DataFormat>('yaml');
  const [csvDelimiter, setCsvDelimiter] = useState<DelimiterType>(',');
  const [isMinified, setIsMinified] = useState(false);
  const [outputContent, setOutputContent] = useState<string>('');
  const [conversionError, setConversionError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionDurationMs, setConversionDurationMs] = useState<number | null>(null);
  const [copiedOutput, setCopiedOutput] = useState(false);

  // Line scrolling synchronization
  const inputScrollRef = useRef<HTMLTextAreaElement>(null);
  const inputLineGutterRef = useRef<HTMLDivElement>(null);
  const outputScrollRef = useRef<HTMLDivElement>(null);
  const outputLineGutterRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ================= FILE HASHER STATE =================
  const [hashedFile, setHashedFile] = useState<File | null>(null);
  const [hashes, setHashes] = useState<{
    sha256?: string;
    md5?: string;
    sha512?: string;
  }>({});
  const [isHashing, setIsHashing] = useState(false);
  const [expectedChecksum, setExpectedChecksum] = useState('');
  const [copiedHashKey, setCopiedHashKey] = useState<string | null>(null);
  const hasherInputRef = useRef<HTMLInputElement>(null);

  const [, startTransition] = useTransition();

  // 1. Auto-detect format derived from input content
  const detectedFormat: DataFormat = useMemo(() => {
    if (!inputContent.trim()) return 'json';
    return detectFormat(inputContent);
  }, [inputContent]);

  // Active source format (manual or auto)
  const effectiveSourceFormat: DataFormat =
    inputFormatSelection === 'auto' ? detectedFormat : inputFormatSelection;

  // 2. Perform conversion whenever inputs or settings change (with debounce)
  useEffect(() => {
    let isCancelled = false;

    if (!inputContent.trim()) {
      const clearTimer = setTimeout(() => {
        if (!isCancelled) {
          setOutputContent('');
          setConversionError(null);
          setConversionDurationMs(null);
        }
      }, 0);
      return () => {
        isCancelled = true;
        clearTimeout(clearTimer);
      };
    }

    const timer = setTimeout(async () => {
      setIsConverting(true);
      const start = performance.now();

      try {
        const result = await dataWorkerService.convertAsync(
          inputContent,
          effectiveSourceFormat,
          targetFormat,
          {
            delimiter: csvDelimiter,
            minify: isMinified,
            indent: isMinified ? 0 : 2,
          }
        );

        if (!isCancelled) {
          startTransition(() => {
            setOutputContent(result);
            setConversionError(null);
            setConversionDurationMs(Math.round(performance.now() - start));
            setIsConverting(false);
          });
        }
      } catch (err: any) {
        if (!isCancelled) {
          startTransition(() => {
            setConversionError(err?.message || 'Conversion failed. Please verify syntax.');
            setConversionDurationMs(null);
            setIsConverting(false);
          });
        }
      }
    }, 120);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [inputContent, effectiveSourceFormat, targetFormat, csvDelimiter, isMinified]);

  // 3. Compute hashes when a file is selected in Hasher
  const computeFileHashes = async (file: File) => {
    setHashedFile(file);
    setIsHashing(true);
    setHashes({});

    try {
      const buffer = await file.arrayBuffer();

      // Run parallel computations via Web Worker
      const [sha256, md5, sha512] = await Promise.all([
        dataWorkerService.computeHashAsync(buffer, 'SHA-256'),
        dataWorkerService.computeHashAsync(buffer, 'MD5'),
        dataWorkerService.computeHashAsync(buffer, 'SHA-512'),
      ]);

      setHashes({ sha256, md5, sha512 });
    } catch (err: any) {
      console.error('Hashing error:', err);
    } finally {
      setIsHashing(false);
    }
  };

  // 4. Global window drag-and-drop listener integration
  useEffect(() => {
    const handleGlobalDrop = (e: Event) => {
      const customEvent = e as CustomEvent<File[]>;
      const files = customEvent.detail;
      if (!files || files.length === 0) return;

      const file = files[0];
      const ext = file.name.split('.').pop()?.toLowerCase() || '';

      if (activeSubTool === 'hasher' || (!['json', 'csv', 'tsv', 'yaml', 'yml', 'txt'].includes(ext) && file.size > 2 * 1024 * 1024)) {
        setActiveSubTool('hasher');
        computeFileHashes(file);
      } else {
        // Read text into converter
        const reader = new FileReader();
        reader.onload = (event) => {
          const text = event.target?.result as string;
          if (text) {
            setInputContent(text);
          }
        };
        reader.readAsText(file);
      }
    };

    window.addEventListener('zeroegress:files-dropped', handleGlobalDrop as EventListener);
    return () => {
      window.removeEventListener('zeroegress:files-dropped', handleGlobalDrop as EventListener);
    };
  }, [activeSubTool]);

  // Handle local file uploads
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setInputContent(text);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCopyOutput = async () => {
    if (!outputContent) return;
    try {
      await navigator.clipboard.writeText(outputContent);
      setCopiedOutput(true);
      setTimeout(() => setCopiedOutput(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownloadOutput = () => {
    if (!outputContent) return;
    const mimeMap: Record<DataFormat, string> = {
      json: 'application/json',
      csv: 'text/csv',
      yaml: 'text/yaml',
    };
    const extMap: Record<DataFormat, string> = {
      json: 'json',
      csv: 'csv',
      yaml: 'yaml',
    };

    const blob = new Blob([outputContent], { type: mimeMap[targetFormat] });
    downloadBlob(blob, `converted-data.${extMap[targetFormat]}`);
  };

  const handleCopyHash = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedHashKey(key);
      setTimeout(() => setCopiedHashKey(null), 2000);
    } catch {
      // Fallback
    }
  };

  // Line count helpers
  const inputLineCount = Math.max(1, inputContent.split('\n').length);
  const outputLineCount = Math.max(1, (outputContent || '').split('\n').length);

  // Checksum comparison
  const normalizedExpected = expectedChecksum.trim().toLowerCase();
  let checksumMatchAlgorithm: string | null = null;
  if (normalizedExpected) {
    if (hashes.sha256 && hashes.sha256.toLowerCase() === normalizedExpected) {
      checksumMatchAlgorithm = 'SHA-256';
    } else if (hashes.md5 && hashes.md5.toLowerCase() === normalizedExpected) {
      checksumMatchAlgorithm = 'MD5';
    } else if (hashes.sha512 && hashes.sha512.toLowerCase() === normalizedExpected) {
      checksumMatchAlgorithm = 'SHA-512';
    }
  }

  return (
    <div className="space-y-6">
      {/* Sub-navigation pills */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div className="flex flex-col sm:inline-flex sm:flex-row p-1 rounded-lg border border-zinc-800 bg-zinc-900/50 w-full sm:w-auto gap-1">
          <button
            type="button"
            onClick={() => setActiveSubTool('converter')}
            className={`flex items-center justify-between sm:justify-start gap-2 px-3.5 py-2 sm:py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer min-h-[40px] sm:min-h-[36px] w-full sm:w-auto ${
              activeSubTool === 'converter'
                ? 'bg-zinc-200 text-zinc-950 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-3.5 h-3.5 shrink-0" />
              <span>Structured Data Converter</span>
            </div>
            <span className="text-[10px] font-mono px-1 rounded bg-zinc-800 text-zinc-400 shrink-0">
              JSON · CSV · YAML
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTool('hasher')}
            className={`flex items-center justify-between sm:justify-start gap-2 px-3.5 py-2 sm:py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer min-h-[40px] sm:min-h-[36px] w-full sm:w-auto ${
              activeSubTool === 'hasher'
                ? 'bg-zinc-200 text-zinc-950 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <div className="flex items-center gap-2">
              <Hash className="w-3.5 h-3.5 shrink-0" />
              <span>Cryptographic File Hasher</span>
            </div>
            <span className="text-[10px] font-mono px-1 rounded bg-zinc-800 text-zinc-400 shrink-0">
              SHA-256 · MD5
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Web Worker Multi-Threaded</span>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 1. STRUCTURED DATA CONVERTER VIEW */}
      {/* ======================================================== */}
      {activeSubTool === 'converter' && (
        <div className="space-y-4">
          {/* Main Dual-Pane Editor */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* LEFT PANE: INPUT */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 flex flex-col overflow-hidden shadow-sm">
              {/* Left Pane Header */}
              <div className="px-4 py-3 border-b border-zinc-800/80 bg-zinc-900/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400 font-medium">Input:</span>
                  <div className="inline-flex rounded-md border border-zinc-800 bg-zinc-950 p-0.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setInputFormatSelection('auto')}
                      className={`px-2 py-0.5 rounded cursor-pointer transition-colors font-mono ${
                        inputFormatSelection === 'auto'
                          ? 'bg-zinc-800 text-zinc-100 font-semibold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Auto ({detectedFormat.toUpperCase()})
                    </button>
                    {(['json', 'csv', 'yaml'] as DataFormat[]).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setInputFormatSelection(fmt)}
                        className={`px-2 py-0.5 rounded cursor-pointer transition-colors uppercase font-mono ${
                          inputFormatSelection === fmt
                            ? 'bg-zinc-800 text-zinc-100 font-semibold'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>

                  {/* CSV Delimiter if CSV input */}
                  {effectiveSourceFormat === 'csv' && (
                    <div className="flex items-center gap-1 border-l border-zinc-800 pl-2">
                      <span className="text-zinc-500 text-[10px]">Delim:</span>
                      {(
                        [
                          [',', 'Comma'],
                          [';', 'Semicolon'],
                          ['\t', 'Tab'],
                        ] as [DelimiterType, string][]
                      ).map(([del, label]) => (
                        <button
                          key={del}
                          type="button"
                          onClick={() => setCsvDelimiter(del)}
                          className={`px-1.5 py-0.5 text-[10px] rounded font-mono cursor-pointer transition-colors ${
                            csvDelimiter === del
                              ? 'bg-zinc-800 text-zinc-100 font-bold'
                              : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                          title={label}
                        >
                          {del === '\t' ? '\\t' : del}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Left Actions */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setInputContent(SAMPLE_DATA)}
                    className="flex items-center gap-1 px-2 py-1 rounded hover:bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                    title="Load sample dataset"
                  >
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>Sample</span>
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.csv,.tsv,.yaml,.yml,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 px-2 py-1 rounded hover:bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                    title="Upload file"
                  >
                    <Upload className="w-3 h-3" />
                    <span>Load File</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInputContent('')}
                    disabled={!inputContent}
                    className="p-1 rounded hover:bg-zinc-800/80 text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Clear input"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Editor Textarea with Line Numbers */}
              <div className="relative flex-1 min-h-[380px] max-h-[540px] flex font-mono text-xs overflow-hidden bg-zinc-950/40">
                {/* Gutter */}
                <div
                  ref={inputLineGutterRef}
                  className="w-12 py-3 bg-zinc-950/60 select-none text-right pr-3 text-zinc-600 border-r border-zinc-800/50 leading-5 overflow-hidden"
                >
                  {Array.from({ length: inputLineCount }, (_, i) => (
                    <div key={i + 1}>{i + 1}</div>
                  ))}
                </div>

                {/* Textarea */}
                <textarea
                  ref={inputScrollRef}
                  value={inputContent}
                  onChange={(e) => setInputContent(e.target.value)}
                  onScroll={() => {
                    if (inputLineGutterRef.current && inputScrollRef.current) {
                      inputLineGutterRef.current.scrollTop = inputScrollRef.current.scrollTop;
                    }
                  }}
                  placeholder="Paste or drop JSON, CSV, or YAML here..."
                  className="flex-1 p-3 bg-transparent text-zinc-200 leading-5 resize-none outline-none border-none overflow-auto focus:ring-0 whitespace-pre font-mono selection:bg-zinc-800"
                  spellCheck={false}
                />
              </div>

              {/* Input Footer Stats */}
              <div className="px-4 py-2 border-t border-zinc-800/60 bg-zinc-950/30 flex items-center justify-between text-[11px] font-mono text-zinc-400">
                <span>
                  {inputLineCount} lines · {formatBytes(new TextEncoder().encode(inputContent).length)}
                </span>
                <span className="text-zinc-400">Drag & drop files supported</span>
              </div>
            </div>

            {/* RIGHT PANE: CONVERTED OUTPUT */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 flex flex-col overflow-hidden shadow-sm">
              {/* Right Pane Header */}
              <div className="px-4 py-3 border-b border-zinc-800/80 bg-zinc-900/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400 font-medium">Target:</span>
                  <div className="inline-flex rounded-md border border-zinc-800 bg-zinc-950 p-0.5 text-[11px]">
                    {(['yaml', 'json', 'csv'] as DataFormat[]).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setTargetFormat(fmt)}
                        className={`px-2.5 py-0.5 rounded cursor-pointer transition-colors uppercase font-mono ${
                          targetFormat === fmt
                            ? 'bg-zinc-200 text-zinc-950 font-bold'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>

                  {/* Prettify / Minify toggle for JSON */}
                  {targetFormat === 'json' && (
                    <button
                      type="button"
                      onClick={() => setIsMinified((prev) => !prev)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer"
                    >
                      {isMinified ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
                      <span>{isMinified ? 'Minified' : 'Prettified'}</span>
                    </button>
                  )}

                  {/* CSV Target Delimiter */}
                  {targetFormat === 'csv' && (
                    <div className="flex items-center gap-1 border-l border-zinc-800 pl-2">
                      <span className="text-zinc-500 text-[10px]">Delim:</span>
                      {(
                        [
                          [',', 'Comma'],
                          [';', 'Semicolon'],
                          ['\t', 'Tab'],
                        ] as [DelimiterType, string][]
                      ).map(([del, label]) => (
                        <button
                          key={del}
                          type="button"
                          onClick={() => setCsvDelimiter(del)}
                          className={`px-1.5 py-0.5 text-[10px] rounded font-mono cursor-pointer transition-colors ${
                            csvDelimiter === del
                              ? 'bg-zinc-800 text-zinc-100 font-bold'
                              : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                          title={label}
                        >
                          {del === '\t' ? '\\t' : del}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyOutput}
                    disabled={!outputContent || !!conversionError}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all cursor-pointer ${
                      copiedOutput
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed'
                    }`}
                  >
                    {copiedOutput ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedOutput ? 'Copied' : 'Copy'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadOutput}
                    disabled={!outputContent || !!conversionError}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-100 text-zinc-950 font-semibold hover:bg-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              </div>

              {/* Output Preview Area */}
              <div className="relative flex-1 min-h-[380px] max-h-[540px] flex font-mono text-xs overflow-hidden bg-zinc-950/60">
                {conversionError ? (
                  <div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
                    <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-3">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-semibold text-rose-300 mb-1">Syntax / Parsing Error</p>
                    <p className="text-xs text-zinc-400 max-w-md font-mono bg-zinc-900/80 p-3 rounded-lg border border-zinc-800">
                      {conversionError}
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Output Gutter */}
                    <div
                      ref={outputLineGutterRef}
                      className="w-12 py-3 bg-zinc-950/80 select-none text-right pr-3 text-zinc-600 border-r border-zinc-800/50 leading-5 overflow-hidden"
                    >
                      {Array.from({ length: outputLineCount }, (_, i) => (
                        <div key={i + 1}>{i + 1}</div>
                      ))}
                    </div>

                    {/* Syntax Highlighted Code Viewer */}
                    <div
                      ref={outputScrollRef}
                      onScroll={() => {
                        if (outputLineGutterRef.current && outputScrollRef.current) {
                          outputLineGutterRef.current.scrollTop = outputScrollRef.current.scrollTop;
                        }
                      }}
                      className="flex-1 p-3 overflow-auto leading-5"
                    >
                      {outputContent ? (
                        <CodeDisplay code={outputContent} format={targetFormat} />
                      ) : (
                        <span className="text-zinc-600 italic">No output generated yet</span>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Output Footer Stats */}
              <div className="px-4 py-2 border-t border-zinc-800/60 bg-zinc-950/30 flex items-center justify-between text-[11px] font-mono text-zinc-400">
                <span>
                  {outputContent ? `${outputLineCount} lines · ${formatBytes(new TextEncoder().encode(outputContent).length)}` : '0 lines'}
                </span>
                <span className="flex items-center gap-1.5">
                  {isConverting ? (
                    <span className="text-amber-400">Converting...</span>
                  ) : conversionDurationMs !== null ? (
                    <span className="text-emerald-400">Converted in {conversionDurationMs}ms</span>
                  ) : null}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. CRYPTOGRAPHIC FILE HASHER VIEW */}
      {/* ======================================================== */}
      {activeSubTool === 'hasher' && (
        <div className="space-y-6">
          {/* Hasher Dropzone */}
          <div
            onClick={() => hasherInputRef.current?.click()}
            className="group relative rounded-2xl border-2 border-dashed border-zinc-800 hover:border-zinc-700 bg-zinc-900/30 hover:bg-zinc-900/50 transition-all duration-200 p-8 flex flex-col items-center justify-center text-center cursor-pointer"
          >
            <input
              ref={hasherInputRef}
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) computeFileHashes(file);
                e.target.value = '';
              }}
              className="hidden"
            />

            <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-zinc-100 group-hover:scale-105 transition-all shadow-md mb-4">
              <Hash className="w-7 h-7" />
            </div>

            <h3 className="text-base font-semibold text-zinc-100 mb-1">
              {hashedFile ? hashedFile.name : 'Select or drop any file to compute hashes'}
            </h3>
            <p className="text-xs text-zinc-400 max-w-md font-mono">
              {hashedFile
                ? `${formatBytes(hashedFile.size)} · ${hashedFile.type || 'binary/raw'} · 100% In-Browser Cryptography`
                : 'Supports files up to several hundred MBs. Never uploaded to any server.'}
            </p>
          </div>

          {/* Computed Hashes List */}
          {hashedFile && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Computed Cryptographic Digests</span>
                </h4>
                {isHashing && (
                  <span className="text-xs font-mono text-amber-400 animate-pulse">
                    Computing hashes in Web Worker...
                  </span>
                )}
              </div>

              {/* Hash Cards Grid */}
              <div className="grid grid-cols-1 gap-3">
                {/* SHA-256 */}
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold font-mono text-zinc-100">SHA-256</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                        256-bit Secure Hash
                      </span>
                    </div>
                    <div className="font-mono text-xs text-zinc-300 break-all select-all">
                      {isHashing ? (
                        <div className="h-4 w-64 bg-zinc-800 rounded animate-pulse" />
                      ) : (
                        hashes.sha256 || '—'
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!hashes.sha256}
                    onClick={() => handleCopyHash('sha256', hashes.sha256!)}
                    className="self-start md:self-center flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-xs font-mono text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-40"
                  >
                    {copiedHashKey === 'sha256' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                {/* MD5 */}
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold font-mono text-zinc-100">MD5</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                        128-bit RFC 1321 Checksum
                      </span>
                    </div>
                    <div className="font-mono text-xs text-zinc-300 break-all select-all">
                      {isHashing ? (
                        <div className="h-4 w-48 bg-zinc-800 rounded animate-pulse" />
                      ) : (
                        hashes.md5 || '—'
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!hashes.md5}
                    onClick={() => handleCopyHash('md5', hashes.md5!)}
                    className="self-start md:self-center flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-xs font-mono text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-40"
                  >
                    {copiedHashKey === 'md5' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                {/* SHA-512 */}
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold font-mono text-zinc-100">SHA-512</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                        512-bit High Security
                      </span>
                    </div>
                    <div className="font-mono text-xs text-zinc-300 break-all select-all">
                      {isHashing ? (
                        <div className="h-4 w-96 bg-zinc-800 rounded animate-pulse" />
                      ) : (
                        hashes.sha512 || '—'
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!hashes.sha512}
                    onClick={() => handleCopyHash('sha512', hashes.sha512!)}
                    className="self-start md:self-center flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-xs font-mono text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-40"
                  >
                    {copiedHashKey === 'sha512' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Checksum Comparator Card */}
              <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900/30 space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="expected-checksum" className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                    <FileCheck2 className="w-4 h-4 text-sky-400" />
                    <span>Verify Against Expected Checksum</span>
                  </label>
                  {expectedChecksum && (
                    <button
                      type="button"
                      onClick={() => setExpectedChecksum('')}
                      className="text-xs font-mono text-zinc-500 hover:text-zinc-300 cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="relative">
                  <input
                    id="expected-checksum"
                    type="text"
                    value={expectedChecksum}
                    onChange={(e) => setExpectedChecksum(e.target.value)}
                    placeholder="Paste expected SHA-256, SHA-512, or MD5 checksum to verify..."
                    className="w-full px-4 py-2.5 rounded-xl border border-zinc-800 bg-zinc-950 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
                    spellCheck={false}
                  />
                </div>

                {/* Verification Result Feedback */}
                {normalizedExpected && !isHashing && (
                  <div>
                    {checksumMatchAlgorithm ? (
                      <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 flex items-center gap-3 text-emerald-300 animate-in fade-in duration-150">
                        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                        <div className="text-xs">
                          <p className="font-semibold text-emerald-200">
                            Checksum Match Verified ({checksumMatchAlgorithm})
                          </p>
                          <p className="text-emerald-400/80 font-mono text-[11px] mt-0.5">
                            File contents match the expected digest exactly. Integrity confirmed.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-950/20 flex items-center gap-3 text-rose-300 animate-in fade-in duration-150">
                        <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                        <div className="text-xs">
                          <p className="font-semibold text-rose-200">Checksum Mismatch</p>
                          <p className="text-rose-400/80 font-mono text-[11px] mt-0.5">
                            Does not match computed SHA-256, MD5, or SHA-512 hashes.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!normalizedExpected && (
                  <p className="text-[11px] text-zinc-500 font-mono flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-zinc-600" />
                    <span>Case-insensitive comparison. Paste SHA256SUMS or vendor release hashes.</span>
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DataTools;
