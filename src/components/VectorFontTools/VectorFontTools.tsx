import React, { useState, useEffect, useRef } from 'react';
import {
  Type,
  FileCode,
  Sparkles,
  Download,
  AlertCircle,
  CheckCircle2,
  Layers,
  Copy,
  Check,
  Eye,
} from 'lucide-react';
import { Dropzone } from '../ui/Dropzone';
import { Button } from '../ui/Button';
import { formatBytes, downloadBlob } from '../../utils/fileUtils';
import {
  inspectFont,
  convertFont,
  type FontMetadata,
  type FontTargetFormat,
  type ConvertedFontResult,
} from '../../engine/font/fontConverter';
import {
  traceBitmapToSvg,
  optimizeSvgString,
  type VectorTraceResult,
  type SvgOptimizeResult,
} from '../../engine/vector/vectorEngine';

export interface VectorFontToolsProps {
  initialTab?: 'font' | 'vector' | 'svgo';
  filterTabs?: ('font' | 'vector' | 'svgo')[];
}

export const VectorFontTools: React.FC<VectorFontToolsProps> = ({ initialTab, filterTabs }) => {
  const [selectedTab, setSelectedTab] = useState<'font' | 'vector' | 'svgo' | null>(null);
  const activeTab = selectedTab || initialTab || (filterTabs && filterTabs[0]) || 'font';
  const setActiveTab = (tab: 'font' | 'vector' | 'svgo') => setSelectedTab(tab);

  // ===================== FONT CONVERTER STATE =====================
  const [fontFile, setFontFile] = useState<File | null>(null);
  const [fontMeta, setFontMeta] = useState<FontMetadata | null>(null);
  const [fontFamilyName, setFontFamilyName] = useState<string>('');
  const [previewText, setPreviewText] = useState('The quick brown fox jumps over the lazy dog 1234567890');
  const [fontSize, setFontSize] = useState(28);
  const [targetFontFormat, setTargetFontFormat] = useState<FontTargetFormat>('woff2');
  const [isConvertingFont, setIsConvertingFont] = useState(false);
  const [convertedFont, setConvertedFont] = useState<ConvertedFontResult | null>(null);
  const [fontError, setFontError] = useState<string | null>(null);
  const fontStyleRef = useRef<HTMLStyleElement | null>(null);

  // ===================== VECTOR TRACER STATE =====================
  const [bitmapFile, setBitmapFile] = useState<File | null>(null);
  const [bitmapPreviewUrl, setBitmapPreviewUrl] = useState<string | null>(null);
  const [traceThreshold, setTraceThreshold] = useState(128);
  const [traceColor, setTraceColor] = useState('#000000');
  const [traceOptCurve, setTraceOptCurve] = useState(true);
  const [isTracing, setIsTracing] = useState(false);
  const [traceResult, setTraceResult] = useState<VectorTraceResult | null>(null);
  const [traceError, setTraceError] = useState<string | null>(null);

  // ===================== SVG OPTIMIZER STATE =====================
  const [svgInputCode, setSvgInputCode] = useState('');
  const [svgoResult, setSvgoResult] = useState<SvgOptimizeResult | null>(null);
  const [copiedSvg, setCopiedSvg] = useState(false);
  const [svgoError, setSvgoError] = useState<string | null>(null);

  // Cleanup font face and object URLs
  useEffect(() => {
    return () => {
      if (fontStyleRef.current && fontStyleRef.current.parentNode) {
        fontStyleRef.current.parentNode.removeChild(fontStyleRef.current);
      }
      if (bitmapPreviewUrl) {
        URL.revokeObjectURL(bitmapPreviewUrl);
      }
    };
  }, [bitmapPreviewUrl]);

  // Load and inspect font
  const handleFontSelect = async (file: File) => {
    setFontFile(file);
    setFontMeta(null);
    setConvertedFont(null);
    setFontError(null);

    try {
      const buffer = await file.arrayBuffer();
      const meta = await inspectFont(buffer);
      setFontMeta(meta);

      // Register dynamic @font-face for specimen preview
      const familyId = `CustomFont_${Date.now()}`;
      setFontFamilyName(familyId);

      const fontBlobUrl = URL.createObjectURL(file);
      const styleEl = document.createElement('style');
      styleEl.textContent = `
        @font-face {
          font-family: '${familyId}';
          src: url('${fontBlobUrl}');
        }
      `;
      document.head.appendChild(styleEl);
      if (fontStyleRef.current && fontStyleRef.current.parentNode) {
        fontStyleRef.current.parentNode.removeChild(fontStyleRef.current);
      }
      fontStyleRef.current = styleEl;
    } catch (err: any) {
      setFontError(err.message || 'Failed to parse font file. Ensure it is a valid TTF, OTF, WOFF, or WOFF2.');
    }
  };

  const handleConvertFont = async () => {
    if (!fontFile) return;
    setIsConvertingFont(true);
    setFontError(null);

    try {
      const buffer = await fontFile.arrayBuffer();
      const result = await convertFont(buffer, fontFile.name, targetFontFormat);
      setConvertedFont(result);
    } catch (err: any) {
      setFontError(err.message || 'Font conversion failed.');
    } finally {
      setIsConvertingFont(false);
    }
  };

  // Load and trace bitmap
  const handleBitmapSelect = (file: File) => {
    setBitmapFile(file);
    setTraceResult(null);
    setTraceError(null);
    if (bitmapPreviewUrl) URL.revokeObjectURL(bitmapPreviewUrl);
    setBitmapPreviewUrl(URL.createObjectURL(file));
  };

  const handleTraceBitmap = async () => {
    if (!bitmapFile) return;
    setIsTracing(true);
    setTraceError(null);

    try {
      const res = await traceBitmapToSvg(bitmapFile, {
        threshold: traceThreshold,
        color: traceColor,
        optCurve: traceOptCurve,
      });
      setTraceResult(res);
    } catch (err: any) {
      setTraceError(err.message || 'Vector tracing failed.');
    } finally {
      setIsTracing(false);
    }
  };

  // SVGO Optimize
  const handleSvgoOptimize = () => {
    if (!svgInputCode.trim()) return;
    setSvgoError(null);
    try {
      const res = optimizeSvgString(svgInputCode);
      setSvgoResult(res);
    } catch (err: any) {
      setSvgoError(err.message || 'Failed to optimize SVG code.');
    }
  };

  const handleCopyOptimizedSvg = async () => {
    if (!svgoResult) return;
    await navigator.clipboard.writeText(svgoResult.optimizedSvg);
    setCopiedSvg(true);
    setTimeout(() => setCopiedSvg(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
            <Type className="w-5 h-5 text-emerald-400" />
            <span>
              {filterTabs?.includes('font') && filterTabs.length === 1
                ? 'Font Converter & Typography Inspector'
                : filterTabs && !filterTabs.includes('font')
                ? 'Vector Tracing & SVG Optimizer'
                : 'Fonts, Vectors & SVG Studio'}
            </span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            {filterTabs?.includes('font') && filterTabs.length === 1
              ? 'Inspect font metrics, preview typography in real-time, and convert between TTF, OTF, WOFF, and WOFF2.'
              : filterTabs && !filterTabs.includes('font')
              ? 'Trace bitmap images to scalable vector SVGs using Potrace WASM and sanitize/minify SVGs via SVGO.'
              : 'Convert TTF/OTF/WOFF/WOFF2 web fonts, trace raster images to scalable SVG vectors, and optimize SVG assets.'}
          </p>
        </div>

        {/* Tab Controls - only show if multiple tabs permitted */}
        {(!filterTabs || filterTabs.length > 1) && (
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg border border-zinc-800 bg-zinc-900/60">
            {(!filterTabs || filterTabs.includes('font')) && (
              <button
                type="button"
                onClick={() => setActiveTab('font')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                  activeTab === 'font'
                    ? 'bg-zinc-100 text-zinc-950 font-semibold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Type className="w-3.5 h-3.5 text-emerald-400" />
                <span>Font Converter</span>
              </button>
            )}
            {(!filterTabs || filterTabs.includes('vector')) && (
              <button
                type="button"
                onClick={() => setActiveTab('vector')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                  activeTab === 'vector'
                    ? 'bg-zinc-100 text-zinc-950 font-semibold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-sky-400" />
                <span>Vector Tracing</span>
              </button>
            )}
            {(!filterTabs || filterTabs.includes('svgo')) && (
              <button
                type="button"
                onClick={() => setActiveTab('svgo')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                  activeTab === 'svgo'
                    ? 'bg-zinc-100 text-zinc-950 font-semibold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>SVG Optimizer</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ======================= TAB 1: FONT CONVERTER ======================= */}
      {activeTab === 'font' && (
        <div className="space-y-6">
          {!fontFile ? (
            <Dropzone
              onFilesSelected={(files: File[]) => files[0] && handleFontSelect(files[0])}
              accept=".ttf,.otf,.woff,.woff2,font/*"
              multiple={false}
              title="Drag and drop a font file to convert & inspect"
              subtitle="Supports TTF, OTF, WOFF, and WOFF2 formats"
            />
          ) : (
            <div className="space-y-5">
              {/* File Info & Metadata Card */}
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center text-emerald-400">
                      <Type className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-zinc-100">
                        {fontMeta?.familyName || fontFile.name}
                      </h4>
                      <p className="text-xs text-zinc-400">
                        {fontMeta?.styleName || 'Regular'} · {formatBytes(fontFile.size)} · Input:{' '}
                        <span className="font-mono uppercase font-bold text-emerald-400">
                          {fontMeta?.format || 'FONT'}
                        </span>
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFontFile(null);
                      setFontMeta(null);
                      setConvertedFont(null);
                    }}
                    className="text-zinc-400 hover:text-zinc-200"
                  >
                    Change Font
                  </Button>
                </div>

                {/* Metadata Grid */}
                {fontMeta && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800">
                      <span className="text-zinc-500 block text-[11px]">Glyph Count</span>
                      <span className="font-mono font-semibold text-zinc-200">{fontMeta.numGlyphs} glyphs</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800">
                      <span className="text-zinc-500 block text-[11px]">Units Per Em</span>
                      <span className="font-mono font-semibold text-zinc-200">{fontMeta.unitsPerEm}</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800">
                      <span className="text-zinc-500 block text-[11px]">PostScript Name</span>
                      <span className="font-mono font-semibold text-zinc-200 truncate block">
                        {fontMeta.postScriptName}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800">
                      <span className="text-zinc-500 block text-[11px]">Version</span>
                      <span className="font-mono font-semibold text-zinc-200 truncate block">
                        {fontMeta.version || '1.000'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Live Specimen Preview */}
                <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800/80 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-emerald-400" />
                      Live Specimen & Glyph Render
                    </label>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-zinc-500">{fontSize}px</span>
                      <input
                        type="range"
                        min="14"
                        max="64"
                        value={fontSize}
                        onChange={(e) => setFontSize(Number(e.target.value))}
                        className="w-28 accent-emerald-500"
                      />
                    </div>
                  </div>
                  <input
                    type="text"
                    value={previewText}
                    onChange={(e) => setPreviewText(e.target.value)}
                    placeholder="Type custom test phrase..."
                    className="w-full px-3 py-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-300 focus:outline-none"
                  />
                  <div
                    className="p-4 rounded-lg bg-zinc-900/40 border border-zinc-800/60 text-zinc-100 min-h-[90px] flex items-center justify-center text-center break-words overflow-x-auto"
                    style={{
                      fontFamily: fontFamilyName ? `'${fontFamilyName}', sans-serif` : 'sans-serif',
                      fontSize: `${fontSize}px`,
                      lineHeight: 1.3,
                    }}
                  >
                    {previewText || 'The quick brown fox jumps over the lazy dog'}
                  </div>
                </div>

                {/* Target Format Selector */}
                <div className="p-4 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-3">
                  <label className="text-xs font-semibold text-zinc-300">Select Target Web Format:</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'woff2' as const, label: 'WOFF2 (Next-Gen Web)', badge: 'RECOMMENDED' },
                      { id: 'woff' as const, label: 'WOFF (Legacy Web)' },
                      { id: 'ttf' as const, label: 'TTF (TrueType)' },
                      { id: 'otf' as const, label: 'OTF (OpenType CFF)' },
                    ].map((fmt) => (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => setTargetFontFormat(fmt.id)}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          targetFontFormat === fmt.id
                            ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300 font-semibold shadow-sm'
                            : 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                        }`}
                      >
                        <div className="text-xs uppercase font-mono font-bold">{fmt.id}</div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">{fmt.label}</div>
                      </button>
                    ))}
                  </div>

                  {!convertedFont && !isConvertingFont && (
                    <Button
                      onClick={handleConvertFont}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium mt-3"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Convert to {targetFontFormat.toUpperCase()}
                    </Button>
                  )}

                  {isConvertingFont && (
                    <div className="py-3 text-center text-xs font-mono text-emerald-400 animate-pulse">
                      Re-encoding font tables and compressing WebAssembly bytes...
                    </div>
                  )}

                  {convertedFont && (
                    <div className="p-4 rounded-xl border border-emerald-900/60 bg-emerald-950/30 flex items-center justify-between mt-3">
                      <div className="flex items-center gap-2 text-emerald-300 text-xs font-medium">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>
                          {convertedFont.fileName} ({formatBytes(convertedFont.size)})
                        </span>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => downloadBlob(convertedFont.blob, convertedFont.fileName)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8"
                      >
                        <Download className="w-3.5 h-3.5 mr-1.5" />
                        Download {convertedFont.format.toUpperCase()}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {fontError && (
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-800 text-red-200 text-xs flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <span>{fontError}</span>
            </div>
          )}
        </div>
      )}

      {/* ======================= TAB 2: VECTOR TRACING ======================= */}
      {activeTab === 'vector' && (
        <div className="space-y-6">
          {!bitmapFile ? (
            <Dropzone
              onFilesSelected={(files: File[]) => files[0] && handleBitmapSelect(files[0])}
              accept=".png,.jpg,.jpeg,.webp,image/*"
              multiple={false}
              title="Drag and drop a PNG or JPEG to trace into vector SVG"
              subtitle="Powered by Potrace WebAssembly algorithm for ultra-clean bezier curves"
            />
          ) : (
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-zinc-200">{bitmapFile.name}</h4>
                  <p className="text-xs text-zinc-500 font-mono">{formatBytes(bitmapFile.size)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBitmapFile(null);
                    setTraceResult(null);
                  }}
                  className="text-zinc-400 hover:text-zinc-200"
                >
                  Change Image
                </Button>
              </div>

              {/* Tracing Controls */}
              <div className="p-4 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300 flex justify-between">
                      <span>Brightness Threshold</span>
                      <span className="text-zinc-500 font-mono">{traceThreshold}</span>
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="245"
                      value={traceThreshold}
                      onChange={(e) => setTraceThreshold(Number(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300">Vector Fill Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={traceColor}
                        onChange={(e) => setTraceColor(e.target.value)}
                        className="w-8 h-8 rounded border border-zinc-700 cursor-pointer bg-transparent"
                      />
                      <span className="text-xs font-mono text-zinc-400">{traceColor.toUpperCase()}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5 flex flex-col justify-center">
                    <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={traceOptCurve}
                        onChange={(e) => setTraceOptCurve(e.target.checked)}
                        className="rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500"
                      />
                      <span>Optimize Bezier Curves</span>
                    </label>
                  </div>
                </div>

                {!traceResult && !isTracing && (
                  <Button
                    onClick={handleTraceBitmap}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                  >
                    <Layers className="w-4 h-4 mr-2" />
                    Trace into Scalable SVG Vector
                  </Button>
                )}

                {isTracing && (
                  <div className="py-2 text-center text-xs font-mono text-emerald-400 animate-pulse">
                    Computing path contours and bezier fits in WebAssembly...
                  </div>
                )}
              </div>

              {/* Side-by-Side Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800 text-center space-y-2">
                  <span className="text-xs font-medium text-zinc-400">Original Raster Bitmap</span>
                  <div className="h-64 flex items-center justify-center overflow-hidden rounded bg-zinc-900/40 p-2">
                    {bitmapPreviewUrl && (
                      <img src={bitmapPreviewUrl} alt="Original" className="max-h-full max-w-full object-contain" />
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800 text-center space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-medium text-zinc-400">Traced Scalable SVG</span>
                    {traceResult && (
                      <Button
                        size="sm"
                        onClick={() => {
                          const base = bitmapFile.name.replace(/\.[^/.]+$/, '');
                          downloadBlob(traceResult.blob, `${base}_vector.svg`);
                        }}
                        className="h-6 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white"
                      >
                        <Download className="w-3 h-3 mr-1" />
                        Download SVG
                      </Button>
                    )}
                  </div>
                  <div className="h-64 flex items-center justify-center overflow-hidden rounded bg-zinc-900/40 p-2">
                    {traceResult ? (
                      <div
                        className="max-h-full max-w-full [&>svg]:max-h-60 [&>svg]:w-auto"
                        dangerouslySetInnerHTML={{ __html: traceResult.svg }}
                      />
                    ) : (
                      <span className="text-xs text-zinc-600 font-mono">Trace output will appear here</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {traceError && (
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-800 text-red-200 text-xs flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <span>{traceError}</span>
            </div>
          )}
        </div>
      )}

      {/* ======================= TAB 3: SVG OPTIMIZER ======================= */}
      {activeTab === 'svgo' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200">SVG Minification & Path Optimizer</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Strip redundant metadata, simplify precision, and compress SVG markup client-side using SVGO.
                </p>
              </div>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".svg,image/svg+xml"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      const text = await f.text();
                      setSvgInputCode(text);
                      setSvgoResult(null);
                    }
                  }}
                  className="hidden"
                />
                <Button variant="outline" size="sm" className="text-xs h-8">
                  <FileCode className="w-3.5 h-3.5 mr-1.5" />
                  Load .SVG File
                </Button>
              </label>
            </div>

            <textarea
              value={svgInputCode}
              onChange={(e) => {
                setSvgInputCode(e.target.value);
                setSvgoResult(null);
              }}
              rows={8}
              placeholder="Paste raw <svg> markup here..."
              className="w-full p-3 text-xs font-mono bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-300 resize-y focus:outline-none focus:border-zinc-700"
            />

            <Button
              onClick={handleSvgoOptimize}
              disabled={!svgInputCode.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Optimize and Minify SVG
            </Button>
          </div>

          {svgoResult && (
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-emerald-300">
                      Optimized Successfully ({svgoResult.savingsPercent}% size reduction)
                    </h4>
                    <p className="text-xs font-mono text-zinc-400">
                      {formatBytes(svgoResult.originalSize)} → {formatBytes(svgoResult.optimizedSize)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopyOptimizedSvg} className="text-xs h-8">
                    {copiedSvg ? <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                    {copiedSvg ? 'Copied' : 'Copy SVG'}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => downloadBlob(svgoResult.blob, 'optimized.svg')}
                    className="text-xs h-8 bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    <Download className="w-3.5 h-3.5 mr-1" />
                    Download SVG
                  </Button>
                </div>
              </div>

              {/* Preview */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-zinc-400">Minified Markup</span>
                  <textarea
                    readOnly
                    value={svgoResult.optimizedSvg}
                    rows={6}
                    className="w-full p-2.5 text-xs font-mono bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-300 resize-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-zinc-400">Render Preview</span>
                  <div className="h-36 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center p-3 overflow-hidden [&>svg]:max-h-28 [&>svg]:w-auto">
                    <div dangerouslySetInnerHTML={{ __html: svgoResult.optimizedSvg }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {svgoError && (
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-800 text-red-200 text-xs flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <span>{svgoError}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default VectorFontTools;
