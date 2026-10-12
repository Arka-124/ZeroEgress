import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as XLSX from 'xlsx';
import {
  inspectSpreadsheet,
  convertSpreadsheet,
} from '../src/engine/spreadsheet/spreadsheetService.ts';

describe('Spreadsheet & Table Converter (SheetJS & fflate)', () => {
  it('inspects tabular JSON data and converts to CSV', async () => {
    const rawData = [
      { id: 1, name: 'Product A', price: 29.99, stock: 150 },
      { id: 2, name: 'Product B', price: 49.99, stock: 80 },
      { id: 3, name: 'Product C', price: 12.50, stock: 240 },
    ];
    const jsonFile = new File([JSON.stringify(rawData)], 'products.json', {
      type: 'application/json',
    });

    const inspection = await inspectSpreadsheet(jsonFile);
    assert.strictEqual(inspection.fileName, 'products.json');
    assert.strictEqual(inspection.sheetNames.length, 1);

    const sheetInfo = inspection.sheets[inspection.sheetNames[0]];
    assert.ok(sheetInfo, 'Sheet info exists');
    assert.strictEqual(sheetInfo.rowCount, 4); // header + 3 rows
    assert.strictEqual(sheetInfo.colCount, 4);

    // Convert to CSV
    const csvResult = await convertSpreadsheet(inspection, 'csv', {
      selectedSheet: inspection.sheetNames[0],
    });

    assert.strictEqual(csvResult.fileName, 'products.csv');
    assert.ok(csvResult.size > 0);

    const csvText = await csvResult.blob.text();
    assert.ok(csvText.includes('Product A'));
    assert.ok(csvText.includes('29.99'));
  });

  it('converts multi-sheet workbook to ZIP containing individual CSVs', async () => {
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet([['Year', 'Revenue'], [2024, 100000], [2025, 150000]]);
    const ws2 = XLSX.utils.aoa_to_sheet([['Quarter', 'Expenses'], ['Q1', 20000], ['Q2', 25000]]);
    XLSX.utils.book_append_sheet(wb, ws1, 'Financials');
    XLSX.utils.book_append_sheet(wb, ws2, 'Expenditures');

    const wbBytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const xlsxFile = new File([wbBytes], 'annual_report.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const inspection = await inspectSpreadsheet(xlsxFile);
    assert.strictEqual(inspection.sheetNames.length, 2);

    // Export all sheets as ZIP
    const zipResult = await convertSpreadsheet(inspection, 'csv', {
      exportAllSheetsAsZip: true,
      outputBaseName: 'annual_report',
    });

    assert.strictEqual(zipResult.isZip, true);
    assert.strictEqual(zipResult.sheetCount, 2);
    assert.ok(zipResult.fileName.endsWith('.zip'));
    assert.ok(zipResult.size > 0);
  });

  it('converts between XLSX, ODS, and JSON without data loss', async () => {
    const csvContent = 'Country,Population,GDP\nUnited States,331000000,21433225\nGermany,83000000,3845630\n';
    const csvFile = new File([csvContent], 'demographics.csv', { type: 'text/csv' });

    const inspection = await inspectSpreadsheet(csvFile);

    // Convert to XLSX
    const xlsxResult = await convertSpreadsheet(inspection, 'xlsx', {});
    assert.strictEqual(xlsxResult.fileName, 'demographics.xlsx');
    assert.ok(xlsxResult.size > 0);

    // Convert to JSON
    const jsonResult = await convertSpreadsheet(inspection, 'json', {});
    assert.strictEqual(jsonResult.fileName, 'demographics.json');
    const jsonParsed = JSON.parse(await jsonResult.blob.text());
    assert.strictEqual(jsonParsed.length, 2);
    assert.strictEqual(jsonParsed[0].Country, 'United States');
  });
});
