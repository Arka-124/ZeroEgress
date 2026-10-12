import React, { useState } from 'react';
import {
  RotateCw,
  RotateCcw,
  FileText,
  Download,
  AlertCircle,
  CheckCircle2,
  Sliders,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { Dropzone } from '../ui/Dropzone';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { formatBytes, downloadBlob, parsePageRange } from '../../utils/fileUtils';
import { rotatePdfPages } from '../../engine/pdf/pdfPowerTools';

export const PdfRotate: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [angle, setAngle] = useState<90 | 180 | 270>(90);
  const [scope, setScope] = useState<'all' | 'even' | 'odd' | 'custom'>('all');
  const [customRange, setCustomRange] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFileSelect = async (selected: File) => {
    setFile(selected);
    setResultBlob(null);
    setErrorMessage(null);
    try {
      const buffer = await selected.arrayBuffer();
      const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      setPageCount(doc.getPageCount());
    } catch {
      setPageCount(null);
    }
  };

  const handleRotate = async () => {
    if (!file) return;
    setIsProcessing(true);
    setProgress(0.1);
    setErrorMessage(null);

    try {
      const buffer = await file.arrayBuffer();
      let scopeArg: 'all' | 'even' | 'odd' | number[] = 'all';

      if (scope === 'custom') {
        const parsed = parsePageRange(customRange, pageCount || 100);
        if (parsed.length === 0) {
          throw new Error('Please enter valid page numbers (e.g. 1-3, 5).');
        }
        scopeArg = parsed;
      } else {
        scopeArg = scope;
      }

      const rotatedBlob = await rotatePdfPages(
        buffer,
        { angle, scope: scopeArg },
        (p) => setProgress(p)
      );

      setResultBlob(rotatedBlob);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to rotate PDF pages.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!resultBlob || !file) return;
    const base = file.name.replace(/\.[^/.]+$/, '');
    downloadBlob(resultBlob, `${base}_rotated_${angle}deg.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
        <div>
          <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
            <RotateCw className="w-5 h-5 text-emerald-400" />
            PDF Page Rotation Engine
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            Rotate individual pages or entire documents permanently with zero loss of vector sharpness.
          </p>
        </div>
        <Badge variant="success" className="self-start sm:self-auto font-mono text-[10px]">
          CLIENT-SIDE
        </Badge>
      </div>

      {!file ? (
        <Dropzone
          onFilesSelected={(files: File[]) => files[0] && handleFileSelect(files[0])}
          accept=".pdf,application/pdf"
          multiple={false}
          title="Drag and drop a PDF to rotate"
          subtitle="Supports all standard PDF documents"
        />
      ) : (
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center text-emerald-400">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-200">{file.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-zinc-500 font-mono">{formatBytes(file.size)}</span>
                  {pageCount && (
                    <span className="text-[11px] text-zinc-400 font-mono">
                      · {pageCount} {pageCount === 1 ? 'page' : 'pages'}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFile(null);
                setResultBlob(null);
                setPageCount(null);
              }}
              className="text-zinc-400 hover:text-zinc-200"
            >
              Change File
            </Button>
          </div>

          {/* Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* Rotation Angle */}
            <div className="p-4 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-3">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                Rotation Angle
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { deg: 90 as const, label: '90° Clockwise', icon: RotateCw },
                  { deg: 180 as const, label: '180° Flip', icon: RotateCw },
                  { deg: 270 as const, label: '90° Counter-CW', icon: RotateCcw },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.deg}
                      type="button"
                      onClick={() => setAngle(item.deg)}
                      className={`p-2.5 rounded-lg border text-xs font-medium flex flex-col items-center justify-center gap-1.5 transition-all ${
                        angle === item.deg
                          ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300 font-semibold shadow-sm'
                          : 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Target Scope */}
            <div className="p-4 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-3">
              <label className="text-xs font-medium text-zinc-300">Target Pages</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'all' as const, label: 'All Pages' },
                  { id: 'odd' as const, label: 'Odd Pages' },
                  { id: 'even' as const, label: 'Even Pages' },
                  { id: 'custom' as const, label: 'Custom' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setScope(s.id)}
                    className={`py-2 px-2 text-xs rounded-lg border text-center transition-all ${
                      scope === s.id
                        ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300 font-semibold'
                        : 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {scope === 'custom' && (
                <input
                  type="text"
                  placeholder="e.g. 1, 3-5, 8"
                  value={customRange}
                  onChange={(e) => setCustomRange(e.target.value)}
                  className="w-full mt-2 px-3 py-1.5 text-xs bg-zinc-900 border border-zinc-700 rounded-md text-zinc-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
              )}
            </div>
          </div>

          {/* Action Button */}
          {!resultBlob && !isProcessing && (
            <Button
              onClick={handleRotate}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
            >
              <RotateCw className="w-4 h-4 mr-2" />
              Rotate and Apply Transformation
            </Button>
          )}

          {isProcessing && (
            <div className="space-y-2 pt-2">
              <div className="flex justify-between text-xs font-mono text-zinc-400">
                <span>Rotating PDF pages in browser memory...</span>
                <span className="text-emerald-400">{Math.round(progress * 100)}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-150"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>
          )}

          {resultBlob && (
            <div className="p-4 rounded-xl border border-emerald-900/60 bg-emerald-950/30 flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-300 text-xs font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Rotated PDF is ready ({formatBytes(resultBlob.size)})
              </div>
              <Button
                size="sm"
                onClick={handleDownload}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Download Rotated PDF
              </Button>
            </div>
          )}
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-950/30 border border-red-800 text-red-200 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};
