import React, { useState } from 'react';
import {
  Stamp,
  Type,
  ImageIcon,
  FileText,
  Download,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { Dropzone } from '../ui/Dropzone';
import { Button } from '../ui/Button';
import { formatBytes, downloadBlob } from '../../utils/fileUtils';
import { watermarkPdf } from '../../engine/pdf/pdfPowerTools';

export const PdfWatermark: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [watermarkType, setWatermarkType] = useState<'text' | 'image'>('text');

  // Text watermark options
  const [text, setText] = useState('CONFIDENTIAL');
  const [fontSize, setFontSize] = useState(42);
  const [opacity, setOpacity] = useState(0.25);
  const [rotation, setRotation] = useState(45);
  const [colorHex, setColorHex] = useState('#64748b');
  const [position, setPosition] = useState<'center' | 'diagonal' | 'header' | 'footer' | 'top-right' | 'bottom-right'>('diagonal');

  // Image watermark options
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageScale, setImageScale] = useState(0.35);
  const [imageOpacity, setImageOpacity] = useState(0.35);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFileSelect = (selected: File) => {
    setFile(selected);
    setResultBlob(null);
    setErrorMessage(null);
  };

  const handleApplyWatermark = async () => {
    if (!file) return;
    setErrorMessage(null);
    setIsProcessing(true);
    setProgress(0.1);

    try {
      const buffer = await file.arrayBuffer();

      let watermarkedBlob: Blob;

      if (watermarkType === 'text') {
        watermarkedBlob = await watermarkPdf(
          buffer,
          {
            type: 'text',
            text,
            fontSize,
            opacity,
            rotation: position === 'diagonal' ? 45 : rotation,
            colorHex,
            position,
          },
          (p) => setProgress(p)
        );
      } else {
        if (!imageFile) {
          throw new Error('Please select an image file to use as the watermark.');
        }
        const imgBuffer = await imageFile.arrayBuffer();
        const mime = imageFile.type.includes('jpeg') || imageFile.type.includes('jpg')
          ? 'image/jpeg'
          : 'image/png';

        watermarkedBlob = await watermarkPdf(
          buffer,
          {
            type: 'image',
            imageBytes: imgBuffer,
            imageMimeType: mime,
            imageScale,
            opacity: imageOpacity,
            position,
          },
          (p) => setProgress(p)
        );
      }

      setResultBlob(watermarkedBlob);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to apply watermark.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!resultBlob || !file) return;
    const base = file.name.replace(/\.[^/.]+$/, '');
    downloadBlob(resultBlob, `${base}_watermarked.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
        <div>
          <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
            <Stamp className="w-5 h-5 text-emerald-400" />
            PDF Watermark & Stamp Studio
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            Apply crisp vector text stamps or brand logos across all pages with opacity, position, and rotation controls.
          </p>
        </div>
        <div className="flex rounded-lg border border-zinc-800 p-0.5 bg-zinc-950/60 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setWatermarkType('text')}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all flex items-center gap-1.5 ${
              watermarkType === 'text'
                ? 'bg-emerald-600 text-white font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            Text Watermark
          </button>
          <button
            type="button"
            onClick={() => setWatermarkType('image')}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all flex items-center gap-1.5 ${
              watermarkType === 'image'
                ? 'bg-emerald-600 text-white font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            Image Stamp
          </button>
        </div>
      </div>

      {!file ? (
        <Dropzone
          onFilesSelected={(files: File[]) => files[0] && handleFileSelect(files[0])}
          accept=".pdf,application/pdf"
          multiple={false}
          title="Drag and drop a PDF to watermark"
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

          {/* Controls */}
          <div className="p-4 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-4">
            {watermarkType === 'text' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-medium text-zinc-300">Watermark Text</label>
                  <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="e.g. CONFIDENTIAL, DRAFT, INTERNAL USE"
                    className="w-full px-3 py-1.5 text-xs bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={colorHex}
                      onChange={(e) => setColorHex(e.target.value)}
                      className="w-8 h-8 rounded border border-zinc-700 cursor-pointer bg-transparent"
                    />
                    <span className="text-xs font-mono text-zinc-400">{colorHex.toUpperCase()}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300 flex justify-between">
                    <span>Font Size</span>
                    <span className="text-zinc-500 font-mono">{fontSize}pt</span>
                  </label>
                  <input
                    type="range"
                    min="14"
                    max="90"
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300 flex justify-between">
                    <span>Opacity</span>
                    <span className="text-zinc-500 font-mono">{Math.round(opacity * 100)}%</span>
                  </label>
                  <input
                    type="range"
                    min="0.05"
                    max="0.9"
                    step="0.05"
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">Position</label>
                  <select
                    value={position}
                    onChange={(e) => setPosition(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 text-xs bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200 focus:outline-none"
                  >
                    <option value="diagonal">Diagonal Center (45°)</option>
                    <option value="center">Center Horizontal</option>
                    <option value="header">Top Header</option>
                    <option value="footer">Bottom Footer</option>
                    <option value="top-right">Top-Right Corner</option>
                    <option value="bottom-right">Bottom-Right Corner</option>
                  </select>
                </div>

                {position !== 'diagonal' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300 flex justify-between">
                      <span>Rotation Angle</span>
                      <span className="text-zinc-500 font-mono">{rotation}°</span>
                    </label>
                    <input
                      type="range"
                      min="-90"
                      max="90"
                      value={rotation}
                      onChange={(e) => setRotation(Number(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">Stamp Image (PNG / JPEG)</label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={(e) => e.target.files?.[0] && setImageFile(e.target.files[0])}
                    className="text-xs text-zinc-400 file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700 cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300 flex justify-between">
                      <span>Scale / Size</span>
                      <span className="text-zinc-500 font-mono">{Math.round(imageScale * 100)}%</span>
                    </label>
                    <input
                      type="range"
                      min="0.1"
                      max="0.8"
                      step="0.05"
                      value={imageScale}
                      onChange={(e) => setImageScale(Number(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300 flex justify-between">
                      <span>Opacity</span>
                      <span className="text-zinc-500 font-mono">{Math.round(imageOpacity * 100)}%</span>
                    </label>
                    <input
                      type="range"
                      min="0.05"
                      max="1.0"
                      step="0.05"
                      value={imageOpacity}
                      onChange={(e) => setImageOpacity(Number(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Button */}
          {!resultBlob && !isProcessing && (
            <Button
              onClick={handleApplyWatermark}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
            >
              <Stamp className="w-4 h-4 mr-2" />
              Apply Watermark Stamp to All Pages
            </Button>
          )}

          {isProcessing && (
            <div className="space-y-2 pt-2">
              <div className="flex justify-between text-xs font-mono text-zinc-400">
                <span>Stamping watermark across document pages...</span>
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
                Watermarked PDF is ready ({formatBytes(resultBlob.size)})
              </div>
              <Button
                size="sm"
                onClick={handleDownload}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Download Watermarked PDF
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
