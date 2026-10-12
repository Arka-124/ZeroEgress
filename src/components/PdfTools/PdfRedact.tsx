import React, { useState } from 'react';
import { ShieldAlert, Trash2, Download, Plus, RefreshCw, AlertCircle, FileCheck } from 'lucide-react';
import { Dropzone } from '../ui/Dropzone';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { redactPdfVector } from '../../engine/pdf/pdfProOperations';
import { formatBytes, downloadBlob } from '../../utils/fileUtils';

export const PdfRedact: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [searchTerms, setSearchTerms] = useState<string[]>(['CONFIDENTIAL', 'SECRET']);
  const [newTerm, setNewTerm] = useState('');
  const [redactVectors, setRedactVectors] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelected = (files: File[]) => {
    if (files.length > 0 && files[0].name.toLowerCase().endsWith('.pdf')) {
      setFile(files[0]);
      setResultBlob(null);
      setError(null);
    }
  };

  const addTerm = () => {
    const trimmed = newTerm.trim();
    if (trimmed && !searchTerms.includes(trimmed)) {
      setSearchTerms([...searchTerms, trimmed]);
      setNewTerm('');
    }
  };

  const removeTerm = (term: string) => {
    setSearchTerms(searchTerms.filter((t) => t !== term));
  };

  const handleRedact = async () => {
    if (!file || searchTerms.length === 0) return;
    setIsProcessing(true);
    setError(null);
    setProgress(0.2);

    try {
      const buffer = await file.arrayBuffer();
      const blob = await redactPdfVector(buffer, {
        searchTerms,
        redactVectors,
        drawRedactionBoxes: true,
      }, (ratio) => setProgress(ratio));

      setResultBlob(blob);
    } catch (err: any) {
      setError(err?.message || 'Failed to redact PDF');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!resultBlob || !file) return;
    const stem = file.name.replace(/\.pdf$/i, '');
    downloadBlob(resultBlob, `${stem}_redacted.pdf`);
  };

  return (
    <div className="w-full space-y-6">
      <div className="border border-zinc-800 bg-zinc-900/50 rounded-2xl p-6 sm:p-8 backdrop-blur-sm space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
              Destructive PDF Vector Redaction
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Permanently purges targeted text literals and vector drawing operators from the PDF DOM. Not cosmetic black boxes.
            </p>
          </div>
          <Badge variant="warning">Permanent DOM Erasure</Badge>
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
                <FileCheck className="w-5 h-5 text-rose-400" />
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

            {/* Search terms manager */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                Sensitive Search Terms to Obliterate
              </label>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTerm}
                  onChange={(e) => setNewTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTerm()}
                  placeholder="e.g. John Doe, SSN, 123-45-6789, internal@corp.com"
                  className="flex-1 bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-rose-500"
                />
                <Button variant="secondary" size="sm" onClick={addTerm} className="gap-1.5 shrink-0">
                  <Plus className="w-3.5 h-3.5" />
                  Add Term
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {searchTerms.map((term) => (
                  <span
                    key={term}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-rose-500/10 text-rose-300 border border-rose-500/30"
                  >
                    <span>{term}</span>
                    <button
                      type="button"
                      onClick={() => removeTerm(term)}
                      className="text-rose-400 hover:text-rose-200"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="redactVectors"
                  checked={redactVectors}
                  onChange={(e) => setRedactVectors(e.target.checked)}
                  className="rounded border-zinc-700 text-rose-600 focus:ring-rose-500 bg-zinc-950"
                />
                <label htmlFor="redactVectors" className="text-xs text-zinc-300 cursor-pointer">
                  Purge vector shapes under redacted content
                </label>
              </div>
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
                onClick={handleRedact}
                disabled={isProcessing || searchTerms.length === 0}
                className="gap-2 bg-rose-600 hover:bg-rose-500 text-white"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Sanitizing ({Math.round(progress * 100)}%)...
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-4 h-4" />
                    Permanently Redact PDF
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
                  Download Sanitized PDF ({formatBytes(resultBlob.size)})
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
