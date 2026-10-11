import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  MapPin,
  Camera,
  Calendar,
  Cpu,
  Download,
  Trash2,
  RefreshCw,
  Archive,
  Copy,
  Check,
  CheckCircle2,
  Sparkles,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { Dropzone } from '../ui/Dropzone';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { engine } from '../../engine';
import type {
  MetadataInspectTask,
  MetadataInspectionReport,
  MetadataStripTask,
  TaskResultSuccess,
} from '../../engine/types';
import { formatBytes, downloadBlob, downloadZip } from '../../utils/fileUtils';
import { urlRegistry } from '../../utils/urlRegistry';

interface ScrubberItem {
  id: string;
  file: File;
  previewUrl?: string;
  report?: MetadataInspectionReport;
  isInspecting: boolean;
  status: 'idle' | 'stripping' | 'clean' | 'error';
  cleanBlob?: Blob;
  cleanFileName?: string;
  cleanSize?: number;
  durationMs?: number;
  errorMessage?: string;
}

export const MetadataScrubber: React.FC = () => {
  const [items, setItems] = useState<ScrubberItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isScrubbingAll, setIsScrubbingAll] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [copiedGps, setCopiedGps] = useState(false);

  // Revoke object URLs on component unmount
  useEffect(() => {
    return () => {
      items.forEach((i) => {
        if (i.previewUrl) urlRegistry.revoke(i.previewUrl);
      });
    };
  }, [items]);

  const handleFilesAdded = useCallback(async (newFiles: File[]) => {
    if (newFiles.length === 0) return;

    const createdItems: ScrubberItem[] = newFiles.map((file) => {
      const isImg = file.type.startsWith('image/');
      const previewUrl = isImg ? urlRegistry.create(file) : undefined;
      return {
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        file,
        previewUrl,
        isInspecting: true,
        status: 'idle',
      };
    });

    setItems((prev) => [...prev, ...createdItems]);
    setSelectedItemId((prev) => prev || (createdItems.length > 0 ? createdItems[0].id : null));

    // Inspect each file in parallel
    for (const item of createdItems) {
      const task: MetadataInspectTask = {
        id: `inspect-${item.id}`,
        type: 'metadata-inspect',
        file: item.file,
        fileName: item.file.name,
        createdAt: Date.now(),
      };

      const result = await engine.inspectMetadata(task);
      if (result.success) {
        const report = (result as TaskResultSuccess<MetadataInspectionReport>).data;
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, report, isInspecting: false } : i))
        );
      } else {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  isInspecting: false,
                  errorMessage: result.error,
                }
              : i
          )
        );
      }
    }
  }, []);

  useEffect(() => {
    const handleGlobalDrop = (e: Event) => {
      const files = (e as CustomEvent<File[]>).detail;
      if (files && files.length > 0) {
        handleFilesAdded(files);
      }
    };
    window.addEventListener('zeroegress:files-dropped', handleGlobalDrop);
    return () => window.removeEventListener('zeroegress:files-dropped', handleGlobalDrop);
  }, [handleFilesAdded]);


  const stripSingle = async (item: ScrubberItem) => {
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: 'stripping', errorMessage: undefined } : i))
    );

    const task: MetadataStripTask = {
      id: `strip-${item.id}`,
      type: 'metadata-strip',
      file: item.file,
      fileName: item.file.name,
      createdAt: Date.now(),
    };

    const result = await engine.stripMetadata(task);

    if (result.success) {
      const res = result as TaskResultSuccess<Blob>;
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: 'clean',
                cleanBlob: res.data,
                cleanFileName: res.outputFileName,
                cleanSize: res.resultSize,
                durationMs: res.durationMs,
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

  const stripAll = async () => {
    const pending = items.filter((i) => i.status !== 'clean');
    if (pending.length === 0) return;

    setIsScrubbingAll(true);
    setBatchProgress(0);

    for (let idx = 0; idx < pending.length; idx++) {
      const item = pending[idx];
      await stripSingle(item);
      setBatchProgress(Math.round(((idx + 1) / pending.length) * 100));
    }

    setIsScrubbingAll(false);

    // If more than one file was scrubbed, trigger single consolidated ZIP download
    const cleanItems = items.filter((i) => i.cleanBlob && i.cleanFileName);
    if (cleanItems.length > 1) {
      const filesToZip = cleanItems.map((i) => ({
        name: i.cleanFileName!,
        blob: i.cleanBlob!,
      }));
      await downloadZip(filesToZip, `zeroegress_scrubbed_${Date.now()}.zip`);
    }
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target?.previewUrl) urlRegistry.revoke(target.previewUrl);
      const remaining = prev.filter((i) => i.id !== id);
      if (selectedItemId === id) {
        setSelectedItemId(remaining.length > 0 ? remaining[0].id : null);
      }
      return remaining;
    });
  };

  const clearAll = () => {
    items.forEach((i) => {
      if (i.previewUrl) urlRegistry.revoke(i.previewUrl);
    });
    setItems([]);
    setSelectedItemId(null);
  };

  const handleCopyGps = (coordsStr: string) => {
    navigator.clipboard.writeText(coordsStr);
    setCopiedGps(true);
    setTimeout(() => setCopiedGps(false), 2000);
  };

  const downloadCleanSingle = (item: ScrubberItem) => {
    if (item.cleanBlob && item.cleanFileName) {
      downloadBlob(item.cleanBlob, item.cleanFileName);
    }
  };

  const downloadAllCleanAsZip = async () => {
    const cleanItems = items.filter((i) => i.cleanBlob && i.cleanFileName);
    if (cleanItems.length === 0) return;

    const filesToZip = cleanItems.map((i) => ({
      name: i.cleanFileName!,
      blob: i.cleanBlob!,
    }));
    await downloadZip(filesToZip, `zeroegress_scrubbed_${Date.now()}.zip`);
  };

  const selectedItem = items.find((i) => i.id === selectedItemId) || items[0];
  const cleanCount = items.filter((i) => i.status === 'clean').length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
            <span>Deep EXIF & Metadata Stripper</span>
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-emerald-400">
              Lossless Binary Rewriter
            </span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Detects and scrubs embedded GPS coordinates, camera models, software traces, and timestamps from JPEG, PNG, WebP, and PDFs without transcoding quality loss.
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
              Clear All
            </Button>
            {cleanCount > 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={downloadAllCleanAsZip}
                icon={<Archive className="w-3.5 h-3.5" />}
              >
                Download Clean ({cleanCount}) ZIP
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Dropzone */}
      <Dropzone
        onFilesSelected={handleFilesAdded}
        accept="image/*,.pdf,application/pdf"
        title="Drop photos or documents to audit and strip metadata"
        subtitle="Supports JPEG, PNG, WebP, and PDF · Clipboard Paste (Ctrl+V)"
        hint="Detects Hidden GPS, Camera Models, Timestamps & XMP"
      />

      {items.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: File Queue List */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg border border-zinc-800 bg-zinc-900/40">
              <span className="text-xs font-medium text-zinc-300">
                {items.length} {items.length === 1 ? 'file queued' : 'files queued'}
              </span>
              <Button
                variant="primary"
                size="sm"
                onClick={stripAll}
                loading={isScrubbingAll}
                disabled={items.every((i) => i.status === 'clean')}
                icon={<Sparkles className="w-3.5 h-3.5" />}
              >
                {isScrubbingAll ? `Scrubbing (${batchProgress}%)` : 'Scrub All Files'}
              </Button>
            </div>

            {/* List */}
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {items.map((item) => {
                const isSelected = item.id === selectedItemId;
                const hasGps = !!item.report?.gps;
                const tagCount = item.report?.totalTagsFound || 0;

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'border-zinc-500 bg-zinc-900 shadow-sm'
                        : 'border-zinc-800/80 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-900/40'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden shrink-0 flex items-center justify-center">
                        {item.previewUrl ? (
                          <img
                            src={item.previewUrl}
                            alt={item.file.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <FileText className="w-5 h-5 text-zinc-400" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-200 truncate">
                          {item.file.name}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500 mt-0.5">
                          <span>{formatBytes(item.file.size)}</span>
                          {item.isInspecting ? (
                            <span className="text-zinc-400">Auditing...</span>
                          ) : hasGps ? (
                            <span className="text-rose-400 flex items-center gap-1 font-semibold">
                              <MapPin className="w-3 h-3" /> GPS Detected
                            </span>
                          ) : tagCount > 0 ? (
                            <span className="text-amber-400">{tagCount} tags</span>
                          ) : (
                            <span className="text-emerald-400">Clean</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.status === 'clean' ? (
                        <Badge variant="success" size="sm">
                          Scrubbed
                        </Badge>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            stripSingle(item);
                          }}
                          className="px-2 py-1 text-[11px] font-medium rounded border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 cursor-pointer"
                        >
                          Scrub
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeItem(item.id);
                        }}
                        className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Detailed Audit & Scrub Inspector */}
          <div className="lg:col-span-7">
            {selectedItem && (
              <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900/30 space-y-5">
                {/* File Header */}
                <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden shrink-0 flex items-center justify-center">
                      {selectedItem.previewUrl ? (
                        <img
                          src={selectedItem.previewUrl}
                          alt={selectedItem.file.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <FileText className="w-6 h-6 text-zinc-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-zinc-100 truncate">
                        {selectedItem.file.name}
                      </h4>
                      <p className="text-xs text-zinc-400 font-mono mt-0.5">
                        {formatBytes(selectedItem.file.size)} · {selectedItem.file.type || 'Binary Document'}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {selectedItem.status === 'clean' ? (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => downloadCleanSingle(selectedItem)}
                        icon={<Download className="w-3.5 h-3.5" />}
                      >
                        Download Clean
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => stripSingle(selectedItem)}
                        loading={selectedItem.status === 'stripping'}
                        icon={<ShieldCheck className="w-3.5 h-3.5" />}
                      >
                        Strip & Export Clean File
                      </Button>
                    )}
                  </div>
                </div>

                {/* Audit Body */}
                {selectedItem.isInspecting ? (
                  <div className="py-12 text-center text-xs text-zinc-400 font-mono space-y-2">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-zinc-500" />
                    <p>Performing deep binary header audit...</p>
                  </div>
                ) : !selectedItem.report || selectedItem.report.tags.length === 0 ? (
                  /* ZERO METADATA STATE */
                  <div className="p-8 rounded-xl border border-emerald-900/40 bg-emerald-950/20 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-950 border border-emerald-800/80 mx-auto flex items-center justify-center text-emerald-400">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <h5 className="text-sm font-semibold text-emerald-300">
                        Zero Sensitive Metadata Detected
                      </h5>
                      <p className="text-xs text-zinc-400 max-w-md mx-auto mt-1">
                        This file is already clean. No GPS coordinates, camera serial numbers, software markers, or timestamps were found.
                      </p>
                    </div>
                  </div>
                ) : (
                  /* SENSITIVE METADATA AUDIT CARDS */
                  <div className="space-y-4">
                    {/* Warning Summary Banner */}
                    <div className="p-3.5 rounded-xl border border-rose-900/50 bg-rose-950/20 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5 text-rose-300">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>
                          <strong className="font-semibold">{selectedItem.report.totalTagsFound} Sensitive Tags Found</strong> in binary stream.
                        </span>
                      </div>
                      <Badge variant="warning" size="sm">
                        Privacy Risk
                      </Badge>
                    </div>

                    {/* GPS Coordinates Highlight */}
                    {selectedItem.report.gps && (
                      <div className="p-4 rounded-xl border border-rose-900/40 bg-rose-950/10 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-rose-300 flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-rose-400" />
                            GPS Location Coordinates
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyGps(
                                `${selectedItem.report?.gps?.latitude}, ${selectedItem.report?.gps?.longitude}`
                              )
                            }
                            className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 hover:text-zinc-200 cursor-pointer"
                          >
                            {copiedGps ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedGps ? 'Copied' : 'Copy Lat/Lon'}</span>
                          </button>
                        </div>

                        <div className="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800 font-mono text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <span className="text-zinc-200">
                            {selectedItem.report.gps.latitude}, {selectedItem.report.gps.longitude}
                          </span>
                          {selectedItem.report.gps.formattedDMS && (
                            <span className="text-[11px] text-zinc-500">
                              {selectedItem.report.gps.formattedDMS}
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-zinc-500">
                          * Exposes exact physical coordinates where this media was captured. Stripping will permanently purge this block.
                        </p>
                      </div>
                    )}

                    {/* Camera & Hardware Details */}
                    {selectedItem.report.camera && (
                      <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-950/60 space-y-2 text-xs">
                        <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                          <Camera className="w-3.5 h-3.5 text-sky-400" />
                          Camera & Hardware Signature
                        </span>
                        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                          {selectedItem.report.camera.make && (
                            <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                              <span className="text-zinc-500 block text-[10px]">Manufacturer:</span>
                              <span className="text-zinc-200 font-medium">
                                {selectedItem.report.camera.make}
                              </span>
                            </div>
                          )}
                          {selectedItem.report.camera.model && (
                            <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                              <span className="text-zinc-500 block text-[10px]">Model:</span>
                              <span className="text-zinc-200 font-medium">
                                {selectedItem.report.camera.model}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Timestamp & Software Details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {selectedItem.report.timestamp && (
                        <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-950/60 space-y-1">
                          <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-amber-400" />
                            Embedded Timestamp
                          </span>
                          <p className="font-mono text-[11px] text-zinc-300">
                            {selectedItem.report.timestamp}
                          </p>
                        </div>
                      )}

                      {selectedItem.report.software && (
                        <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-950/60 space-y-1">
                          <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                            <Cpu className="w-3.5 h-3.5 text-purple-400" />
                            Editing Software
                          </span>
                          <p className="font-mono text-[11px] text-zinc-300 truncate">
                            {selectedItem.report.software}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* All Tags Breakdown Accordion/List */}
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[11px] font-mono text-zinc-500 block">
                        Full Tag Audit Log ({selectedItem.report.tags.length} entries):
                      </span>
                      <div className="max-h-40 overflow-y-auto space-y-1 p-2 rounded-lg bg-zinc-950/80 border border-zinc-800 font-mono text-[11px]">
                        {selectedItem.report.tags.map((t, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between py-1 border-b border-zinc-900 last:border-0"
                          >
                            <span className="text-zinc-400">{t.label}:</span>
                            <span className="text-zinc-200 font-medium max-w-xs truncate text-right">
                              {t.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Clean State Result Card */}
                {selectedItem.status === 'clean' && selectedItem.cleanSize && (
                  <div className="p-4 rounded-xl border border-emerald-900/40 bg-emerald-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-emerald-300">
                          Scrubbed & Sanitized ({selectedItem.durationMs}ms)
                        </p>
                        <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                          {selectedItem.cleanFileName} · {formatBytes(selectedItem.cleanSize)}
                        </p>
                      </div>
                    </div>

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => downloadCleanSingle(selectedItem)}
                      icon={<Download className="w-3.5 h-3.5" />}
                    >
                      Download Clean
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
