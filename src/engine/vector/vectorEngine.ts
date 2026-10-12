import potrace from 'potrace-wasm';
import { optimize } from 'svgo';

export interface VectorTraceOptions {
  threshold?: number; // 0 to 255
  turnPolicy?: 'black' | 'white' | 'left' | 'right' | 'minority' | 'majority';
  turdSize?: number;
  optCurve?: boolean;
  color?: string; // fill color
  background?: string;
}

export interface VectorTraceResult {
  svg: string;
  blob: Blob;
  width: number;
  height: number;
}

export interface SvgOptimizeResult {
  optimizedSvg: string;
  blob: Blob;
  originalSize: number;
  optimizedSize: number;
  savingsPercent: number;
}

/**
 * Helper to render image file to an HTML Canvas
 */
export async function fileToCanvas(file: File | Blob): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not acquire 2D canvas rendering context.'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image data into bitmap.'));
    };

    img.src = url;
  });
}

/**
 * Trace bitmap image (PNG/JPEG/WebP) into scalable vector SVG using potrace-wasm
 */
export async function traceBitmapToSvg(
  canvasOrFile: HTMLCanvasElement | File | Blob,
  options: VectorTraceOptions = {}
): Promise<VectorTraceResult> {
  let canvas: HTMLCanvasElement;
  if (typeof (canvasOrFile as any).getContext === 'function') {
    canvas = canvasOrFile as HTMLCanvasElement;
  } else {
    canvas = await fileToCanvas(canvasOrFile as File);
  }

  const loadFn = (potrace as any).loadFromCanvas || (potrace as any).default?.loadFromCanvas;
  if (typeof loadFn !== 'function') {
    throw new Error('Potrace WebAssembly loader is not available.');
  }

  const rawSvg = await loadFn(canvas, {
    threshold: options.threshold ?? 128,
    turnPolicy: options.turnPolicy || 'minority',
    turdSize: options.turdSize ?? 2,
    optCurve: options.optCurve ?? true,
    color: options.color || '#000000',
    background: options.background || 'transparent',
  });

  const blob = new Blob([rawSvg], { type: 'image/svg+xml;charset=utf-8' });

  return {
    svg: rawSvg,
    blob,
    width: canvas.width,
    height: canvas.height,
  };
}

/**
 * Sanitize, minify, and optimize SVGs using SVGO
 */
export function optimizeSvgString(svgCode: string): SvgOptimizeResult {
  const trimmed = svgCode.trim();
  const originalSize = new TextEncoder().encode(trimmed).length;

  const result = optimize(trimmed, {
    multipass: true,
    plugins: [
      'preset-default',
      'removeDimensions',
      'removeComments',
      'removeMetadata',
      'cleanupIds',
      'convertStyleToAttrs',
    ],
  });

  const optimizedSvg = result.data;
  const optimizedBytes = new TextEncoder().encode(optimizedSvg);
  const optimizedSize = optimizedBytes.length;

  const savings = Math.max(0, originalSize - optimizedSize);
  const savingsPercent = originalSize > 0 ? Math.round((savings / originalSize) * 100) : 0;

  const blob = new Blob([optimizedSvg], { type: 'image/svg+xml;charset=utf-8' });

  return {
    optimizedSvg,
    blob,
    originalSize,
    optimizedSize,
    savingsPercent,
  };
}
