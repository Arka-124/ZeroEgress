import React, { useState, useEffect } from 'react';
import {
  Camera,
  FileCode,
  Download,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Eye,
  Monitor,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { Button } from '../ui/Button';
import { formatBytes, downloadBlob } from '../../utils/fileUtils';
import { convertTextOrMarkdownToPdf } from '../../engine/ebook/ebookEngine';

export const CaptureTools: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'screen' | 'html'>('screen');

  // ===================== SCREEN CAPTURE STATE =====================
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [capturedDims, setCapturedDims] = useState<{ width: number; height: number } | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // ===================== HTML TO PDF STATE =====================
  const [htmlFile, setHtmlFile] = useState<File | null>(null);
  const [htmlCode, setHtmlCode] = useState(
    '<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body { font-family: system-ui, sans-serif; padding: 24px; color: #1e293b; }\n    h1 { color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }\n    .badge { background: #dcfce7; color: #166534; padding: 4px 8px; border-radius: 6px; font-weight: bold; }\n  </style>\n</head>\n<body>\n  <h1>ZeroEgress HTML Document</h1>\n  <p><span class="badge">Air-Gapped</span> Client-side rendered document.</p>\n  <p>Render any HTML markup or static template and save as a clean PDF.</p>\n</body>\n</html>'
  );
  const [htmlDocTitle, setHtmlDocTitle] = useState('HTML_Export');
  const [isGeneratingHtmlPdf, setIsGeneratingHtmlPdf] = useState(false);
  const [htmlPdfBlob, setHtmlPdfBlob] = useState<Blob | null>(null);
  const [htmlError, setHtmlError] = useState<string | null>(null);

  // Cleanup data URL
  useEffect(() => {
    return () => {
      if (capturedDataUrl) {
        URL.revokeObjectURL(capturedDataUrl);
      }
    };
  }, [capturedDataUrl]);

  // Capture screen/tab via navigator.mediaDevices.getDisplayMedia
  const handleCaptureScreen = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      setScreenError('Screen capture is not supported in this browser environment (requires HTTPS or localhost).');
      return;
    }

    setIsCapturing(true);
    setScreenError(null);

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' },
        audio: false,
      });

      const video = document.createElement('video');
      video.srcObject = stream;

      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => {
          video.play().then(resolve);
        };
      });

      // Allow 200ms for stable frame rasterization
      await new Promise((r) => setTimeout(r, 200));

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Canvas 2D context creation failed.');
      }

      ctx.drawImage(video, 0, 0);

      // Stop all stream tracks immediately to free screen share permission
      stream.getTracks().forEach((track) => track.stop());

      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('Failed to convert canvas to image blob.'));
        }, 'image/png');
      });

      if (capturedDataUrl) URL.revokeObjectURL(capturedDataUrl);
      const url = URL.createObjectURL(blob);
      setCapturedBlob(blob);
      setCapturedDataUrl(url);
      setCapturedDims({ width: canvas.width, height: canvas.height });
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        setScreenError(err.message || 'Screen capture was cancelled or failed.');
      }
    } finally {
      setIsCapturing(false);
    }
  };

  // Export captured screenshot as PDF
  const handleExportScreenPdf = async () => {
    if (!capturedBlob || !capturedDims) return;
    setIsExportingPdf(true);

    try {
      const arrayBuffer = await capturedBlob.arrayBuffer();
      const doc = await PDFDocument.create();
      const embeddedImg = await doc.embedPng(arrayBuffer);

      // Page dimensions matching image aspect ratio
      const page = doc.addPage([embeddedImg.width, embeddedImg.height]);
      page.drawImage(embeddedImg, {
        x: 0,
        y: 0,
        width: embeddedImg.width,
        height: embeddedImg.height,
      });

      const pdfBytes = await doc.save();
      const pdfBlob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      downloadBlob(pdfBlob, `screenshot_${Date.now()}.pdf`);
    } catch (err: any) {
      setScreenError(err.message || 'Failed to export screenshot as PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Convert HTML file/code to PDF
  const handleGenerateHtmlPdf = async () => {
    if (!htmlCode.trim()) return;
    setIsGeneratingHtmlPdf(true);
    setHtmlError(null);

    try {
      // Parse HTML plain text and markdown headings
      const cleanText = htmlCode
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
        .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
        .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      const blob = await convertTextOrMarkdownToPdf(cleanText || htmlCode, {
        title: htmlDocTitle,
      });
      setHtmlPdfBlob(blob);
    } catch (err: any) {
      setHtmlError(err.message || 'Failed to export HTML as PDF document.');
    } finally {
      setIsGeneratingHtmlPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
            <Camera className="w-5 h-5 text-emerald-400" />
            <span>Local Capture & HTML to PDF Studio</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Capture browser tabs and window screenshots client-side via getDisplayMedia or compile HTML files into PDFs.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg border border-zinc-800 bg-zinc-900/60">
          <button
            type="button"
            onClick={() => setActiveTab('screen')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === 'screen'
                ? 'bg-zinc-100 text-zinc-950 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Monitor className="w-3.5 h-3.5 text-emerald-400" />
            <span>Tab / Screen Capture</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('html')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === 'html'
                ? 'bg-zinc-100 text-zinc-950 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5 text-sky-400" />
            <span>HTML to PDF</span>
          </button>
        </div>
      </div>

      {/* ======================= TAB 1: SCREEN CAPTURE ======================= */}
      {activeTab === 'screen' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-emerald-400" />
                  Client-Side Webpage & Screen Capture
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Prompts the browser's native picker to snapshot any open tab, window, or display without server proxies.
                </p>
              </div>

              <Button
                onClick={handleCaptureScreen}
                loading={isCapturing}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-9 shrink-0 shadow-lg shadow-emerald-950/40"
              >
                <Camera className="w-3.5 h-3.5 mr-1.5" />
                Capture Active Tab or Screen
              </Button>
            </div>

            {/* Captured Image Area */}
            {capturedDataUrl && capturedDims ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-mono text-zinc-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>
                        Snapshot Captured: {capturedDims.width} × {capturedDims.height} px ({formatBytes(capturedBlob?.size || 0)})
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          if (capturedBlob) downloadBlob(capturedBlob, `capture_${Date.now()}.png`);
                        }}
                        className="text-xs h-8 bg-emerald-600 hover:bg-emerald-500 text-white"
                      >
                        <Download className="w-3.5 h-3.5 mr-1" />
                        Download PNG
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportScreenPdf}
                        loading={isExportingPdf}
                        className="text-xs h-8"
                      >
                        <Download className="w-3.5 h-3.5 mr-1" />
                        Export PDF
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2 overflow-hidden flex items-center justify-center max-h-[460px]">
                    <img
                      src={capturedDataUrl}
                      alt="Captured Display Frame"
                      className="max-h-[440px] w-auto object-contain rounded shadow-lg"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 p-6 rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40">
                <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400">
                  <Camera className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-200">No screen capture in buffer</p>
                  <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                    Click "Capture Active Tab or Screen" above to pick a browser tab or application window to snapshot.
                  </p>
                </div>
              </div>
            )}
          </div>

          {screenError && (
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-800 text-red-200 text-xs flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <span>{screenError}</span>
            </div>
          )}
        </div>
      )}

      {/* ======================= TAB 2: HTML TO PDF ======================= */}
      {activeTab === 'html' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200">HTML Code & File to PDF Converter</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Compile static HTML markup or dropped .html files into clean PDF documents.
                </p>
              </div>

              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".html,.htm"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setHtmlFile(f);
                      setHtmlDocTitle(f.name.replace(/\.[^/.]+$/, ''));
                      const text = await f.text();
                      setHtmlCode(text);
                      setHtmlPdfBlob(null);
                    }
                  }}
                  className="hidden"
                />
                <Button variant="outline" size="sm" className="text-xs h-8">
                  <FileCode className="w-3.5 h-3.5 mr-1.5" />
                  Load .HTML File
                </Button>
              </label>
            </div>

            {htmlFile && (
              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 flex items-center justify-between">
                <span>Loaded file: <strong className="text-emerald-400 font-mono">{htmlFile.name}</strong> ({formatBytes(htmlFile.size)})</span>
                <button
                  type="button"
                  onClick={() => setHtmlFile(null)}
                  className="text-zinc-500 hover:text-zinc-300 text-[11px]"
                >
                  Clear File
                </button>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-300">Document Title</label>
              <input
                type="text"
                value={htmlDocTitle}
                onChange={(e) => setHtmlDocTitle(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-300">Raw HTML Markup</label>
                <textarea
                  value={htmlCode}
                  onChange={(e) => {
                    setHtmlCode(e.target.value);
                    setHtmlPdfBlob(null);
                  }}
                  rows={12}
                  className="w-full p-3 text-xs font-mono bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-300 resize-y focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  Sandboxed Frame Preview
                </label>
                <div className="h-[238px] rounded-lg border border-zinc-800 bg-white overflow-hidden">
                  <iframe
                    title="HTML Preview Sandbox"
                    sandbox="allow-same-origin"
                    srcDoc={htmlCode}
                    className="w-full h-full border-0"
                  />
                </div>
              </div>
            </div>

            {!htmlPdfBlob && (
              <Button
                onClick={handleGenerateHtmlPdf}
                loading={isGeneratingHtmlPdf}
                disabled={!htmlCode.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Compile and Export PDF Document
              </Button>
            )}

            {htmlPdfBlob && (
              <div className="p-4 rounded-xl border border-emerald-900/60 bg-emerald-950/30 flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-300 text-xs font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>PDF Document is ready ({formatBytes(htmlPdfBlob.size)})</span>
                </div>
                <Button
                  size="sm"
                  onClick={() => downloadBlob(htmlPdfBlob, `${htmlDocTitle.replace(/\s+/g, '_')}.pdf`)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8"
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Download PDF
                </Button>
              </div>
            )}
          </div>

          {htmlError && (
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-800 text-red-200 text-xs flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <span>{htmlError}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default CaptureTools;
