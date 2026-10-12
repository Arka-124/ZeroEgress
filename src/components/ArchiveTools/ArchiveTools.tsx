import React, { useState } from 'react';
import {
  Archive,
  FolderArchive,
  FileArchive,
  Download,
  Trash2,
  Search,
  FileCode,
  FileText,
  FileImage,
  File,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  Layers,
} from 'lucide-react';
import { Dropzone } from '../ui/Dropzone';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { formatBytes, downloadBlob } from '../../utils/fileUtils';
import {
  createArchive,
  inspectArchive,
  downloadArchiveEntry,
  downloadAllEntriesAsZip,
  type ArchiveFormat,
  type ArchiveInspectionResult,
} from '../../engine/archives/archiveService';

type ArchiveTab = 'create' | 'extract';

export const ArchiveTools: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ArchiveTab>('create');
  const [errorAlert, setErrorAlert] = useState<string | null>(null);

  // --- CREATE ARCHIVE STATE ---
  const [createFiles, setCreateFiles] = useState<{ id: string; file: File; name: string }[]>([]);
  const [archiveFormat, setArchiveFormat] = useState<ArchiveFormat>('zip');
  const [compressionLevel, setCompressionLevel] = useState<number>(6); // 0..9
  const [outputArchiveName, setOutputArchiveName] = useState('archive.zip');
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveProgress, setArchiveProgress] = useState(0);
  const [createdResult, setCreatedResult] = useState<{
    blob: Blob;
    name: string;
    size: number;
    originalSize: number;
    durationMs: number;
  } | null>(null);

  // --- EXTRACT ARCHIVE STATE ---
  const [extractFile, setExtractFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [inspectionResult, setInspectionResult] = useState<ArchiveInspectionResult | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // ---------------- HANDLERS: CREATE ----------------
  const handleAddFiles = (files: File[]) => {
    setErrorAlert(null);
    const newItems = files.map((f) => ({
      id: `${f.name}-${Date.now()}-${Math.random()}`,
      file: f,
      name: f.name,
    }));
    setCreateFiles((prev) => [...prev, ...newItems]);
    setCreatedResult(null);

    // Auto set archive name if only 1 file or if default
    if (outputArchiveName === 'archive.zip' && files[0]) {
      const baseName = files[0].name.replace(/\.[^/.]+$/, '');
      const ext = archiveFormat === 'zip' ? '.zip' : archiveFormat === 'tar.gz' ? '.tar.gz' : '.tar';
      setOutputArchiveName(`${baseName}_archive${ext}`);
    }
  };

  const handleRemoveFile = (id: string) => {
    setCreateFiles((prev) => prev.filter((item) => item.id !== id));
    setCreatedResult(null);
  };

  const handleFormatChange = (fmt: ArchiveFormat) => {
    setArchiveFormat(fmt);
    const ext = fmt === 'zip' ? '.zip' : fmt === 'tar.gz' ? '.tar.gz' : '.tar';
    const base = outputArchiveName.replace(/(\.zip|\.tar\.gz|\.tar)$/i, '');
    setOutputArchiveName(`${base}${ext}`);
  };

  const handleExecuteCreate = async () => {
    if (createFiles.length === 0) {
      setErrorAlert('Please select at least one file to archive.');
      return;
    }

    setIsArchiving(true);
    setArchiveProgress(0);
    setErrorAlert(null);
    setCreatedResult(null);

    try {
      const totalOriginalSize = createFiles.reduce((acc, f) => acc + f.file.size, 0);
      const res = await createArchive(
        createFiles.map((item) => ({ name: item.name, file: item.file })),
        archiveFormat,
        compressionLevel,
        outputArchiveName,
        (progress) => setArchiveProgress(progress)
      );

      setCreatedResult({
        blob: res.blob,
        name: res.fileName,
        size: res.size,
        originalSize: totalOriginalSize,
        durationMs: res.durationMs,
      });
    } catch (err: any) {
      setErrorAlert(err?.message || 'Failed to generate archive.');
    } finally {
      setIsArchiving(false);
    }
  };

  // ---------------- HANDLERS: EXTRACT ----------------
  const handleInspectArchiveFile = async (files: File[]) => {
    if (files.length === 0) return;
    const file = files[0];
    setExtractFile(file);
    setIsExtracting(true);
    setExtractProgress(0);
    setErrorAlert(null);
    setInspectionResult(null);

    try {
      const result = await inspectArchive(file, (p) => setExtractProgress(p));
      setInspectionResult(result);
    } catch (err: any) {
      setErrorAlert(err?.message || 'Failed to inspect or unpack archive.');
      setExtractFile(null);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleExtractAll = async () => {
    if (!inspectionResult) return;
    try {
      const zipName = inspectionResult.fileName.replace(/(\.zip|\.tar\.gz|\.tar|\.tgz|\.gz)$/i, '') + '_unpacked.zip';
      await downloadAllEntriesAsZip(inspectionResult.entries, zipName);
    } catch (err: any) {
      setErrorAlert(err?.message || 'Failed to bundle extracted files.');
    }
  };

  // File icon helper for inspection
  const getFileIcon = (name: string, isDir: boolean) => {
    if (isDir) return <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />;
    const lower = name.toLowerCase();
    if (lower.match(/\.(png|jpg|jpeg|webp|gif|svg|bmp)$/)) {
      return <FileImage className="w-4 h-4 text-emerald-400 shrink-0" />;
    }
    if (lower.match(/\.(js|ts|tsx|jsx|json|html|css|py|rs|go|c|cpp|yaml|yml)$/)) {
      return <FileCode className="w-4 h-4 text-sky-400 shrink-0" />;
    }
    if (lower.match(/\.(txt|md|log|pdf|doc|docx|csv)$/)) {
      return <FileText className="w-4 h-4 text-indigo-400 shrink-0" />;
    }
    if (lower.match(/\.(zip|tar|gz|tgz|bz2|7z|rar)$/)) {
      return <FileArchive className="w-4 h-4 text-purple-400 shrink-0" />;
    }
    return <File className="w-4 h-4 text-zinc-400 shrink-0" />;
  };

  const filteredEntries = inspectionResult?.entries.filter((e) =>
    e.path.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalInputSize = createFiles.reduce((acc, item) => acc + item.file.size, 0);

  return (
    <div className="space-y-6">
      {/* Top Header & Sub-Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2.5">
            <Archive className="w-6 h-6 text-amber-400" />
            <span>Universal Archive Suite</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 border border-amber-800 text-amber-400 font-semibold">
              fflate Engine
            </span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Ultra-fast ZIP, TAR, and TAR.GZ compression and archive inspection running 100% locally in browser memory.
          </p>
        </div>

        {/* Subtabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-zinc-900 border border-zinc-800 rounded-lg w-full sm:w-auto">
          <button
            type="button"
            onClick={() => {
              setActiveTab('create');
              setErrorAlert(null);
            }}
            className={`flex items-center justify-center gap-2 px-3 py-2 sm:py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer min-h-[38px] flex-1 sm:flex-none ${
              activeTab === 'create'
                ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FolderArchive className="w-3.5 h-3.5" />
            <span>Create Archive</span>
            {createFiles.length > 0 && (
              <span className="text-[10px] px-1 rounded bg-zinc-800 text-zinc-300 font-mono">
                {createFiles.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('extract');
              setErrorAlert(null);
            }}
            className={`flex items-center justify-center gap-2 px-3 py-2 sm:py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer min-h-[38px] flex-1 sm:flex-none ${
              activeTab === 'extract'
                ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Inspect & Extract</span>
            {inspectionResult && (
              <span className="text-[10px] px-1 rounded bg-zinc-800 text-zinc-300 font-mono">
                {inspectionResult.fileCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Error Alert Banner */}
      {errorAlert && (
        <div className="p-4 rounded-xl border border-rose-900/60 bg-rose-950/30 flex items-start justify-between gap-3 text-xs animate-in fade-in duration-150">
          <div className="flex items-start gap-2.5 text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-200">Archive Notice</p>
              <p className="text-rose-300/90 mt-0.5 font-mono text-[11px]">{errorAlert}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setErrorAlert(null)}
            className="text-rose-400 hover:text-rose-200 text-xs font-mono"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ======================= TAB: CREATE ARCHIVE ======================= */}
      {activeTab === 'create' && (
        <div className="space-y-5">
          <Dropzone
            onFilesSelected={handleAddFiles}
            title="Drop files or folders here to package into an archive"
            subtitle="Select multiple files · Instant client-side compression without server upload"
            hint="Zero Egress · Pure Memory Archival"
            multiple={true}
          />

          {createFiles.length > 0 && (
            <div className="space-y-4">
              {/* Files Queue Card */}
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-200">
                      Staged Files for Compression
                    </span>
                    <Badge variant="default" size="sm">
                      {createFiles.length} files ({formatBytes(totalInputSize)})
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCreateFiles([]);
                      setCreatedResult(null);
                    }}
                    className="text-zinc-500 hover:text-rose-400"
                  >
                    Clear All
                  </Button>
                </div>

                {/* File list scroll area */}
                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                  {createFiles.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/80 text-xs"
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        {getFileIcon(item.name, false)}
                        <span className="font-mono text-zinc-300 truncate">{item.name}</span>
                        <span className="text-[11px] font-mono text-zinc-500 shrink-0">
                          {formatBytes(item.file.size)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(item.id)}
                        className="text-zinc-500 hover:text-rose-400 p-1 transition-colors cursor-pointer"
                        title="Remove file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Compression Configuration Card */}
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/30 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Format selector */}
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1.5">
                      Archive Format:
                    </label>
                    <div className="grid grid-cols-3 gap-1.5 p-1 bg-zinc-950 border border-zinc-800 rounded-lg">
                      <button
                        type="button"
                        onClick={() => handleFormatChange('zip')}
                        className={`py-1 text-xs font-mono font-medium rounded transition-all cursor-pointer ${
                          archiveFormat === 'zip'
                            ? 'bg-zinc-200 text-zinc-950 font-bold'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        .ZIP
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFormatChange('tar.gz')}
                        className={`py-1 text-xs font-mono font-medium rounded transition-all cursor-pointer ${
                          archiveFormat === 'tar.gz'
                            ? 'bg-zinc-200 text-zinc-950 font-bold'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        .TAR.GZ
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFormatChange('tar')}
                        className={`py-1 text-xs font-mono font-medium rounded transition-all cursor-pointer ${
                          archiveFormat === 'tar'
                            ? 'bg-zinc-200 text-zinc-950 font-bold'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        .TAR
                      </button>
                    </div>
                  </div>

                  {/* Compression Level */}
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1.5">
                      Compression Level:
                    </label>
                    <select
                      value={compressionLevel}
                      onChange={(e) => setCompressionLevel(Number(e.target.value))}
                      disabled={archiveFormat === 'tar'}
                      className="w-full px-3 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 font-mono focus:outline-none focus:border-zinc-600 disabled:opacity-50"
                    >
                      <option value={0}>Store (0 - No compression, fastest)</option>
                      <option value={1}>Fast (1 - Lowest compression ratio)</option>
                      <option value={6}>Balanced (6 - Recommended)</option>
                      <option value={9}>Maximum (9 - Highest ratio)</option>
                    </select>
                  </div>

                  {/* Output file name */}
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1.5">
                      Output Archive Filename:
                    </label>
                    <input
                      type="text"
                      value={outputArchiveName}
                      onChange={(e) => setOutputArchiveName(e.target.value)}
                      placeholder="archive.zip"
                      className="w-full px-3 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 font-mono focus:outline-none focus:border-zinc-600"
                    />
                  </div>
                </div>

                {/* Action Button & Progress */}
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-zinc-800/60">
                  <div className="text-xs text-zinc-400 font-mono">
                    Output: <span className="text-zinc-200 font-semibold">{archiveFormat.toUpperCase()}</span> ·{' '}
                    Level: <span className="text-zinc-200">{archiveFormat === 'tar' ? 'Uncompressed' : compressionLevel}</span>
                  </div>

                  <Button
                    variant="primary"
                    size="md"
                    onClick={handleExecuteCreate}
                    loading={isArchiving}
                    icon={<Archive className="w-4 h-4 text-amber-400" />}
                  >
                    {isArchiving ? `Packaging Archive (${archiveProgress}%)` : 'Create & Download Archive'}
                  </Button>
                </div>
              </div>

              {/* Created Result Success Card */}
              {createdResult && (
                <div className="p-4 rounded-xl border border-emerald-900/50 bg-emerald-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400 shrink-0">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-emerald-200 flex items-center gap-2">
                        <span>{createdResult.name}</span>
                        <Badge variant="success" size="sm">
                          {formatBytes(createdResult.size)}
                        </Badge>
                      </p>
                      <p className="text-[11px] font-mono text-emerald-400/80 mt-0.5">
                        Compressed from {formatBytes(createdResult.originalSize)} in {createdResult.durationMs}ms
                        {createdResult.originalSize > 0 && (
                          <span>
                            {' '}({Math.max(0, Math.round(((createdResult.originalSize - createdResult.size) / createdResult.originalSize) * 100))}% reduction)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => downloadBlob(createdResult.blob, createdResult.name)}
                    icon={<Download className="w-3.5 h-3.5" />}
                  >
                    Download Archive
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ======================= TAB: INSPECT & EXTRACT ======================= */}
      {activeTab === 'extract' && (
        <div className="space-y-5">
          {!extractFile || !inspectionResult ? (
            isExtracting ? (
              <div className="py-20 flex flex-col items-center justify-center text-center space-y-3 p-8 rounded-xl border border-zinc-800 bg-zinc-950/60">
                <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-amber-400 animate-spin" />
                <p className="text-xs font-mono text-zinc-400">
                  Unpacking archive in browser memory ({extractProgress}%)...
                </p>
              </div>
            ) : (
              <Dropzone
                onFilesSelected={handleInspectArchiveFile}
                accept=".zip,.tar,.gz,.tgz,application/zip,application/gzip,application/x-tar"
                title="Drop ZIP, TAR, or TAR.GZ archive to inspect & unpack"
                subtitle="Explore directory tree and extract individual files directly into browser memory"
                hint="Zero Egress · Client-Side Decompression"
              />
            )
          ) : (
            <div className="space-y-4">
              {/* Archive Overview Header Card */}
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-lg bg-amber-950/40 border border-amber-800/80 flex items-center justify-center text-amber-400 shrink-0">
                    <FolderArchive className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-zinc-100">{inspectionResult.fileName}</span>
                      <Badge variant="warning" size="sm">
                        {inspectionResult.format.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-zinc-400 mt-1">
                      <span>{inspectionResult.fileCount} files</span>
                      <span>·</span>
                      <span>Total Unpacked: {formatBytes(inspectionResult.totalUncompressedSize)}</span>
                      <span>·</span>
                      <span>Archive: {formatBytes(inspectionResult.compressedSize)}</span>
                      {inspectionResult.compressionRatio > 0 && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-400 font-semibold">
                            {inspectionResult.compressionRatio}% savings
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setExtractFile(null);
                      setInspectionResult(null);
                    }}
                  >
                    Change Archive
                  </Button>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleExtractAll}
                    icon={<Download className="w-3.5 h-3.5" />}
                  >
                    Download All Files (.zip)
                  </Button>
                </div>
              </div>

              {/* Contents Explorer */}
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/30 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-zinc-200">
                    Archive Contents ({filteredEntries?.length || 0} entries)
                  </span>

                  {/* Filter search box */}
                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Filter files in archive..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-600 font-mono focus:outline-none focus:border-zinc-600"
                    />
                  </div>
                </div>

                {/* Table / List */}
                <div className="max-h-96 overflow-y-auto border border-zinc-800/80 rounded-lg bg-zinc-950/60 divide-y divide-zinc-800/60">
                  {filteredEntries && filteredEntries.length > 0 ? (
                    filteredEntries.map((entry, idx) => (
                      <div
                        key={`${entry.path}-${idx}`}
                        className="flex items-center justify-between p-2.5 hover:bg-zinc-900/40 transition-colors text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 mr-3">
                          {getFileIcon(entry.name, entry.isDir)}
                          <span
                            className={`font-mono truncate ${
                              entry.isDir ? 'text-amber-300 font-semibold' : 'text-zinc-200'
                            }`}
                            title={entry.path}
                          >
                            {entry.path}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[11px] font-mono text-zinc-500">
                            {entry.isDir ? 'Directory' : formatBytes(entry.size)}
                          </span>

                          {!entry.isDir && (
                            <button
                              type="button"
                              onClick={() => downloadArchiveEntry(entry)}
                              className="px-2 py-1 text-[11px] font-mono rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors flex items-center gap-1 cursor-pointer"
                              title="Extract & download this file"
                            >
                              <Download className="w-3 h-3 text-emerald-400" />
                              <span>Extract</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-xs font-mono text-zinc-500">
                      No matching files found in this archive.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ArchiveTools;
