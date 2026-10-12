/**
 * Universal client-side Spreadsheet Conversion Engine using SheetJS (xlsx) and fflate.
 * 100% offline, zero-telemetry, memory-safe tabular processing.
 */

import * as XLSX from 'xlsx';
import { zip, type AsyncZippable } from 'fflate';

export type SpreadsheetFormat = 'xlsx' | 'xls' | 'csv' | 'ods' | 'json' | 'tsv' | 'html';

export interface SheetInfo {
  name: string;
  rowCount: number;
  colCount: number;
  previewRows: (string | number | boolean | null)[][];
}

export interface WorkbookInspectionResult {
  fileName: string;
  originalSize: number;
  sheetNames: string[];
  sheets: Record<string, SheetInfo>;
  rawWorkbook: XLSX.WorkBook;
}

export interface SpreadsheetConversionResult {
  blob: Blob;
  fileName: string;
  mimeType: string;
  size: number;
  durationMs: number;
  sheetCount: number;
  isZip: boolean;
}

/**
 * Parses and inspects an input spreadsheet file (.xlsx, .xls, .csv, .tsv, .ods, .json).
 */
export async function inspectSpreadsheet(file: File): Promise<WorkbookInspectionResult> {
  const lowerName = file.name.toLowerCase();
  let workbook: XLSX.WorkBook;

  if (lowerName.endsWith('.json')) {
    const text = await file.text();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Invalid JSON format: unable to parse data structure.');
    }

    workbook = XLSX.utils.book_new();
    if (Array.isArray(parsed)) {
      const ws = XLSX.utils.json_to_sheet(parsed);
      XLSX.utils.book_append_sheet(workbook, ws, 'Sheet1');
    } else if (typeof parsed === 'object' && parsed !== null) {
      // If object with array sheets or single object
      let added = false;
      for (const [key, val] of Object.entries(parsed)) {
        if (Array.isArray(val)) {
          const ws = XLSX.utils.json_to_sheet(val);
          XLSX.utils.book_append_sheet(workbook, ws, key.slice(0, 31));
          added = true;
        }
      }
      if (!added) {
        const ws = XLSX.utils.json_to_sheet([parsed]);
        XLSX.utils.book_append_sheet(workbook, ws, 'Sheet1');
      }
    } else {
      throw new Error('JSON data must be an array of objects or records.');
    }
  } else {
    const arrayBuffer = await file.arrayBuffer();
    workbook = XLSX.read(arrayBuffer, {
      type: 'array',
      cellDates: true,
      raw: false,
    });
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('No valid sheets found in the provided spreadsheet file.');
  }

  const sheetInfos: Record<string, SheetInfo> = {};

  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    if (!ws) continue;

    // Convert to 2D array of rows
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(ws, {
      header: 1,
      defval: '',
      blankrows: false,
    });

    const rowCount = rows.length;
    let maxCols = 0;
    for (const r of rows) {
      if (Array.isArray(r) && r.length > maxCols) {
        maxCols = r.length;
      }
    }

    // Capture first 25 rows for interactive preview
    const preview = rows.slice(0, 25).map((row) => {
      if (!Array.isArray(row)) return [''];
      // Ensure all elements are primitives
      return row.map((cell) => {
        if (cell === null || cell === undefined) return '';
        if (typeof cell === 'object') return JSON.stringify(cell);
        return cell;
      });
    });

    sheetInfos[name] = {
      name,
      rowCount,
      colCount: maxCols,
      previewRows: preview,
    };
  }

  return {
    fileName: file.name,
    originalSize: file.size,
    sheetNames: workbook.SheetNames,
    sheets: sheetInfos,
    rawWorkbook: workbook,
  };
}

/**
 * Converts a single sheet or an entire workbook into the requested format.
 */
export async function convertSpreadsheet(
  inspection: WorkbookInspectionResult,
  targetFormat: SpreadsheetFormat,
  options: {
    selectedSheet?: string; // If omitted, all sheets or first sheet
    exportAllSheetsAsZip?: boolean; // When true and format is CSV/JSON, outputs a ZIP containing each sheet
    outputBaseName?: string;
  }
): Promise<SpreadsheetConversionResult> {
  const startTime = performance.now();
  const { rawWorkbook, fileName: originalFileName } = inspection;
  const baseName =
    options.outputBaseName?.trim() ||
    originalFileName.replace(/\.[^/.]+$/, '');

  const activeSheetName = options.selectedSheet || inspection.sheetNames[0];
  const activeWs = rawWorkbook.Sheets[activeSheetName];
  if (!activeWs) {
    throw new Error(`Sheet "${activeSheetName}" not found in workbook.`);
  }

  let outputBlob: Blob;
  let finalFileName = '';
  let mimeType = 'application/octet-stream';
  let isZip = false;

  // Case 1: Multi-sheet export to ZIP (for CSV, TSV, or JSON)
  if (options.exportAllSheetsAsZip && inspection.sheetNames.length > 1 && ['csv', 'tsv', 'json'].includes(targetFormat)) {
    isZip = true;
    finalFileName = `${baseName}_all_sheets_${targetFormat}.zip`;
    mimeType = 'application/zip';

    const zipFiles: AsyncZippable = {};
    const enc = new TextEncoder();

    for (const sheetName of inspection.sheetNames) {
      const ws = rawWorkbook.Sheets[sheetName];
      if (!ws) continue;

      let sheetText = '';
      let sheetExt = `.${targetFormat}`;

      if (targetFormat === 'csv') {
        sheetText = XLSX.utils.sheet_to_csv(ws);
      } else if (targetFormat === 'tsv') {
        sheetText = XLSX.utils.sheet_to_csv(ws, { FS: '\t' });
      } else if (targetFormat === 'json') {
        const jsonData = XLSX.utils.sheet_to_json(ws);
        sheetText = JSON.stringify(jsonData, null, 2);
      }

      const cleanSheetName = sheetName.replace(/[/\\?%*:|"<>]/g, '_');
      zipFiles[`${cleanSheetName}${sheetExt}`] = [enc.encode(sheetText), { level: 6 }];
    }

    const zipBytes = await new Promise<Uint8Array>((resolve, reject) => {
      zip(zipFiles, (err, data) => {
        if (err) return reject(err);
        resolve(data);
      });
    });

    outputBlob = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
  } else {
    // Case 2: Direct Single or Multi-Sheet Conversion
    switch (targetFormat) {
      case 'csv': {
        finalFileName = `${baseName}.csv`;
        mimeType = 'text/csv;charset=utf-8;';
        const csvText = XLSX.utils.sheet_to_csv(activeWs);
        outputBlob = new Blob([csvText], { type: mimeType });
        break;
      }
      case 'tsv': {
        finalFileName = `${baseName}.tsv`;
        mimeType = 'text/tab-separated-values;charset=utf-8;';
        const tsvText = XLSX.utils.sheet_to_csv(activeWs, { FS: '\t' });
        outputBlob = new Blob([tsvText], { type: mimeType });
        break;
      }
      case 'json': {
        finalFileName = `${baseName}.json`;
        mimeType = 'application/json;charset=utf-8;';
        const jsonData = XLSX.utils.sheet_to_json(activeWs);
        const jsonText = JSON.stringify(jsonData, null, 2);
        outputBlob = new Blob([jsonText], { type: mimeType });
        break;
      }
      case 'html': {
        finalFileName = `${baseName}.html`;
        mimeType = 'text/html;charset=utf-8;';
        const htmlText = XLSX.utils.sheet_to_html(activeWs);
        outputBlob = new Blob([htmlText], { type: mimeType });
        break;
      }
      case 'xlsx': {
        finalFileName = `${baseName}.xlsx`;
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        const buf = XLSX.write(rawWorkbook, { type: 'array', bookType: 'xlsx' });
        outputBlob = new Blob([buf], { type: mimeType });
        break;
      }
      case 'xls': {
        finalFileName = `${baseName}.xls`;
        mimeType = 'application/vnd.ms-excel';
        const buf = XLSX.write(rawWorkbook, { type: 'array', bookType: 'biff8' });
        outputBlob = new Blob([buf], { type: mimeType });
        break;
      }
      case 'ods': {
        finalFileName = `${baseName}.ods`;
        mimeType = 'application/vnd.oasis.opendocument.spreadsheet';
        const buf = XLSX.write(rawWorkbook, { type: 'array', bookType: 'ods' });
        outputBlob = new Blob([buf], { type: mimeType });
        break;
      }
      default:
        throw new Error(`Unsupported target spreadsheet format: ${targetFormat}`);
    }
  }

  const durationMs = Math.round(performance.now() - startTime);

  return {
    blob: outputBlob,
    fileName: finalFileName,
    mimeType,
    size: outputBlob.size,
    durationMs,
    sheetCount: isZip ? inspection.sheetNames.length : 1,
    isZip,
  };
}
