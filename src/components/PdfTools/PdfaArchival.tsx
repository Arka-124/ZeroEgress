import React, { useState } from 'react';
import { Archive, Download, FileCheck, RefreshCw, AlertCircle } from 'lucide-react';
import { Dropzone } from '../ui/Dropzone';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { convertToPdfa } from '../../engine/pdf/pdfPowerTools';
import { formatBytes, downloadBlob } from '../../utils/fileUtils';

export const PdfaArchival: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [conformance, setConformance] = useState<'1b' | '2b'>('1b');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelected = (files: File[]) => {
    if (files.length > 0 && files[0].name.toLowerCase().endsWith('.pdf')) {
      setFile(files[0]);
      setResultBlob(null);
      setError(null);
      setProgress(0);
    }
  };

  const handleConvert = async () => {
    if (!file) return;
    setIsProcessing(true);
    setError(null);
    setProgress(0.1);

    try {
      const buffer = await file.arrayBuffer();
      const part = conformance === '2b' ? 2 : 1;
      const blob = await convertToPdfa(buffer, part, (ratio) => setProgress(ratio));
      setResultBlob(blob);
    } catch (err: any) {
      setError(err?.message || 'Failed to generate PDF/A compliant document');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!resultBlob || !file) return;
    const stem = file.name.replace(/\.pdf$/i, '');
    downloadBlob(resultBlob, `${stem}_PDFA_${conformance.toUpperCase()}.pdf`);
  };

  return (
    <div className="w-full space-y-6">
      <div className="border border-zinc-800 bg-zinc-900/50 rounded-2xl p-6 sm:p-8 backdrop-blur-sm space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
              <Archive className="w-5 h-5 text-indigo-400" />
              PDF/A Archival & Prepress Compliance
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Inject ISO 19005-1 / ISO 19005-2 compliance metadata and OutputIntent profiles for long-term electronic archiving.
            </p>
          </div>
          <Badge variant="success">ISO 19005-1 / 19005-2</Badge>
        </div>

        {!file ? (
          <Dropzone
            accept=".pdf,application/pdf"
            onFilesSelected={handleFileSelected}
          />
        ) : (
          <div className="space-y-6">
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileCheck className="w-5 h-5 text-indigo-400" />
                <div>
                  <p className="text-sm font-medium text-zinc-200">{file.name}</p>
                  <p className="text-xs text-zinc-500">{formatBytes(file.size)}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFile(null);
                  setResultBlob(null);
                }}
              >
                Change File
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setConformance('1b')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  conformance === '1b'
                    ? 'border-indigo-500/60 bg-indigo-500/10 text-zinc-100'
                    : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm">PDF/A-1b</span>
                  <Badge variant={conformance === '1b' ? 'success' : 'outline'}>Archival Standard</Badge>
                </div>
                <p className="text-xs text-zinc-400">
                  ISO 19005-1 Level B. Guaranteed visual appearance preservation for legal and government records.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setConformance('2b')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  conformance === '2b'
                    ? 'border-indigo-500/60 bg-indigo-500/10 text-zinc-100'
                    : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm">PDF/A-2b</span>
                  <Badge variant={conformance === '2b' ? 'success' : 'outline'}>Modern Archival</Badge>
                </div>
                <p className="text-xs text-zinc-400">
                  ISO 19005-2 Level B. Supports JPEG2000 images, transparency layers, and embedded files.
                </p>
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-lg border border-red-800/60 bg-red-950/20 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-zinc-800">
              <Button
                variant="primary"
                onClick={handleConvert}
                disabled={isProcessing}
                className="gap-2"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Converting ({Math.round(progress * 100)}%)...
                  </>
                ) : (
                  <>
                    <Archive className="w-4 h-4" />
                    Convert to PDF/A-{conformance.toUpperCase()}
                  </>
                )}
              </Button>

              {resultBlob && (
                <Button
                  variant="secondary"
                  onClick={handleDownload}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  <Download className="w-4 h-4" />
                  Download PDF/A ({formatBytes(resultBlob.size)})
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
