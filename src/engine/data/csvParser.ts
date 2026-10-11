/**
 * RFC 4180 Compliant CSV Parser & Serializer
 * Supports custom delimiters (comma, semicolon, tab) and handles embedded newlines,
 * escaped quotes, and diverse JSON data structures.
 */

export interface CsvOptions {
  delimiter?: string;
  header?: boolean;
}

/**
 * Parse CSV text into an array of JavaScript objects or rows
 */
export function parseCsv(text: string, options: CsvOptions = {}): any[] {
  const delimiter = options.delimiter || ',';
  const hasHeader = options.header !== false;

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  const len = text.length;

  for (let i = 0; i < len; i++) {
    const char = text[i];
    const nextChar = i + 1 < len ? text[i + 1] : '';

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Escaped quote ("") inside quoted string
        currentField += '"';
        i++;
      } else {
        // Toggle quote state
        insideQuotes = !insideQuotes;
      }
    } else if (char === delimiter && !insideQuotes) {
      // Delimiter outside quotes ends field
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      // Newline outside quotes ends row
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentField);
      currentField = '';
      if (currentRow.length > 0 && !(currentRow.length === 1 && currentRow[0] === '')) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += char;
    }
  }

  // Push final field and row
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.length > 0 && !(currentRow.length === 1 && currentRow[0] === '')) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) {
    return [];
  }

  if (!hasHeader || rows.length === 1) {
    // If only one row or no header requested, try converting fields
    return rows.map((r) => r.map(coerceValue));
  }

  // First row is headers
  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);

  return dataRows.map((row) => {
    const obj: Record<string, any> = {};
    headers.forEach((header, index) => {
      const val = index < row.length ? row[index] : '';
      obj[header] = coerceValue(val);
    });
    return obj;
  });
}

function coerceValue(val: string): any {
  const trimmed = val.trim();
  if (trimmed === '') return '';
  if (trimmed === 'null') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (!isNaN(Number(trimmed)) && trimmed !== '') {
    const num = Number(trimmed);
    return num;
  }
  return val;
}

/**
 * Serialize an array of objects or arbitrary JSON data into a CSV string
 */
export function serializeToCsv(data: any, options: CsvOptions = {}): string {
  const delimiter = options.delimiter || ',';

  if (!data) return '';

  let arrayData: any[] = [];
  if (Array.isArray(data)) {
    arrayData = data;
  } else if (typeof data === 'object') {
    arrayData = [data];
  } else {
    return String(data);
  }

  if (arrayData.length === 0) return '';

  // Collect unique headers across all objects in array
  const headerSet = new Set<string>();
  arrayData.forEach((item) => {
    if (typeof item === 'object' && item !== null) {
      Object.keys(item).forEach((k) => headerSet.add(k));
    }
  });

  const headers = Array.from(headerSet);
  if (headers.length === 0) {
    // Simple values array [1, 2, 3]
    return arrayData.map((v) => escapeCsvField(String(v), delimiter)).join('\n');
  }

  const lines: string[] = [];

  // Header line
  lines.push(headers.map((h) => escapeCsvField(h, delimiter)).join(delimiter));

  // Data rows
  arrayData.forEach((item) => {
    const rowValues = headers.map((header) => {
      const val = item ? item[header] : '';
      if (val === undefined || val === null) return '';
      if (typeof val === 'object') {
        return escapeCsvField(JSON.stringify(val), delimiter);
      }
      return escapeCsvField(String(val), delimiter);
    });
    lines.push(rowValues.join(delimiter));
  });

  return lines.join('\n');
}

function escapeCsvField(field: string, delimiter: string): string {
  const needsQuotes =
    field.includes(delimiter) ||
    field.includes('"') ||
    field.includes('\n') ||
    field.includes('\r');

  if (needsQuotes) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
