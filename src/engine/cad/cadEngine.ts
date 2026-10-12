import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export interface CadEntity {
  type: 'LINE' | 'CIRCLE' | 'ARC' | 'LWPOLYLINE' | 'TEXT';
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  cx?: number;
  cy?: number;
  r?: number;
  startDeg?: number;
  endDeg?: number;
  points?: { x: number; y: number }[];
  text?: string;
  height?: number;
}

export interface DxfParsedDrawing {
  entities: CadEntity[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Pure client-side ASCII DXF parser extracting 2D CAD entities
 */
export function parseDxf(dxfText: string): DxfParsedDrawing {
  const lines = dxfText.split(/\r?\n/).map((l) => l.trim());
  const entities: CadEntity[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const updateBounds = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  let inEntities = false;
  let i = 0;

  while (i + 1 < lines.length) {
    const code = parseInt(lines[i], 10);
    const val = lines[i + 1];
    i += 2;

    if (code === 0 && val === 'SECTION') {
      if (i + 1 < lines.length && parseInt(lines[i], 10) === 2 && lines[i + 1] === 'ENTITIES') {
        inEntities = true;
        i += 2;
      }
    } else if (code === 0 && val === 'ENDSEC') {
      inEntities = false;
    } else if (inEntities && code === 0) {
      if (val === 'LINE') {
        let x1 = 0; let y1 = 0; let x2 = 0; let y2 = 0;
        while (i + 1 < lines.length && parseInt(lines[i], 10) !== 0) {
          const c = parseInt(lines[i], 10);
          const v = lines[i + 1];
          i += 2;
          if (c === 10) x1 = parseFloat(v) || 0;
          else if (c === 20) y1 = parseFloat(v) || 0;
          else if (c === 11) x2 = parseFloat(v) || 0;
          else if (c === 21) y2 = parseFloat(v) || 0;
        }
        updateBounds(x1, y1);
        updateBounds(x2, y2);
        entities.push({ type: 'LINE', x1, y1, x2, y2 });
      } else if (val === 'CIRCLE') {
        let cx = 0; let cy = 0; let r = 1;
        while (i + 1 < lines.length && parseInt(lines[i], 10) !== 0) {
          const c = parseInt(lines[i], 10);
          const v = lines[i + 1];
          i += 2;
          if (c === 10) cx = parseFloat(v) || 0;
          else if (c === 20) cy = parseFloat(v) || 0;
          else if (c === 40) r = parseFloat(v) || 1;
        }
        updateBounds(cx - r, cy - r);
        updateBounds(cx + r, cy + r);
        entities.push({ type: 'CIRCLE', cx, cy, r });
      } else if (val === 'ARC') {
        let cx = 0; let cy = 0; let r = 1; let startDeg = 0; let endDeg = 360;
        while (i + 1 < lines.length && parseInt(lines[i], 10) !== 0) {
          const c = parseInt(lines[i], 10);
          const v = lines[i + 1];
          i += 2;
          if (c === 10) cx = parseFloat(v) || 0;
          else if (c === 20) cy = parseFloat(v) || 0;
          else if (c === 40) r = parseFloat(v) || 1;
          else if (c === 50) startDeg = parseFloat(v) || 0;
          else if (c === 51) endDeg = parseFloat(v) || 360;
        }
        updateBounds(cx - r, cy - r);
        updateBounds(cx + r, cy + r);
        entities.push({ type: 'ARC', cx, cy, r, startDeg, endDeg });
      } else if (val === 'LWPOLYLINE' || val === 'POLYLINE') {
        const pts: { x: number; y: number }[] = [];
        let curX: number | null = null;
        while (i + 1 < lines.length && parseInt(lines[i], 10) !== 0) {
          const c = parseInt(lines[i], 10);
          const v = lines[i + 1];
          i += 2;
          if (c === 10) curX = parseFloat(v) || 0;
          else if (c === 20 && curX !== null) {
            const y = parseFloat(v) || 0;
            updateBounds(curX, y);
            pts.push({ x: curX, y });
            curX = null;
          }
        }
        if (pts.length > 0) {
          entities.push({ type: 'LWPOLYLINE', points: pts });
        }
      } else if (val === 'TEXT' || val === 'MTEXT') {
        let x = 0; let y = 0; let h = 12; let text = '';
        while (i + 1 < lines.length && parseInt(lines[i], 10) !== 0) {
          const c = parseInt(lines[i], 10);
          const v = lines[i + 1];
          i += 2;
          if (c === 10) x = parseFloat(v) || 0;
          else if (c === 20) y = parseFloat(v) || 0;
          else if (c === 40) h = parseFloat(v) || 12;
          else if (c === 1) text = v;
        }
        if (text) {
          updateBounds(x, y);
          entities.push({ type: 'TEXT', x, y, text, height: h });
        }
      }
    }
  }

  if (minX >= maxX || minY >= maxY) {
    minX = 0; minY = 0; maxX = 800; maxY = 600;
  }

  return { entities, minX, minY, maxX, maxY };
}

/**
 * Render parsed CAD DXF blueprint to scalable SVG string
 */
export function dxfToSvg(drawing: DxfParsedDrawing): string {
  const pad = 25;
  const w = Math.max(drawing.maxX - drawing.minX, 10) + pad * 2;
  const h = Math.max(drawing.maxY - drawing.minY, 10) + pad * 2;
  const ox = drawing.minX - pad;
  const oy = drawing.minY - pad;

  let body = '';
  for (const ent of drawing.entities) {
    if (ent.type === 'LINE' && ent.x1 !== undefined && ent.y1 !== undefined && ent.x2 !== undefined && ent.y2 !== undefined) {
      body += `    <line x1="${ent.x1.toFixed(2)}" y1="${ent.y1.toFixed(2)}" x2="${ent.x2.toFixed(2)}" y2="${ent.y2.toFixed(2)}" />\n`;
    } else if (ent.type === 'CIRCLE' && ent.cx !== undefined && ent.cy !== undefined && ent.r !== undefined) {
      body += `    <circle cx="${ent.cx.toFixed(2)}" cy="${ent.cy.toFixed(2)}" r="${ent.r.toFixed(2)}" />\n`;
    } else if (ent.type === 'ARC' && ent.cx !== undefined && ent.cy !== undefined && ent.r !== undefined) {
      const r1 = ((ent.startDeg || 0) * Math.PI) / 180;
      const r2 = ((ent.endDeg || 360) * Math.PI) / 180;
      const sx = ent.cx + ent.r * Math.cos(r1);
      const sy = ent.cy + ent.r * Math.sin(r1);
      const ex = ent.cx + ent.r * Math.cos(r2);
      const ey = ent.cy + ent.r * Math.sin(r2);
      const large = Math.abs((ent.endDeg || 360) - (ent.startDeg || 0)) > 180 ? 1 : 0;
      body += `    <path d="M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${ent.r.toFixed(2)} ${ent.r.toFixed(2)} 0 ${large} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}" />\n`;
    } else if (ent.type === 'LWPOLYLINE' && ent.points && ent.points.length > 0) {
      const d = `M ${ent.points[0].x.toFixed(2)} ${ent.points[0].y.toFixed(2)} ` +
        ent.points.slice(1).map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
      body += `    <path d="${d}" />\n`;
    } else if (ent.type === 'TEXT' && ent.text && ent.x !== undefined && ent.y !== undefined) {
      const clean = ent.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      body += `    <text x="${ent.x.toFixed(2)}" y="${ent.y.toFixed(2)}" font-size="${ent.height || 12}" fill="#38bdf8" stroke="none" font-family="monospace">${clean}</text>\n`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ox.toFixed(2)} ${oy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}" width="100%" height="100%" style="background:#09090b">
  <g stroke="#10b981" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
${body}  </g>
</svg>`;
}

/**
 * Render parsed CAD DXF blueprint to vector PDF
 */
export async function dxfToPdf(drawing: DxfParsedDrawing, title = 'CAD Blueprint'): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([841.89, 595.28]); // A4 Landscape Blueprint
  const { width: pw, height: ph } = page.getSize();
  const margin = 40;

  // Background
  page.drawRectangle({
    x: 0,
    y: 0,
    width: pw,
    height: ph,
    color: rgb(0.04, 0.06, 0.1),
  });

  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawText(`CAD BLUEPRINT: ${title}`, {
    x: margin,
    y: ph - 25,
    size: 11,
    font,
    color: rgb(0.9, 0.95, 1.0),
  });

  const dw = Math.max(drawing.maxX - drawing.minX, 1);
  const dh = Math.max(drawing.maxY - drawing.minY, 1);
  const scale = Math.min((pw - margin * 2) / dw, (ph - margin * 2) / dh);

  const mapX = (x: number) => margin + (x - drawing.minX) * scale;
  const mapY = (y: number) => margin + (y - drawing.minY) * scale;

  for (const ent of drawing.entities) {
    if (ent.type === 'LINE' && ent.x1 !== undefined && ent.y1 !== undefined && ent.x2 !== undefined && ent.y2 !== undefined) {
      page.drawLine({
        start: { x: mapX(ent.x1), y: mapY(ent.y1) },
        end: { x: mapX(ent.x2), y: mapY(ent.y2) },
        thickness: 1,
        color: rgb(0.06, 0.72, 0.5),
      });
    } else if (ent.type === 'CIRCLE' && ent.cx !== undefined && ent.cy !== undefined && ent.r !== undefined) {
      const r = ent.r * scale;
      page.drawCircle({
        x: mapX(ent.cx),
        y: mapY(ent.cy),
        size: r,
        borderColor: rgb(0.06, 0.72, 0.5),
        borderWidth: 1,
      });
    } else if (ent.type === 'LWPOLYLINE' && ent.points && ent.points.length > 1) {
      for (let j = 0; j < ent.points.length - 1; j++) {
        page.drawLine({
          start: { x: mapX(ent.points[j].x), y: mapY(ent.points[j].y) },
          end: { x: mapX(ent.points[j + 1].x), y: mapY(ent.points[j + 1].y) },
          thickness: 1,
          color: rgb(0.06, 0.72, 0.5),
        });
      }
    }
  }

  return doc.save();
}

/**
 * Extract embedded high-resolution JPEG preview frame from Camera RAW containers (CR2, NEF, ARW, DNG, RAF)
 */
export function extractCameraRawPreview(buffer: ArrayBuffer): Uint8Array | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 16) return null;

  let bestStart = 0;
  let bestLen = 0;

  let i = 0;
  while (i + 4 < bytes.length) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) {
      const start = i;
      let foundEoi: number | null = null;
      let j = start + 2;
      while (j + 1 < bytes.length) {
        if (bytes[j] === 0xff && bytes[j + 1] === 0xd9) {
          foundEoi = j + 2;
          j += 2;
        } else {
          j += 1;
        }
      }

      if (foundEoi !== null) {
        const len = foundEoi - start;
        if (len > bestLen) {
          bestLen = len;
          bestStart = start;
        }
      }
      i += 2;
    } else {
      i += 1;
    }
  }

  if (bestLen > 1024) {
    return bytes.slice(bestStart, bestStart + bestLen);
  }
  return null;
}
