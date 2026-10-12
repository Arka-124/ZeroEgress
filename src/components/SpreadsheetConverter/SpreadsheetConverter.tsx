import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Table,
  Download,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Dropzone } from '../ui/Dropzone';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { formatBytes, downloadBlob } from '../../utils/fileUtils';
import {
  inspectSpreadsheet,
  convertSpreadsheet,
  type SpreadsheetFormat,
  type WorkbookInspectionResult,
  type SpreadsheetConversionResult,
} from '../../engine/spreadsheet/spreadsheetService';

export interface SpreadsheetConverterProps {
  isViewerMode?: boolean;
}

export const SpreadsheetConverter: React.FC<SpreadsheetConverterProps> = ({ isViewerMode = false }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspection, setInspection] = useState<WorkbookInspectionResult | null>(null);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [targetFormat, setTargetFormat] = useState<SpreadsheetFormat>('csv');
  const [exportAllSheetsAsZip, setExportAllSheetsAsZip] = useState(false);
  const [outputBaseName, setOutputBaseName] = useState('');
  const [isConverting, setIsConverting] = useState(false);
  const [result, setResult] = useState<SpreadsheetConversionResult | null>(null);
  const [errorAlert, setErrorAlert] = useState<string | null>(null);

  const handleFilesSelected = async (files: File[]) => {
    if (files.length === 0) return;
    const selected = files[0];
    setFile(selected);
    setIsInspecting(true);
    setErrorAlert(null);
    setResult(null);
    setInspection(null);

    try {
      const inspected = await inspectSpreadsheet(selected);
      setInspection(inspected);
      const firstSheet = inspected.sheetNames[0] || '';
      setActiveSheet(firstSheet);

      // Default target format: if source is xlsx/xls/ods, default to csv; if csv, default to xlsx
      const lower = selected.name.toLowerCase();
      if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
        setTargetFormat('xlsx');
      } else if (lower.endsWith('.json')) {
        setTargetFormat('xlsx');
      } else {
        setTargetFormat('csv');
      }

      const base = selected.name.replace(/\.[^/.]+$/, '');
      setOutputBaseName(base);
    } catch (err: any) {
      setErrorAlert(err?.message || 'Failed to inspect spreadsheet file.');
      setFile(null);
    } finally {
      setIsInspecting(false);
    }
  };

  const handleExecuteConvert = async () => {
    if (!inspection) return;
    setIsConverting(true);
    setErrorAlert(null);
    setResult(null);

    try {
      const res = await convertSpreadsheet(inspection, targetFormat, {
        selectedSheet: activeSheet,
        exportAllSheetsAsZip,
        outputBaseName,
      });
      setResult(res);
    } catch (err: any) {
      setErrorAlert(err?.message || 'Spreadsheet conversion failed.');
    } finally {
      setIsConverting(false);
    }
  };

  const currentSheetInfo = inspection && activeSheet ? inspection.sheets[activeSheet] : null;

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2.5">
            <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
            <span>Spreadsheet & Table Converter</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-400 font-semibold">
              SheetJS Engine
            </span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Convert seamlessly between XLSX, XLS, CSV, ODS, TSV, and JSON with real-time interactive table preview.
          </p>
        </div>
      </div>

      {/* Error Alert Banner */}
      {errorAlert && (
        <div className="p-4 rounded-xl border border-rose-900/60 bg-rose-950/30 flex items-start justify-between gap-3 text-xs animate-in fade-in duration-150">
          <div className="flex items-start gap-2.5 text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-200">Spreadsheet Notice</p>
              <p className="text-rose-300/90 mt-0.5 font-mono text-[11px]">{errorAlert}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setErrorAlert(null)}
            className="text-rose-400 hover:text-rose-200 text-xs font-mono"
          >
            Dismiss
          </button>
        </div>
      )}

      {!file || !inspection ? (
        isInspecting ? (
          <div className="py-20 flex flex-col items-center justify-center text-center space-y-3 p-8 rounded-xl border border-zinc-800 bg-zinc-950/60">
            <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-emerald-400 animate-spin" />
            <p className="text-xs font-mono text-zinc-400">Parsing workbook & worksheet structures...</p>
          </div>
        ) : (
          <Dropzone
            onFilesSelected={handleFilesSelected}
            accept=".xlsx,.xls,.csv,.ods,.tsv,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/json"
            title={
              isViewerMode
                ? 'Drop spreadsheet to inspect & preview tabular structure'
                : 'Drop spreadsheet (XLSX, XLS, CSV, ODS, JSON) to convert'
            }
            subtitle={
              isViewerMode
                ? 'Select workbook · Inspect sheets, rows, columns, and preview tabular data'
                : 'Select spreadsheet · Inspect tabular structure and convert formats with zero server egress'
            }
            hint="100% Client-Side · In-Memory Parsing"
          />
        )
      ) : (
        <div className="space-y-5">
          {/* File Overview Card */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-zinc-800 bg-zinc-900/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-950/60 border border-emerald-800/80 flex items-center justify-center text-emerald-400">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-100 flex items-center gap-2">
                  <span>{inspection.fileName}</span>
                  <Badge variant="default" size="sm">
                    {formatBytes(inspection.originalSize)}
                  </Badge>
                </p>
                <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                  Workbook containing <strong>{inspection.sheetNames.length} sheet(s)</strong>
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFile(null);
                setInspection(null);
                setResult(null);
              }}
              icon={<X className="w-3.5 h-3.5" />}
            >
              Change File
            </Button>
          </div>

          {/* Sheet Selector Tabs (if multiple sheets exist) */}
          {inspection.sheetNames.length > 1 && (
            <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-900/30 space-y-2">
              <span className="text-[11px] font-mono text-zinc-400 block">
                Active Worksheet Selector:
              </span>
              <div className="flex flex-wrap gap-2">
                {inspection.sheetNames.map((name) => {
                  const sInfo = inspection.sheets[name];
                  const isSelected = activeSheet === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setActiveSheet(name)}
                      className={`px-3 py-1.5 text-xs font-mono rounded-lg border transition-all cursor-pointer flex items-center gap-2 ${
                        isSelected
                          ? 'bg-zinc-100 text-zinc-950 border-zinc-200 font-semibold shadow-sm'
                          : 'bg-zinc-950/70 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700'
                      }`}
                    >
                      <Table className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{name}</span>
                      {sInfo && (
                        <span className="text-[10px] opacity-75 font-normal">
                          ({sInfo.rowCount} rows)
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Interactive Table Preview (First 20-25 rows) */}
          {currentSheetInfo && (
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/30 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Table className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-semibold text-zinc-200">
                    Table Preview: "{activeSheet}"
                  </span>
                  <Badge variant="info" size="sm">
                    {currentSheetInfo.rowCount} total rows · {currentSheetInfo.colCount} columns
                  </Badge>
                </div>
                <span className="text-[11px] font-mono text-zinc-500 shrink-0">
                  Showing first {Math.min(25, currentSheetInfo.previewRows.length)} rows
                </span>
              </div>

              {/* Scrollable table view */}
              <div className="w-full max-w-full overflow-x-auto overflow-y-auto max-h-64 lg:max-h-96 xl:max-h-[440px] rounded-lg border border-zinc-800 bg-zinc-950/80">
                {currentSheetInfo.previewRows.length > 0 ? (
                  <table className="w-full text-left text-[11px] font-mono text-zinc-300 divide-y divide-zinc-800">
                    {/* Header Row */}
                    {currentSheetInfo.previewRows[0] && (
                      <thead className="bg-zinc-900/90 sticky top-0 z-10 text-zinc-200">
                        <tr>
                          <th className="px-3 py-2 text-[10px] text-zinc-500 font-normal border-r border-zinc-800 w-10">
                            #
                          </th>
                          {currentSheetInfo.previewRows[0].map((headerCell, colIdx) => (
                            <th
                              key={`th-${colIdx}`}
                              className="px-3 py-2 font-semibold border-r border-zinc-800/50 whitespace-nowrap"
                            >
                              {String(headerCell || `Col ${colIdx + 1}`)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                    )}

                    {/* Body Rows */}
                    <tbody className="divide-y divide-zinc-800/50">
                      {currentSheetInfo.previewRows.slice(1).map((row, rowIdx) => (
                        <tr key={`tr-${rowIdx}`} className="hover:bg-zinc-900/40">
                          <td className="px-3 py-1.5 text-[10px] text-zinc-500 border-r border-zinc-800/60 bg-zinc-950/40">
                            {rowIdx + 2}
                          </td>
                          {Array.from({ length: currentSheetInfo.colCount }).map((_, colIdx) => {
                            const val = row[colIdx];
                            return (
                              <td
                                key={`td-${rowIdx}-${colIdx}`}
                                className="px-3 py-1.5 border-r border-zinc-800/30 whitespace-nowrap max-w-xs truncate text-zinc-300"
                              >
                                {val !== undefined && val !== null ? String(val) : ''}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-8 text-center text-xs font-mono text-zinc-500">
                    Active sheet is empty.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Conversion Options & Target Format Card */}
          <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/30 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Target Format Buttons */}
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-2">
                  Target Export Format:
                </label>
                <div className="flex flex-wrap sm:grid sm:grid-cols-7 gap-1.5 p-1 bg-zinc-950 border border-zinc-800 rounded-lg">
                  {(['csv', 'xlsx', 'json', 'ods', 'xls', 'tsv', 'html'] as SpreadsheetFormat[]).map(
                    (fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setTargetFormat(fmt)}
                        className={`flex-1 sm:flex-initial min-w-[60px] sm:min-w-0 py-2 sm:py-1.5 text-xs font-mono font-medium rounded transition-all cursor-pointer text-center min-h-[38px] flex items-center justify-center ${
                          targetFormat === fmt
                            ? 'bg-zinc-200 text-zinc-950 font-bold shadow-sm'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        .{fmt.toUpperCase()}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Output File Base Name */}
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-2">
                  Output Filename:
                </label>
                <input
                  type="text"
                  value={outputBaseName}
                  onChange={(e) => setOutputBaseName(e.target.value)}
                  placeholder="converted_data"
                  className="w-full px-3 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 font-mono focus:outline-none focus:border-zinc-600"
                />
              </div>
            </div>

            {/* Multi-Sheet Options */}
            {inspection.sheetNames.length > 1 && (
              <div className="pt-2 border-t border-zinc-800/60">
                <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportAllSheetsAsZip}
                    onChange={(e) => setExportAllSheetsAsZip(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
                  />
                  <span>
                    Export <strong>all {inspection.sheetNames.length} sheets</strong> as separate {targetFormat.toUpperCase()} files bundled into a ZIP archive
                  </span>
                </label>
              </div>
            )}

            {/* Action Button & Convert */}
            <div className="pt-2 flex items-center justify-between gap-3 border-t border-zinc-800/60">
              <span className="text-xs text-zinc-400 font-mono">
                Converting from{' '}
                <strong className="text-zinc-200">
                  {inspection.fileName.split('.').pop()?.toUpperCase()}
                </strong>{' '}
                to <strong className="text-emerald-400">.{targetFormat.toUpperCase()}</strong>
              </span>

              <Button
                variant="primary"
                size="md"
                onClick={handleExecuteConvert}
                loading={isConverting}
                icon={<FileSpreadsheet className="w-4 h-4 text-emerald-400" />}
              >
                {isConverting ? 'Converting Spreadsheet...' : 'Convert & Download'}
              </Button>
            </div>
          </div>

          {/* Conversion Result Card */}
          {result && (
            <div className="p-4 rounded-xl border border-emerald-900/50 bg-emerald-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400 shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-emerald-200 flex items-center gap-2">
                    <span>{result.fileName}</span>
                    <Badge variant="success" size="sm">
                      {formatBytes(result.size)}
                    </Badge>
                  </p>
                  <p className="text-[11px] font-mono text-emerald-400/80 mt-0.5">
                    {result.isZip
                      ? `Packaged ${result.sheetCount} sheets into ZIP`
                      : `Converted worksheet "${activeSheet}"`}{' '}
                    in {result.durationMs}ms
                  </p>
                </div>
              </div>

              <Button
                variant="primary"
                size="sm"
                onClick={() => downloadBlob(result.blob, result.fileName)}
                icon={<Download className="w-3.5 h-3.5" />}
              >
                Download Converted File
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SpreadsheetConverter;
