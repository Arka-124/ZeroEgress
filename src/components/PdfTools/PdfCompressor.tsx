import React, { useState } from 'react';
import {
  Minimize2,
  FileText,
  Download,
  X,
  CheckCircle2,
  AlertCircle,
  Zap,
  Sliders,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { Dropzone } from '../ui/Dropzone';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { formatBytes, downloadBlob } from '../../utils/fileUtils';
import {
  compressPdf,
  estimateCompressedSize,
  type PdfCompressionPreset,
  type PdfCompressionResult,
} from '../../engine/pdf/pdfCompressor';

export const PdfCompressor: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [preset, setPreset] = useState<PdfCompressionPreset>('balanced');
  const [stripMetadata, setStripMetadata] = useState(true);
  const [isCompressing, setIsCompressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<PdfCompressionResult | null>(null);
  const [errorAlert, setErrorAlert] = useState<string | null>(null);

  const handleFilesSelected = (files: File[]) => {
    const pdf = files.find((f) => f.type.includes('pdf') || f.name.endsWith('.pdf'));
    if (!pdf) {
      setErrorAlert('Please select a valid PDF document.');
      return;
    }
    setFile(pdf);
    setResult(null);
    setErrorAlert(null);
  };

  const handleExecuteCompress = async () => {
    if (!file) return;
    setIsCompressing(true);
    setProgress(5);
    setErrorAlert(null);
    setResult(null);

    try {
      const res = await compressPdf(
        file,
        {
          preset,
          stripMetadata,
        },
        (ratio) => setProgress(Math.round(ratio * 100))
      );
      setResult(res);
    } catch (err: any) {
      setErrorAlert(err?.message || 'Failed to compress PDF document.');
    } finally {
      setIsCompressing(false);
    }
  };

  const estimation = file ? estimateCompressedSize(file.size, preset) : null;

  return (
    <div className="space-y-5">
      {/* Error Alert Banner */}
      {errorAlert && (
        <div className="p-4 rounded-xl border border-rose-900/60 bg-rose-950/30 flex items-start justify-between gap-3 text-xs animate-in fade-in duration-150">
          <div className="flex items-start gap-2.5 text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-200">Compression Notice</p>
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

      {!file ? (
        <Dropzone
          onFilesSelected={handleFilesSelected}
          accept=".pdf,application/pdf"
          title="Drop PDF file to optimize & compress"
          subtitle="Select PDF · Shrink document size locally with pure client-side stream optimization"
          hint="100% Client-Side · Zero Cloud Uploads"
        />
      ) : (
        <div className="space-y-5">
          {/* File Selected Card */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-zinc-800 bg-zinc-900/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-950/50 border border-blue-800/80 flex items-center justify-center text-blue-400">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-100">{file.name}</p>
                <p className="text-[11px] font-mono text-zinc-400">
                  Original Size: <strong className="text-zinc-200">{formatBytes(file.size)}</strong>
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFile(null);
                setResult(null);
              }}
              icon={<X className="w-3.5 h-3.5" />}
            >
              Change File
            </Button>
          </div>

          {/* Preset Selector Cards */}
          <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/30 space-y-4">
            <div>
              <label className="text-xs font-semibold text-zinc-200 block mb-2">
                Select Compression Preset:
              </label>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Max Compression */}
                <button
                  type="button"
                  onClick={() => setPreset('max')}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    preset === 'max'
                      ? 'border-blue-500 bg-blue-950/30 ring-1 ring-blue-500/50'
                      : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-blue-400" />
                      Max Compression
                    </span>
                    <Badge variant="info" size="sm">
                      ~55% Off
                    </Badge>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Low DPI raster images, aggressive vector & metadata purging. Smallest possible file size.
                  </p>
                </button>

                {/* Balanced */}
                <button
                  type="button"
                  onClick={() => setPreset('balanced')}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    preset === 'balanced'
                      ? 'border-emerald-500 bg-emerald-950/30 ring-1 ring-emerald-500/50'
                      : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                      Balanced
                    </span>
                    <Badge variant="success" size="sm">
                      ~35% Off
                    </Badge>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Standard 150 DPI optimization with stream packing. Ideal for email sharing & web publishing.
                  </p>
                </button>

                {/* High Quality */}
                <button
                  type="button"
                  onClick={() => setPreset('quality')}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    preset === 'quality'
                      ? 'border-amber-500 bg-amber-950/30 ring-1 ring-amber-500/50'
                      : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      High Quality
                    </span>
                    <Badge variant="warning" size="sm">
                      ~18% Off
                    </Badge>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Preserves 200 DPI image sharpness and font clarity with lossless object stream packing.
                  </p>
                </button>
              </div>
            </div>

            {/* Additional Options */}
            <div className="pt-1 flex items-center gap-6">
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={stripMetadata}
                  onChange={(e) => setStripMetadata(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-900 text-blue-500 focus:ring-0"
                />
                <span>Purge non-essential PDF metadata & author properties</span>
              </label>
            </div>

            {/* Estimated Size Preview Gauge */}
            {estimation && (
              <div className="p-3.5 rounded-lg bg-zinc-950/80 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <div className="text-zinc-400 font-mono">
                    Original: <span className="text-zinc-200 font-semibold">{formatBytes(file.size)}</span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-600" />
                  <div className="text-zinc-400 font-mono">
                    Estimated Target:{' '}
                    <span className="text-emerald-400 font-bold">
                      ~{formatBytes(estimation.estimatedSize)}
                    </span>
                  </div>
                </div>

                <Badge variant="default" size="sm">
                  Estimated Savings: ~{estimation.estimatedSavingsPercent}%
                </Badge>
              </div>
            )}

            {/* Action Button & Live Progress */}
            <div className="pt-2 flex items-center justify-end">
              <Button
                variant="primary"
                size="md"
                onClick={handleExecuteCompress}
                loading={isCompressing}
                icon={<Minimize2 className="w-4 h-4 text-blue-400" />}
              >
                {isCompressing ? `Optimizing Document (${progress}%)` : 'Compress PDF Document'}
              </Button>
            </div>
          </div>

          {/* Compressed Result Card */}
          {result && (
            <div className="p-4 rounded-xl border border-emerald-900/50 bg-emerald-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400 shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-emerald-200 flex items-center gap-2">
                    <span>{result.outputFileName}</span>
                    <Badge variant="success" size="sm">
                      {formatBytes(result.compressedSize)}
                    </Badge>
                  </p>
                  <p className="text-[11px] font-mono text-emerald-400/80 mt-0.5">
                    Original: {formatBytes(result.originalSize)} · Saved {formatBytes(result.savedBytes)} (
                    {result.savingsPercent}% reduction) in {result.durationMs}ms
                  </p>
                </div>
              </div>

              <Button
                variant="primary"
                size="sm"
                onClick={() => downloadBlob(result.blob, result.outputFileName)}
                icon={<Download className="w-3.5 h-3.5" />}
              >
                Download Compressed PDF
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PdfCompressor;
