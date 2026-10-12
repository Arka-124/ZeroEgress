import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Download,
  UploadCloud,
  Type,
  Image as ImageIcon,
  Trash2,
  Layers,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Slider } from '../ui/Slider';
import { formatBytes, downloadBlob } from '../../utils/fileUtils';
import { urlRegistry } from '../../utils/urlRegistry';

type WatermarkMode = 'text' | 'image';
type PositionPreset =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'tile';

export const ImageWatermark: React.FC = () => {
  const [sourceImageFile, setSourceImageFile] = useState<File | null>(null);
  const [sourceImageElement, setSourceImageElement] = useState<HTMLImageElement | null>(null);
  const [sourceDimensions, setSourceDimensions] = useState<{ width: number; height: number } | null>(null);

  // Watermark parameters
  const [mode, setMode] = useState<WatermarkMode>('text');
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [fontFamily, setFontFamily] = useState('sans-serif');
  const [fontSizeRatio, setFontSizeRatio] = useState(5); // % of image width
  const [textColor, setTextColor] = useState('#ffffff');
  const [isBold, setIsBold] = useState(true);
  const [hasOutline, setHasOutline] = useState(true);
  const [outlineColor, setOutlineColor] = useState('#000000');

  // Logo watermark
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoElement, setLogoElement] = useState<HTMLImageElement | null>(null);
  const [logoScale, setLogoScale] = useState(25); // % of image width

  // Common adjustments
  const [opacity, setOpacity] = useState(65); // 0-100%
  const [rotation, setRotation] = useState(-30); // -180 to 180 degrees
  const [position, setPosition] = useState<PositionPreset>('center');
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  // Export options
  const [exportFormat, setExportFormat] = useState<'image/png' | 'image/jpeg' | 'image/webp'>('image/png');
  const [exportQuality, setExportQuality] = useState(90);
  const [isExporting, setIsExporting] = useState(false);

  // Canvas Refs
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  // Load Source Image
  const handleLoadSourceFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const url = urlRegistry.create(file);
    const img = new Image();
    img.onload = () => {
      setSourceImageFile(file);
      setSourceImageElement(img);
      setSourceDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = url;
  }, []);

  // Load Logo Image
  const handleLoadLogoFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const url = urlRegistry.create(file);
    const img = new Image();
    img.onload = () => {
      setLogoFile(file);
      setLogoElement(img);
    };
    img.src = url;
  }, []);

  // Global drop listener
  useEffect(() => {
    const handleGlobalDrop = (e: Event) => {
      const customEvent = e as CustomEvent<File[]>;
      const files = customEvent.detail;
      if (!files || files.length === 0) return;
      const file = files[0];
      if (file.type.startsWith('image/')) {
        handleLoadSourceFile(file);
      }
    };
    window.addEventListener('zeroegress:files-dropped', handleGlobalDrop as EventListener);
    return () => {
      window.removeEventListener('zeroegress:files-dropped', handleGlobalDrop as EventListener);
    };
  }, [handleLoadSourceFile]);

  // Clean up object URLs
  useEffect(() => {
    return () => {
      if (sourceImageElement?.src) urlRegistry.revoke(sourceImageElement.src);
      if (logoElement?.src) urlRegistry.revoke(logoElement.src);
    };
  }, [sourceImageElement, logoElement]);

  // Render Watermark Canvas
  const renderCanvas = useCallback(
    (targetCanvas: HTMLCanvasElement) => {
      if (!sourceImageElement || !sourceDimensions) return;

      const imgWidth = sourceDimensions.width;
      const imgHeight = sourceDimensions.height;

      targetCanvas.width = imgWidth;
      targetCanvas.height = imgHeight;

      const ctx = targetCanvas.getContext('2d');
      if (!ctx) return;

      // Draw background source image
      ctx.clearRect(0, 0, imgWidth, imgHeight);
      ctx.drawImage(sourceImageElement, 0, 0, imgWidth, imgHeight);

      // Watermark setup
      ctx.save();
      ctx.globalAlpha = opacity / 100;

      const rad = (rotation * Math.PI) / 180;

      if (position === 'tile') {
        // Tiling pattern
        const stepX = Math.max(120, imgWidth / 4);
        const stepY = Math.max(120, imgHeight / 4);

        if (mode === 'text' && watermarkText.trim()) {
          const fontSize = Math.max(16, (imgWidth * fontSizeRatio) / 100);
          ctx.font = `${isBold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          for (let x = -imgWidth / 2; x < imgWidth * 1.5; x += stepX) {
            for (let y = -imgHeight / 2; y < imgHeight * 1.5; y += stepY) {
              ctx.save();
              ctx.translate(x + offsetX, y + offsetY);
              ctx.rotate(rad);
              if (hasOutline) {
                ctx.strokeStyle = outlineColor;
                ctx.lineWidth = Math.max(2, fontSize / 12);
                ctx.strokeText(watermarkText, 0, 0);
              }
              ctx.fillStyle = textColor;
              ctx.fillText(watermarkText, 0, 0);
              ctx.restore();
            }
          }
        } else if (mode === 'image' && logoElement) {
          const targetW = (imgWidth * logoScale) / 100;
          const targetH = (logoElement.naturalHeight / logoElement.naturalWidth) * targetW;

          for (let x = -imgWidth / 2; x < imgWidth * 1.5; x += stepX * 1.5) {
            for (let y = -imgHeight / 2; y < imgHeight * 1.5; y += stepY * 1.5) {
              ctx.save();
              ctx.translate(x + offsetX, y + offsetY);
              ctx.rotate(rad);
              ctx.drawImage(logoElement, -targetW / 2, -targetH / 2, targetW, targetH);
              ctx.restore();
            }
          }
        }
      } else {
        // Positioned watermark
        let posX = imgWidth / 2;
        let posY = imgHeight / 2;
        const padding = Math.min(imgWidth, imgHeight) * 0.05;

        switch (position) {
          case 'top-left':
            posX = padding;
            posY = padding;
            break;
          case 'top-center':
            posX = imgWidth / 2;
            posY = padding;
            break;
          case 'top-right':
            posX = imgWidth - padding;
            posY = padding;
            break;
          case 'center-left':
            posX = padding;
            posY = imgHeight / 2;
            break;
          case 'center':
            posX = imgWidth / 2;
            posY = imgHeight / 2;
            break;
          case 'center-right':
            posX = imgWidth - padding;
            posY = imgHeight / 2;
            break;
          case 'bottom-left':
            posX = padding;
            posY = imgHeight - padding;
            break;
          case 'bottom-center':
            posX = imgWidth / 2;
            posY = imgHeight - padding;
            break;
          case 'bottom-right':
            posX = imgWidth - padding;
            posY = imgHeight - padding;
            break;
        }

        posX += offsetX;
        posY += offsetY;

        ctx.translate(posX, posY);
        ctx.rotate(rad);

        if (mode === 'text' && watermarkText.trim()) {
          const fontSize = Math.max(16, (imgWidth * fontSizeRatio) / 100);
          ctx.font = `${isBold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          if (hasOutline) {
            ctx.strokeStyle = outlineColor;
            ctx.lineWidth = Math.max(2, fontSize / 12);
            ctx.strokeText(watermarkText, 0, 0);
          }
          ctx.fillStyle = textColor;
          ctx.fillText(watermarkText, 0, 0);
        } else if (mode === 'image' && logoElement) {
          const targetW = (imgWidth * logoScale) / 100;
          const targetH = (logoElement.naturalHeight / logoElement.naturalWidth) * targetW;
          ctx.drawImage(logoElement, -targetW / 2, -targetH / 2, targetW, targetH);
        }
      }

      ctx.restore();
    },
    [
      sourceImageElement,
      sourceDimensions,
      mode,
      watermarkText,
      fontFamily,
      fontSizeRatio,
      textColor,
      isBold,
      hasOutline,
      outlineColor,
      logoElement,
      logoScale,
      opacity,
      rotation,
      position,
      offsetX,
      offsetY,
    ]
  );

  // Auto-render live preview
  useEffect(() => {
    if (previewCanvasRef.current && sourceImageElement) {
      renderCanvas(previewCanvasRef.current);
    }
  }, [renderCanvas, sourceImageElement]);

  // Handle Export / Download
  const handleExport = async () => {
    if (!sourceImageElement || !sourceDimensions || !sourceImageFile) return;
    setIsExporting(true);

    try {
      const exportCanvas = document.createElement('canvas');
      renderCanvas(exportCanvas);

      const mimeType = exportFormat;
      const qualityRatio = exportQuality / 100;

      exportCanvas.toBlob(
        (blob) => {
          if (!blob) {
            setIsExporting(false);
            return;
          }
          const baseName = sourceImageFile.name.replace(/\.[^/.]+$/, '');
          const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
          downloadBlob(blob, `${baseName}-watermarked.${ext}`);
          setIsExporting(false);
        },
        mimeType,
        qualityRatio
      );
    } catch (err) {
      console.error('Failed to export watermarked image:', err);
      setIsExporting(false);
    }
  };

  const handleClear = () => {
    if (sourceImageElement?.src) urlRegistry.revoke(sourceImageElement.src);
    if (logoElement?.src) urlRegistry.revoke(logoElement.src);
    setSourceImageFile(null);
    setSourceImageElement(null);
    setSourceDimensions(null);
    setLogoFile(null);
    setLogoElement(null);
  };

  return (
    <div className="space-y-6 w-full">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            <span>Image Watermark Studio</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Stamp customizable text or logo watermarks onto high-resolution images with real-time hardware canvas rendering.
          </p>
        </div>

        {sourceImageFile && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleClear} icon={<Trash2 className="w-4 h-4 text-red-400" />}>
              Clear
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleExport}
              loading={isExporting}
              icon={<Download className="w-4 h-4" />}
            >
              Export Watermarked
            </Button>
          </div>
        )}
      </div>

      {/* Main Workspace */}
      {!sourceImageFile ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="group relative rounded-2xl border-2 border-dashed border-zinc-800 hover:border-zinc-700 bg-zinc-900/30 hover:bg-zinc-900/50 transition-all duration-200 p-12 flex flex-col items-center justify-center text-center cursor-pointer min-h-[320px]"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleLoadSourceFile(file);
              e.target.value = '';
            }}
            className="hidden"
          />
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-zinc-100 group-hover:scale-105 transition-all shadow-md mb-4">
            <UploadCloud className="w-8 h-8" />
          </div>
          <h3 className="text-base font-semibold text-zinc-100 mb-1">
            Drop an image here, or click to browse
          </h3>
          <p className="text-xs text-zinc-400 max-w-sm">
            Supports PNG, JPG, WebP, AVIF, BMP, and GIF. Rendered 100% in-browser with zero uploads.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Canvas Preview (Spans 7 cols on desktop) */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-mono px-1">
              <span>{sourceImageFile.name}</span>
              <span>
                {sourceDimensions?.width} × {sourceDimensions?.height} px · {formatBytes(sourceImageFile.size)}
              </span>
            </div>

            <div className="relative rounded-2xl border border-zinc-800 bg-zinc-950/80 p-3 overflow-hidden flex items-center justify-center min-h-[380px] max-h-[580px]">
              <canvas
                ref={previewCanvasRef}
                className="max-w-full max-h-[540px] w-auto h-auto rounded-lg object-contain shadow-2xl"
              />
            </div>
          </div>

          {/* Right Controls Panel (Spans 5 cols on desktop) */}
          <div className="lg:col-span-5 space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            {/* Mode Switcher */}
            <div className="flex rounded-xl bg-zinc-900/90 p-1 border border-zinc-800">
              <button
                type="button"
                onClick={() => setMode('text')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  mode === 'text'
                    ? 'bg-zinc-100 text-zinc-950 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                <span>Text Watermark</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('image')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  mode === 'image'
                    ? 'bg-zinc-100 text-zinc-950 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Logo / Graphic</span>
              </button>
            </div>

            {/* Mode-Specific Settings */}
            {mode === 'text' ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-zinc-300 block mb-1.5">Watermark Text</label>
                  <input
                    type="text"
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    placeholder="e.g. COPYRIGHT © 2026"
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1.5">Font Family</label>
                    <select
                      value={fontFamily}
                      onChange={(e) => setFontFamily(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 cursor-pointer"
                    >
                      <option value="sans-serif">Sans-Serif (Clean)</option>
                      <option value="serif">Serif (Formal)</option>
                      <option value="monospace">Monospace (Code)</option>
                      <option value="Impact">Impact (Heavy)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1.5">Text Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        className="w-8 h-8 rounded bg-transparent border border-zinc-700 cursor-pointer"
                      />
                      <span className="text-xs font-mono text-zinc-400 uppercase">{textColor}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 pt-1">
                  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isBold}
                      onChange={(e) => setIsBold(e.target.checked)}
                      className="rounded bg-zinc-900 border-zinc-700 text-indigo-500 focus:ring-0"
                    />
                    <span>Bold weight</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasOutline}
                      onChange={(e) => setHasOutline(e.target.checked)}
                      className="rounded bg-zinc-900 border-zinc-700 text-indigo-500 focus:ring-0"
                    />
                    <span>High-contrast outline</span>
                  </label>
                  {hasOutline && (
                    <input
                      type="color"
                      value={outlineColor}
                      onChange={(e) => setOutlineColor(e.target.value)}
                      className="w-5 h-5 rounded bg-transparent border border-zinc-700 cursor-pointer"
                      title="Outline color"
                    />
                  )}
                </div>

                <Slider
                  label="Text Scale"
                  value={fontSizeRatio}
                  min={1}
                  max={25}
                  step={0.5}
                  unit="% of image"
                  onChange={setFontSizeRatio}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-zinc-300 block mb-1.5">Logo Graphic (PNG/SVG/JPG)</label>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleLoadLogoFile(file);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                  <div
                    onClick={() => logoInputRef.current?.click()}
                    className="p-3 rounded-lg border border-dashed border-zinc-700 hover:border-zinc-500 bg-zinc-900/60 flex items-center justify-between cursor-pointer"
                  >
                    <span className="text-xs text-zinc-300 truncate">
                      {logoFile ? logoFile.name : 'Choose watermark graphic...'}
                    </span>
                    <Button variant="secondary" size="sm" type="button">
                      Browse
                    </Button>
                  </div>
                </div>

                <Slider
                  label="Logo Scale"
                  value={logoScale}
                  min={5}
                  max={75}
                  step={1}
                  unit="% width"
                  onChange={setLogoScale}
                />
              </div>
            )}

            {/* Position & Placement Controls */}
            <div className="space-y-3 pt-2 border-t border-zinc-800">
              <label className="text-xs font-medium text-zinc-300 block">Position Placement</label>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: 'top-left', label: 'TL' },
                  { id: 'top-center', label: 'TC' },
                  { id: 'top-right', label: 'TR' },
                  { id: 'tile', label: 'Tile (All)' },
                  { id: 'center-left', label: 'CL' },
                  { id: 'center', label: 'Center' },
                  { id: 'center-right', label: 'CR' },
                  { id: 'bottom-left', label: 'BL' },
                  { id: 'bottom-center', label: 'BC' },
                  { id: 'bottom-right', label: 'BR' },
                ].map((pos) => (
                  <button
                    key={pos.id}
                    type="button"
                    onClick={() => setPosition(pos.id as PositionPreset)}
                    className={`py-1.5 px-2 rounded text-[11px] font-mono transition-colors cursor-pointer ${
                      position === pos.id
                        ? 'bg-zinc-100 text-zinc-950 font-bold'
                        : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                    }`}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>

              {position !== 'tile' && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <Slider
                    label="X Offset"
                    value={offsetX}
                    min={-150}
                    max={150}
                    step={5}
                    unit="px"
                    onChange={setOffsetX}
                  />
                  <Slider
                    label="Y Offset"
                    value={offsetY}
                    min={-150}
                    max={150}
                    step={5}
                    unit="px"
                    onChange={setOffsetY}
                  />
                </div>
              )}
            </div>

            {/* Opacity & Rotation */}
            <div className="space-y-3 pt-2 border-t border-zinc-800">
              <Slider
                label="Opacity"
                value={opacity}
                min={5}
                max={100}
                step={5}
                unit="%"
                onChange={setOpacity}
              />

              <Slider
                label="Rotation Angle"
                value={rotation}
                min={-180}
                max={180}
                step={5}
                unit="°"
                onChange={setRotation}
                presets={[
                  { label: '0°', value: 0 },
                  { label: '-45°', value: -45 },
                  { label: '45°', value: 45 },
                  { label: '90°', value: 90 },
                ]}
              />
            </div>

            {/* Export Format Selector */}
            <div className="pt-2 border-t border-zinc-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-300">Export Format</span>
                <div className="flex gap-1.5">
                  {(['image/png', 'image/jpeg', 'image/webp'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setExportFormat(fmt)}
                      className={`px-2 py-1 rounded text-[10px] font-mono uppercase transition-colors cursor-pointer ${
                        exportFormat === fmt
                          ? 'bg-zinc-200 text-zinc-950 font-bold'
                          : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                      }`}
                    >
                      {fmt.replace('image/', '')}
                    </button>
                  ))}
                </div>
              </div>

              {exportFormat !== 'image/png' && (
                <Slider
                  label="Compression Quality"
                  value={exportQuality}
                  min={20}
                  max={100}
                  step={5}
                  unit="%"
                  onChange={setExportQuality}
                />
              )}

              <Button
                variant="primary"
                size="md"
                className="w-full mt-2"
                onClick={handleExport}
                loading={isExporting}
                icon={<Download className="w-4 h-4" />}
              >
                Download Watermarked Image
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageWatermark;
