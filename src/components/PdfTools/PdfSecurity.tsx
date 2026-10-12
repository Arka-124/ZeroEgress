import React, { useState } from 'react';
import {
  Lock,
  Unlock,
  Shield,
  FileText,
  Download,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Printer,
  Copy,
  Edit,
} from 'lucide-react';
import { Dropzone } from '../ui/Dropzone';
import { Button } from '../ui/Button';
import { formatBytes, downloadBlob } from '../../utils/fileUtils';
import { encryptPdf, decryptPdf } from '../../engine/pdf/pdfPowerTools';

export const PdfSecurity: React.FC = () => {
  const [mode, setMode] = useState<'encrypt' | 'decrypt'>('encrypt');
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Permissions
  const [allowPrinting, setAllowPrinting] = useState<'highResolution' | 'lowResolution' | 'none'>('highResolution');
  const [allowCopying, setAllowCopying] = useState(true);
  const [allowModifying, setAllowModifying] = useState(false);
  const [allowFormFilling, setAllowFormFilling] = useState(true);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFileSelect = (selected: File) => {
    setFile(selected);
    setResultBlob(null);
    setErrorMessage(null);
    setPassword('');
    setConfirmPassword('');
  };

  const handleProcess = async () => {
    if (!file) return;
    setErrorMessage(null);

    if (mode === 'encrypt') {
      if (!password) {
        setErrorMessage('Please enter a password to lock the document.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match. Please re-enter.');
        return;
      }
    }

    setIsProcessing(true);
    setProgress(0.1);

    try {
      const buffer = await file.arrayBuffer();

      if (mode === 'encrypt') {
        const lockedBlob = await encryptPdf(
          buffer,
          {
            password,
            permissions: {
              printing: allowPrinting,
              copying: allowCopying,
              modifying: allowModifying,
              formFilling: allowFormFilling,
            },
          },
          (p) => setProgress(p)
        );
        setResultBlob(lockedBlob);
      } else {
        const unlockedBlob = await decryptPdf(buffer, password, (p) => setProgress(p));
        setResultBlob(unlockedBlob);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Operation failed. Please verify password.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!resultBlob || !file) return;
    const base = file.name.replace(/\.[^/.]+$/, '');
    const suffix = mode === 'encrypt' ? 'protected' : 'unlocked';
    downloadBlob(resultBlob, `${base}_${suffix}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
        <div>
          <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            PDF Security & Permissions Manager
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            Enforce client-side AES-256 password protection and permission restrictions or permanently unlock protected files.
          </p>
        </div>
        <div className="flex rounded-lg border border-zinc-800 p-0.5 bg-zinc-950/60 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setMode('encrypt');
              setResultBlob(null);
            }}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all flex items-center gap-1.5 ${
              mode === 'encrypt'
                ? 'bg-emerald-600 text-white font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            Protect PDF
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('decrypt');
              setResultBlob(null);
            }}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all flex items-center gap-1.5 ${
              mode === 'decrypt'
                ? 'bg-emerald-600 text-white font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Unlock className="w-3.5 h-3.5" />
            Unlock PDF
          </button>
        </div>
      </div>

      {!file ? (
        <Dropzone
          onFilesSelected={(files: File[]) => files[0] && handleFileSelect(files[0])}
          accept=".pdf,application/pdf"
          multiple={false}
          title={mode === 'encrypt' ? 'Drag and drop a PDF to protect' : 'Drag and drop a password-protected PDF'}
          subtitle="All encryption and decryption runs strictly in your local browser sandbox"
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
                <p className="text-xs text-zinc-500 font-mono">{formatBytes(file.size)}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFile(null);
                setResultBlob(null);
              }}
              className="text-zinc-400 hover:text-zinc-200"
            >
              Change File
            </Button>
          </div>

          {/* Form Fields */}
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                  {mode === 'encrypt' ? 'Set Document Password' : 'Enter Password to Decrypt'}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password..."
                  className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-700 rounded-lg text-zinc-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              {mode === 'encrypt' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password..."
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-700 rounded-lg text-zinc-200 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              )}
            </div>

            {/* Permissions Toggles (for Encrypt Mode) */}
            {mode === 'encrypt' && (
              <div className="p-4 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-3">
                <h4 className="text-xs font-semibold text-zinc-300">Document Security Permissions</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Printing */}
                  <div className="flex items-center justify-between p-2 rounded border border-zinc-800 bg-zinc-900/40">
                    <span className="flex items-center gap-2 text-zinc-300">
                      <Printer className="w-3.5 h-3.5 text-zinc-400" />
                      Allow Printing
                    </span>
                    <select
                      value={allowPrinting}
                      onChange={(e) => setAllowPrinting(e.target.value as any)}
                      className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                    >
                      <option value="highResolution">High Quality</option>
                      <option value="lowResolution">Low Resolution</option>
                      <option value="none">Disabled</option>
                    </select>
                  </div>

                  {/* Copying */}
                  <label className="flex items-center justify-between p-2 rounded border border-zinc-800 bg-zinc-900/40 cursor-pointer">
                    <span className="flex items-center gap-2 text-zinc-300">
                      <Copy className="w-3.5 h-3.5 text-zinc-400" />
                      Allow Text & Image Copying
                    </span>
                    <input
                      type="checkbox"
                      checked={allowCopying}
                      onChange={(e) => setAllowCopying(e.target.checked)}
                      className="rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500"
                    />
                  </label>

                  {/* Modifying */}
                  <label className="flex items-center justify-between p-2 rounded border border-zinc-800 bg-zinc-900/40 cursor-pointer">
                    <span className="flex items-center gap-2 text-zinc-300">
                      <Edit className="w-3.5 h-3.5 text-zinc-400" />
                      Allow Content Modifications
                    </span>
                    <input
                      type="checkbox"
                      checked={allowModifying}
                      onChange={(e) => setAllowModifying(e.target.checked)}
                      className="rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500"
                    />
                  </label>

                  {/* Form Filling */}
                  <label className="flex items-center justify-between p-2 rounded border border-zinc-800 bg-zinc-900/40 cursor-pointer">
                    <span className="flex items-center gap-2 text-zinc-300">
                      <FileText className="w-3.5 h-3.5 text-zinc-400" />
                      Allow Form Filling & Signing
                    </span>
                    <input
                      type="checkbox"
                      checked={allowFormFilling}
                      onChange={(e) => setAllowFormFilling(e.target.checked)}
                      className="rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500"
                    />
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Action Button */}
          {!resultBlob && !isProcessing && (
            <Button
              onClick={handleProcess}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
            >
              {mode === 'encrypt' ? (
                <>
                  <Lock className="w-4 h-4 mr-2" />
                  Encrypt and Protect PDF Document
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4 mr-2" />
                  Decrypt and Unlock PDF Document
                </>
              )}
            </Button>
          )}

          {isProcessing && (
            <div className="space-y-2 pt-2">
              <div className="flex justify-between text-xs font-mono text-zinc-400">
                <span>{mode === 'encrypt' ? 'Applying AES-256 encryption...' : 'Decrypting PDF security handler...'}</span>
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
                {mode === 'encrypt' ? 'Document protected with AES-256' : 'Document successfully decrypted and unlocked'}
              </div>
              <Button
                size="sm"
                onClick={handleDownload}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Download {mode === 'encrypt' ? 'Protected' : 'Unlocked'} PDF
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
