import React, { useState, useEffect } from 'react';
import {
  Download,
  Trash2,
  RefreshCw,
  Archive,
  ArrowRight,
  Sparkles,
  Maximize2,
} from 'lucide-react';
import { Dropzone } from '../ui/Dropzone';
import { Button } from '../ui/Button';
import { Slider } from '../ui/Slider';
import { Badge } from '../ui/Badge';
import { engine } from '../../engine';
import type { ImageTargetFormat, ImageConvertTask, TaskResultSuccess } from '../../engine/types';
import { formatBytes, downloadBlob, downloadZip } from '../../utils/fileUtils';

interface ImageItem {
  id: string;
  file: File;
  previewUrl: string;
  originalSize: number;
  width?: number;
  height?: number;
  status: 'idle' | 'converting' | 'completed' | 'error';
  progress: number;
  resultBlob?: Blob;
  resultFileName?: string;
  resultSize?: number;
  durationMs?: number;
  errorMessage?: string;
}

export const ImageConverter: React.FC = () => {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [targetFormat, setTargetFormat] = useState<ImageTargetFormat>('image/webp');
  const [quality, setQuality] = useState<number>(85);
  const [enableResize, setEnableResize] = useState<boolean>(false);
  const [resizeWidth, setResizeWidth] = useState<string>('');
  const [resizeHeight, setResizeHeight] = useState<string>('');
  const [isProcessingAll, setIsProcessingAll] = useState<boolean>(false);
  const [supportedFormats, setSupportedFormats] = useState<Record<ImageTargetFormat, boolean>>({
    'image/png': true,
    'image/jpeg': true,
    'image/webp': true,
    'image/avif': true,
  });

  // Probe client browser capabilities on mount
  useEffect(() => {
    async function checkCapabilities() {
      const formats: ImageTargetFormat[] = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];
      const map: Record<string, boolean> = {};
      for (const f of formats) {
        map[f] = await engine.isFormatSupported(f);
      }
      setSupportedFormats(map as Record<ImageTargetFormat, boolean>);
    }
    checkCapabilities();
  }, []);

  // Handle new incoming files
  const handleFilesSelected = (newFiles: File[]) => {
    const validImageFiles = newFiles.filter((f) => f.type.startsWith('image/'));
    if (validImageFiles.length === 0) return;

    const newItems: ImageItem[] = validImageFiles.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      const item: ImageItem = {
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        file,
        previewUrl,
        originalSize: file.size,
        status: 'idle',
        progress: 0,
      };

      // Extract image natural dimensions
      const img = new Image();
      img.onload = () => {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, width: img.naturalWidth, height: img.naturalHeight } : i))
        );
      };
      img.src = previewUrl;

      return item;
    });

    setItems((prev) => [...prev, ...newItems]);
  };

  // Convert a single image
  const convertSingle = async (item: ImageItem) => {
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: 'converting', progress: 10, errorMessage: undefined } : i))
    );

    const task: ImageConvertTask = {
      id: item.id,
      type: 'image-convert',
      file: item.file,
      fileName: item.file.name,
      createdAt: Date.now(),
      options: {
        targetFormat,
        quality: quality / 100,
        resize: enableResize
          ? {
              width: resizeWidth ? parseInt(resizeWidth, 10) : undefined,
              height: resizeHeight ? parseInt(resizeHeight, 10) : undefined,
              maintainAspectRatio: true,
            }
          : undefined,
      },
    };

    const result = await engine.convertImage(task, (ratio) => {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, progress: Math.round(ratio * 100) } : i))
      );
    });

    if (result.success) {
      const successResult = result as TaskResultSuccess<Blob>;
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: 'completed',
                progress: 100,
                resultBlob: successResult.data,
                resultFileName: successResult.outputFileName,
                resultSize: successResult.resultSize,
                durationMs: successResult.durationMs,
              }
            : i
        )
      );
    } else {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: 'error',
                errorMessage: result.error,
              }
            : i
        )
      );
    }
  };

  // Convert all pending or idle images
  const convertAll = async () => {
    setIsProcessingAll(true);
    for (const item of items) {
      if (item.status !== 'completed') {
        await convertSingle(item);
      }
    }
    setIsProcessingAll(false);
  };

  // Download single item
  const handleDownload = (item: ImageItem) => {
    if (item.resultBlob && item.resultFileName) {
      downloadBlob(item.resultBlob, item.resultFileName);
    }
  };

  // Download all completed files as ZIP
  const downloadAllAsZip = async () => {
    const completedItems = items.filter((i) => i.status === 'completed' && i.resultBlob && i.resultFileName);
    if (completedItems.length === 0) return;

    const filesToZip = completedItems.map((i) => ({
      name: i.resultFileName!,
      blob: i.resultBlob!,
    }));

    await downloadZip(filesToZip, `zeroegress_converted_${Date.now()}.zip`);
  };

  // Remove single item
  const removeItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((i) => i.id !== id);
    });
  };

  // Clear all items
  const clearAll = () => {
    items.forEach((i) => {
      if (i.previewUrl) URL.revokeObjectURL(i.previewUrl);
    });
    setItems([]);
  };

  const completedCount = items.filter((i) => i.status === 'completed').length;
  const isLossless = targetFormat === 'image/png';

  const formatOptions: { id: ImageTargetFormat; label: string; desc: string; ext: string }[] = [
    { id: 'image/webp', label: 'WebP', desc: 'Superior web compression', ext: '.webp' },
    { id: 'image/avif', label: 'AVIF', desc: 'Next-gen efficiency', ext: '.avif' },
    { id: 'image/png', label: 'PNG', desc: 'Lossless & transparency', ext: '.png' },
    { id: 'image/jpeg', label: 'JPEG', desc: 'Universal compatibility', ext: '.jpg' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner / Tool Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
            <span>Instant Image Converter</span>
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
              Offscreen Canvas 2D
            </span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Converts PNG, JPG, WebP, AVIF, and SVGs entirely in your browser sandbox without network transfer.
          </p>
        </div>

        {items.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={clearAll}
              icon={<Trash2 className="w-3.5 h-3.5 text-zinc-400" />}
            >
              Clear Queue
            </Button>
            {completedCount > 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={downloadAllAsZip}
                icon={<Archive className="w-3.5 h-3.5" />}
              >
                Download All ({completedCount}) ZIP
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Control Configuration Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 p-4 rounded-xl border border-zinc-800/80 bg-zinc-900/30">
        {/* Target Format Selector */}
        <div className="lg:col-span-5 space-y-2">
          <label className="text-xs font-medium text-zinc-300 block">Target Output Format</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {formatOptions.map((f) => {
              const isSelected = targetFormat === f.id;
              const isSupported = supportedFormats[f.id] ?? true;

              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTargetFormat(f.id)}
                  disabled={!isSupported}
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-zinc-100 text-zinc-950 border-white shadow-sm'
                      : 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900'
                  } ${!isSupported ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs">{f.label}</span>
                    <span
                      className={`text-[10px] font-mono ${
                        isSelected ? 'text-zinc-600' : 'text-zinc-500'
                      }`}
                    >
                      {f.ext}
                    </span>
                  </div>
                  <p
                    className={`text-[10px] mt-1 line-clamp-1 ${
                      isSelected ? 'text-zinc-700' : 'text-zinc-500'
                    }`}
                  >
                    {!isSupported ? 'Unsupported by browser' : f.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quality Slider */}
        <div className="lg:col-span-4 space-y-2 border-zinc-800 lg:border-l lg:pl-5">
          <Slider
            label="Compression Quality"
            value={quality}
            min={1}
            max={100}
            unit="%"
            disabled={isLossless}
            onChange={setQuality}
            presets={[
              { label: 'Max Comp (65%)', value: 65 },
              { label: 'Balanced (85%)', value: 85 },
              { label: 'Lossless/High (98%)', value: 98 },
            ]}
          />
          {isLossless && (
            <p className="text-[11px] text-zinc-500 font-mono italic">
              * PNG format is inherently lossless. Quality slider is bypassed.
            </p>
          )}
        </div>

        {/* Optional Dimensions Resize */}
        <div className="lg:col-span-3 space-y-2 border-zinc-800 lg:border-l lg:pl-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
              <Maximize2 className="w-3.5 h-3.5 text-zinc-400" />
              Resize (Optional)
            </span>
            <input
              type="checkbox"
              id="resize-toggle"
              checked={enableResize}
              onChange={(e) => setEnableResize(e.target.checked)}
              className="accent-zinc-200 cursor-pointer w-3.5 h-3.5"
            />
          </div>

          {enableResize ? (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <input
                  type="number"
                  placeholder="Max Width"
                  value={resizeWidth}
                  onChange={(e) => setResizeWidth(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
                />
              </div>
              <div>
                <input
                  type="number"
                  placeholder="Max Height"
                  value={resizeHeight}
                  onChange={(e) => setResizeHeight(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
                />
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-zinc-500 pt-1">
              Maintains original pixel dimensions without scaling.
            </p>
          )}
        </div>
      </div>

      {/* Drag & Drop Upload Zone */}
      <Dropzone
        onFilesSelected={handleFilesSelected}
        accept="image/*"
        title="Drop image files here to convert"
        subtitle="Supports PNG, JPG, WebP, AVIF, SVG, BMP · Direct Clipboard Paste (Ctrl+V)"
      />

      {/* Queue Action Bar when items exist */}
      {items.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-3 text-xs text-zinc-300">
            <span className="font-semibold text-zinc-100">{items.length} files queued</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">
              Total input size:{' '}
              {formatBytes(items.reduce((acc, curr) => acc + curr.originalSize, 0))}
            </span>
            {completedCount > 0 && (
              <>
                <span className="text-zinc-600">·</span>
                <Badge variant="success" dot size="sm">
                  {completedCount} of {items.length} converted
                </Badge>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="primary"
              size="sm"
              onClick={convertAll}
              loading={isProcessingAll}
              disabled={items.every((i) => i.status === 'completed')}
              icon={<RefreshCw className="w-3.5 h-3.5" />}
              className="flex-1 sm:flex-initial"
            >
              {isProcessingAll ? 'Converting...' : 'Convert All Files'}
            </Button>
          </div>
        </div>
      )}

      {/* Items Queue List */}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => {
            const hasSavings =
              item.resultSize && item.resultSize < item.originalSize;
            const savingsPercent =
              item.resultSize && item.originalSize
                ? Math.round((1 - item.resultSize / item.originalSize) * 100)
                : 0;

            return (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border border-zinc-800/80 bg-zinc-950/60 hover:border-zinc-700/80 transition-colors gap-3"
              >
                {/* Left: Thumbnail & Name */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden shrink-0 flex items-center justify-center">
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs font-medium text-zinc-200 truncate max-w-xs sm:max-w-md">
                      {item.file.name}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-zinc-500 font-mono mt-0.5">
                      <span>{formatBytes(item.originalSize)}</span>
                      {item.width && item.height && (
                        <>
                          <span>·</span>
                          <span>
                            {item.width}×{item.height}px
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Center / Status */}
                <div className="flex items-center gap-4 text-xs">
                  {item.status === 'converting' && (
                    <div className="flex items-center gap-2 text-zinc-400">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-zinc-300" />
                      <span className="font-mono text-[11px]">Converting ({item.progress}%)</span>
                    </div>
                  )}

                  {item.status === 'completed' && item.resultSize && (
                    <div className="flex items-center gap-3 font-mono text-[11px]">
                      <div className="flex items-center gap-1.5 text-zinc-400">
                        <ArrowRight className="w-3 h-3 text-zinc-500" />
                        <span className="text-zinc-200 font-semibold">
                          {formatBytes(item.resultSize)}
                        </span>
                      </div>

                      {hasSavings ? (
                        <Badge variant="success" size="sm">
                          -{savingsPercent}% saved
                        </Badge>
                      ) : (
                        <Badge variant="outline" size="sm">
                          +{Math.abs(savingsPercent)}%
                        </Badge>
                      )}

                      {item.durationMs !== undefined && (
                        <span className="text-zinc-500">{item.durationMs}ms</span>
                      )}
                    </div>
                  )}

                  {item.status === 'error' && (
                    <span className="text-red-400 text-xs">{item.errorMessage || 'Failed'}</span>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.status === 'completed' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDownload(item)}
                        icon={<Download className="w-3.5 h-3.5 text-zinc-200" />}
                      >
                        Download
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={item.status === 'converting'}
                        onClick={() => convertSingle(item)}
                        icon={<Sparkles className="w-3.5 h-3.5 text-zinc-400" />}
                      >
                        Convert
                      </Button>
                    )}

                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 transition-colors cursor-pointer"
                      title="Remove from queue"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
