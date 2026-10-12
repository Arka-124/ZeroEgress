import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  UploadCloud,
  Download,
  Trash2,
  Archive,
  ArrowRight,
  Sparkles,
  AlertCircle,
  FileText,
  Video,
  Music,
  Image as ImageIcon,
  FileSpreadsheet,
  Compass,
  Type,
  BookOpen,
  File as GenericFileIcon,
  Zap,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { formatBytes, downloadBlob } from '../../utils/fileUtils';
import { urlRegistry } from '../../utils/urlRegistry';
import { zip } from 'fflate';
import {
  getDefaultTargetFormat,
  detectSourceCategory,
  normalizeExtension,
  type FormatCategory,
} from '../../engine/formatRegistry';
import { executeUniversalConversion } from '../../engine/converterRouter';
import { FormatPicker } from './FormatPicker';

interface QueueItem {
  id: string;
  file: File;
  sourceCategory: FormatCategory;
  sourceFormat: string;
  targetFormat: string;
  status: 'idle' | 'converting' | 'completed' | 'error';
  progress: number;
  resultBlob?: Blob;
  resultFileName?: string;
  resultSize?: number;
  durationMs?: number;
  isZip?: boolean;
  errorMessage?: string;
  downloadUrl?: string;
}

const CATEGORY_FILE_ICONS: Record<FormatCategory, React.ReactNode> = {
  Archive: <Archive className="w-5 h-5 text-amber-400" />,
  Audio: <Music className="w-5 h-5 text-cyan-400" />,
  Video: <Video className="w-5 h-5 text-purple-400" />,
  Document: <FileText className="w-5 h-5 text-blue-400" />,
  Image: <ImageIcon className="w-5 h-5 text-emerald-400" />,
  Spreadsheet: <FileSpreadsheet className="w-5 h-5 text-teal-400" />,
  Vector: <Compass className="w-5 h-5 text-rose-400" />,
  Font: <Type className="w-5 h-5 text-sky-400" />,
  Ebook: <BookOpen className="w-5 h-5 text-indigo-400" />,
};

export const UniversalConverter: React.FC = () => {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [isPackagingZip, setIsPackagingZip] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Clean up object URLs on unmount or item removal
  useEffect(() => {
    return () => {
      queue.forEach((item) => {
        if (item.downloadUrl) urlRegistry.revoke(item.downloadUrl);
      });
    };
  }, [queue]);

  // Add files to queue
  const handleAddFiles = useCallback((files: File[]) => {
    if (!files || files.length === 0) return;

    const newItems: QueueItem[] = files.map((file) => {
      const sourceExt = normalizeExtension(file.name).toUpperCase() || 'BIN';
      const sourceCategory = detectSourceCategory(file.name, file.type);
      const targetFormat = getDefaultTargetFormat(file.name, file.type);

      return {
        id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        file,
        sourceCategory,
        sourceFormat: sourceExt,
        targetFormat,
        status: 'idle',
        progress: 0,
      };
    });

    setQueue((prev) => [...prev, ...newItems]);
  }, []);

  // Global window drop listener
  useEffect(() => {
    const handleGlobalDrop = (e: Event) => {
      const customEvent = e as CustomEvent<File[]>;
      const files = customEvent.detail;
      if (files && files.length > 0) {
        handleAddFiles(files);
      }
    };
    window.addEventListener('zeroegress:files-dropped', handleGlobalDrop as EventListener);
    return () => {
      window.removeEventListener('zeroegress:files-dropped', handleGlobalDrop as EventListener);
    };
  }, [handleAddFiles]);

  // Update target format for a specific queue item
  const handleSetTargetFormat = (id: string, format: string) => {
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, targetFormat: format, status: 'idle', resultBlob: undefined } : item))
    );
  };

  // Quick Action: Apply target format of first file to all files sharing the same source category
  const handleApplyToAllMatching = (category: FormatCategory, targetFormat: string) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.sourceCategory === category && item.status !== 'converting'
          ? { ...item, targetFormat, status: 'idle', resultBlob: undefined }
          : item
      )
    );
  };

  // Convert a single item
  const convertItem = async (id: string) => {
    const item = queue.find((i) => i.id === id);
    if (!item || item.status === 'converting') return;

    setQueue((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: 'converting', progress: 5, errorMessage: undefined } : i))
    );

    const startTime = performance.now();

    try {
      const result = await executeUniversalConversion(item.file, item.targetFormat, (ratio) => {
        setQueue((prev) =>
          prev.map((i) => (i.id === id ? { ...i, progress: Math.round(ratio * 100) } : i))
        );
      });

      const durationMs = Math.round(performance.now() - startTime);
      const downloadUrl = urlRegistry.create(result.blob);

      setQueue((prev) =>
        prev.map((i) =>
          i.id === id
            ? {
                ...i,
                status: 'completed',
                progress: 100,
                resultBlob: result.blob,
                resultFileName: result.fileName,
                resultSize: result.blob.size,
                durationMs,
                isZip: result.isZip,
                downloadUrl,
              }
            : i
        )
      );
    } catch (err: any) {
      console.error('Conversion failed for item:', id, err);
      setQueue((prev) =>
        prev.map((i) =>
          i.id === id
            ? {
                ...i,
                status: 'error',
                errorMessage: err?.message || 'Conversion failed',
              }
            : i
        )
      );
    }
  };

  // Convert all idle items
  const handleConvertAll = async () => {
    const idleItems = queue.filter((i) => i.status === 'idle' || i.status === 'error');
    if (idleItems.length === 0) return;

    setIsProcessingAll(true);
    let completedCount = 0;

    for (const item of idleItems) {
      await convertItem(item.id);
      completedCount++;
      setBatchProgress(Math.round((completedCount / idleItems.length) * 100));
    }

    setIsProcessingAll(false);
    setBatchProgress(0);
  };

  // Download all completed results packaged as a single ZIP archive
  const handleDownloadAllAsZip = async () => {
    const completedItems = queue.filter((i) => i.status === 'completed' && i.resultBlob);
    if (completedItems.length === 0) return;

    setIsPackagingZip(true);
    try {
      const zippable: Record<string, Uint8Array> = {};

      for (let idx = 0; idx < completedItems.length; idx++) {
        const item = completedItems[idx];
        const buf = await item.resultBlob!.arrayBuffer();
        let fileName = item.resultFileName || `file_${idx + 1}.${item.targetFormat.toLowerCase()}`;

        // Ensure unique keys in zip
        if (zippable[fileName]) {
          fileName = `${idx + 1}_${fileName}`;
        }
        zippable[fileName] = new Uint8Array(buf);
      }

      const zipBytes = await new Promise<Uint8Array>((resolve, reject) => {
        zip(zippable, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });

      const zipBlob = new Blob([zipBytes as any], { type: 'application/zip' });
      downloadBlob(zipBlob, `zeroegress_converted_batch_${Date.now()}.zip`);
    } catch (err) {
      console.error('Failed to create batch zip:', err);
    } finally {
      setIsPackagingZip(false);
    }
  };

  // Remove a queue item
  const handleRemoveItem = (id: string) => {
    setQueue((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target?.downloadUrl) urlRegistry.revoke(target.downloadUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  // Clear entire queue
  const handleClearAll = () => {
    queue.forEach((i) => {
      if (i.downloadUrl) urlRegistry.revoke(i.downloadUrl);
    });
    setQueue([]);
  };

  const completedCount = queue.filter((i) => i.status === 'completed').length;
  const idleCount = queue.filter((i) => i.status === 'idle' || i.status === 'error').length;
  const firstCategory = queue[0]?.sourceCategory;
  const hasMultipleSameCategory =
    queue.length > 1 && queue.every((i) => i.sourceCategory === firstCategory);

  return (
    <div className="space-y-6 w-full">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400 fill-amber-400" />
            <span>⚡ Universal Converter</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/60 border border-amber-800/80 text-amber-300">
              Inter-Type Cross-Converter
            </span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1 max-w-2xl">
            CloudConvert-grade client-side file transformation. Drag & drop any video, audio, document, image, spreadsheet, vector, or archive to convert bidirectionally with zero server uploads.
          </p>
        </div>

        {queue.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              icon={<Trash2 className="w-4 h-4 text-zinc-400" />}
            >
              Clear Queue
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              icon={<UploadCloud className="w-4 h-4" />}
            >
              Add Files
            </Button>
          </div>
        )}
      </div>

      {/* Universal Dropzone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className={`group relative rounded-2xl border-2 border-dashed border-zinc-800 hover:border-zinc-600 bg-zinc-900/30 hover:bg-zinc-900/50 transition-all duration-200 flex flex-col items-center justify-center text-center cursor-pointer ${
          queue.length === 0 ? 'p-14 min-h-[340px]' : 'p-6 min-h-[140px]'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(e) => {
            if (e.target.files) handleAddFiles(Array.from(e.target.files));
            e.target.value = '';
          }}
          className="hidden"
        />

        <div
          className={`rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-zinc-100 group-hover:scale-105 transition-all shadow-md ${
            queue.length === 0 ? 'w-16 h-16 mb-4' : 'w-10 h-10 mb-2'
          }`}
        >
          <UploadCloud className={queue.length === 0 ? 'w-8 h-8 text-amber-400' : 'w-5 h-5 text-amber-400'} />
        </div>

        <h3 className="text-base font-semibold text-zinc-100 mb-1">
          {queue.length === 0
            ? 'Drop files here to convert (Any Format)'
            : 'Drop additional files to add to queue'}
        </h3>
        <p className="text-xs text-zinc-400 max-w-md font-mono">
          Videos, Audios, PDFs, DOCX, Images, Spreadsheets, Vectors, Fonts, Archives
        </p>
      </div>

      {/* Queue View & Batch Actions */}
      {queue.length > 0 && (
        <div className="space-y-4">
          {/* Batch Operations Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-zinc-400">
              <span className="font-semibold text-zinc-200">{queue.length} files in queue</span>
              <span>·</span>
              <span>{formatBytes(queue.reduce((acc, i) => acc + i.file.size, 0))}</span>
              {completedCount > 0 && (
                <>
                  <span>·</span>
                  <span className="text-emerald-400">{completedCount} converted</span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Quick action: Apply format to all matching */}
              {hasMultipleSameCategory && (
                <button
                  type="button"
                  onClick={() => handleApplyToAllMatching(firstCategory, queue[0].targetFormat)}
                  className="px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-[11px] font-mono text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                  title={`Apply ${queue[0].targetFormat} to all ${firstCategory} files`}
                >
                  Apply <span className="text-amber-400 font-bold uppercase">{queue[0].targetFormat}</span> to all
                </button>
              )}

              {completedCount > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDownloadAllAsZip}
                  loading={isPackagingZip}
                  icon={<Archive className="w-3.5 h-3.5 text-amber-400" />}
                >
                  Download All as ZIP
                </Button>
              )}

              {idleCount > 0 && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleConvertAll}
                  loading={isProcessingAll}
                  icon={<Sparkles className="w-3.5 h-3.5" />}
                >
                  {isProcessingAll ? `Converting (${batchProgress}%)` : `Convert All (${idleCount})`}
                </Button>
              )}
            </div>
          </div>

          {/* Per-File Queue Rows */}
          <div className="space-y-2.5">
            {queue.map((item) => (
              <div
                key={item.id}
                className="p-3.5 sm:p-4 rounded-xl border border-zinc-800/90 bg-zinc-950/70 hover:border-zinc-700/80 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-md"
              >
                {/* File Details */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                    {CATEGORY_FILE_ICONS[item.sourceCategory] || <GenericFileIcon className="w-5 h-5 text-zinc-400" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-100 font-mono truncate max-w-sm">
                        {item.file.name}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 shrink-0 uppercase">
                        {item.sourceFormat}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400 mt-0.5">
                      <span>{formatBytes(item.file.size)}</span>
                      {item.resultSize && (
                        <>
                          <span>→</span>
                          <span className="text-zinc-200">{formatBytes(item.resultSize)}</span>
                        </>
                      )}
                      {item.durationMs && (
                        <span className="text-emerald-400">({item.durationMs}ms)</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Converter Options & Controls */}
                <div className="flex flex-wrap items-center gap-3 self-end md:self-center shrink-0">
                  {/* Two-Pane Cascading Format Picker */}
                  <FormatPicker
                    fileName={item.file.name}
                    mimeType={item.file.type}
                    selectedFormat={item.targetFormat}
                    onSelectFormat={(newFormat) => handleSetTargetFormat(item.id, newFormat)}
                    disabled={item.status === 'converting'}
                  />

                  {/* Status & Progress / Convert / Download Buttons */}
                  {item.status === 'idle' && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => convertItem(item.id)}
                      icon={<ArrowRight className="w-3.5 h-3.5" />}
                    >
                      Convert
                    </Button>
                  )}

                  {item.status === 'converting' && (
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-amber-400 h-full transition-all duration-150"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-zinc-400 shrink-0">
                        {item.progress}%
                      </span>
                    </div>
                  )}

                  {item.status === 'completed' && item.resultBlob && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          const name = item.resultFileName || `${item.file.name.replace(/\.[^/.]+$/, '')}.${item.targetFormat.toLowerCase()}`;
                          downloadBlob(item.resultBlob!, name);
                        }}
                        icon={<Download className="w-3.5 h-3.5" />}
                      >
                        {item.isZip ? 'Download ZIP' : 'Download'}
                      </Button>
                    </div>
                  )}

                  {item.status === 'error' && (
                    <div
                      className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-950/40 border border-red-900/60 text-[11px] font-mono text-red-300"
                      title={item.errorMessage}
                    >
                      <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      <span className="truncate max-w-[120px]">{item.errorMessage || 'Error'}</span>
                    </div>
                  )}

                  {/* Remove Row Button */}
                  <button
                    type="button"
                    disabled={item.status === 'converting'}
                    onClick={() => handleRemoveItem(item.id)}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-900 transition-colors cursor-pointer disabled:opacity-30"
                    title="Remove from queue"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default UniversalConverter;
