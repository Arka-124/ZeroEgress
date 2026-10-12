import React, { useState } from 'react';
import { Compass, Camera, Download, RefreshCw, AlertCircle, Eye } from 'lucide-react';
import { Dropzone } from '../ui/Dropzone';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { parseDxf, dxfToSvg, dxfToPdf, extractCameraRawPreview } from '../../engine/cad/cadEngine';
import { formatBytes, downloadBlob } from '../../utils/fileUtils';
import { urlRegistry } from '../../utils/urlRegistry';

type SubMode = 'cad' | 'raw';

export const CadRawTools: React.FC = () => {
  const [subMode, setSubMode] = useState<SubMode>('cad');
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CAD state
  const [svgPreview, setSvgPreview] = useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);

  // RAW state
  const [rawPreviewUrl, setRawPreviewUrl] = useState<string | null>(null);
  const [rawJpegBlob, setRawJpegBlob] = useState<Blob | null>(null);

  const resetState = () => {
    setFile(null);
    setSvgPreview(null);
    setPdfBytes(null);
    if (rawPreviewUrl) {
      urlRegistry.revoke(rawPreviewUrl);
      setRawPreviewUrl(null);
    }
    setRawJpegBlob(null);
    setError(null);
  };

  const handleFilesSelected = async (files: File[]) => {
    if (files.length === 0) return;
    const selected = files[0];
    resetState();
    setFile(selected);
    setIsProcessing(true);
    setError(null);

    const ext = selected.name.toLowerCase().split('.').pop() || '';

    try {
      if (ext === 'dxf') {
        setSubMode('cad');
        const text = await selected.text();
        const drawing = parseDxf(text);
        const svg = dxfToSvg(drawing);
        setSvgPreview(svg);

        const pdf = await dxfToPdf(drawing, selected.name);
        setPdfBytes(pdf);
      } else if (['cr2', 'nef', 'arw', 'dng', 'raf'].includes(ext)) {
        setSubMode('raw');
        const buffer = await selected.arrayBuffer();
        const jpegBytes = extractCameraRawPreview(buffer);
        if (!jpegBytes) {
          throw new Error('No embedded JPEG preview found in this RAW container.');
        }
        const blob = new Blob([jpegBytes as any], { type: 'image/jpeg' });
        setRawJpegBlob(blob);
        const url = urlRegistry.create(blob);
        setRawPreviewUrl(url);
      } else {
        throw new Error(`Unsupported format .${ext}. Please drop a .dxf, .cr2, .nef, .arw, or .dng file.`);
      }
    } catch (err: any) {
      setError(err?.message || 'Processing failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadSvg = () => {
    if (!svgPreview || !file) return;
    const blob = new Blob([svgPreview], { type: 'image/svg+xml' });
    const stem = file.name.replace(/\.[^/.]+$/, '');
    downloadBlob(blob, `${stem}.svg`);
  };

  const handleDownloadPdf = () => {
    if (!pdfBytes || !file) return;
    const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
    const stem = file.name.replace(/\.[^/.]+$/, '');
    downloadBlob(blob, `${stem}_blueprint.pdf`);
  };

  const handleDownloadRawJpeg = () => {
    if (!rawJpegBlob || !file) return;
    const stem = file.name.replace(/\.[^/.]+$/, '');
    downloadBlob(rawJpegBlob, `${stem}_preview.jpg`);
  };

  return (
    <div className="w-full space-y-6">
      <div className="border border-zinc-800 bg-zinc-900/50 rounded-2xl p-6 sm:p-8 backdrop-blur-sm space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
              <Compass className="w-5 h-5 text-emerald-400" />
              CAD Blueprints & Camera RAW Converter
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Client-side 2D CAD (DXF) to scalable SVG & PDF blueprints, plus Camera RAW (CR2, NEF, ARW, DNG) preview extraction.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">2D DXF Blueprint</Badge>
            <Badge variant="success">Camera RAW</Badge>
          </div>
        </div>

        {!file ? (
          <Dropzone
            accept=".dxf,.cr2,.nef,.arw,.dng,.raf"
            onFilesSelected={handleFilesSelected}
          />
        ) : (
          <div className="space-y-6">
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {subMode === 'cad' ? (
                  <Compass className="w-5 h-5 text-emerald-400" />
                ) : (
                  <Camera className="w-5 h-5 text-sky-400" />
                )}
                <div>
                  <p className="text-sm font-medium text-zinc-200">{file.name}</p>
                  <p className="text-xs text-zinc-500">{formatBytes(file.size)}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={resetState}>
                Change File
              </Button>
            </div>

            {error && (
              <div className="p-3 rounded-lg border border-red-800/60 bg-red-950/20 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {isProcessing && (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-zinc-400">
                <RefreshCw className="w-6 h-6 animate-spin text-emerald-500" />
                <span className="text-xs">Parsing file data locally...</span>
              </div>
            )}

            {/* CAD DXF Preview & Export */}
            {svgPreview && !isProcessing && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-emerald-400" />
                    Interactive Blueprint Preview
                  </span>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={handleDownloadSvg} className="gap-1.5">
                      <Download className="w-3.5 h-3.5" />
                      Download SVG
                    </Button>
                    <Button variant="primary" size="sm" onClick={handleDownloadPdf} className="gap-1.5">
                      <Download className="w-3.5 h-3.5" />
                      Download Vector PDF
                    </Button>
                  </div>
                </div>

                <div
                  className="w-full h-[400px] rounded-xl border border-zinc-800 overflow-hidden bg-zinc-950 p-2 flex items-center justify-center"
                  dangerouslySetInnerHTML={{ __html: svgPreview }}
                />
              </div>
            )}

            {/* Camera RAW Preview & Export */}
            {rawPreviewUrl && !isProcessing && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-sky-400" />
                    Full-Resolution RAW Frame Preview
                  </span>
                  <Button variant="primary" size="sm" onClick={handleDownloadRawJpeg} className="gap-1.5">
                    <Download className="w-3.5 h-3.5" />
                    Download Full JPEG ({rawJpegBlob ? formatBytes(rawJpegBlob.size) : ''})
                  </Button>
                </div>

                <div className="w-full rounded-xl border border-zinc-800 overflow-hidden bg-zinc-950 flex items-center justify-center max-h-[480px]">
                  <img
                    src={rawPreviewUrl}
                    alt="RAW preview"
                    className="max-w-full max-h-[480px] object-contain rounded-lg"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CadRawTools;
