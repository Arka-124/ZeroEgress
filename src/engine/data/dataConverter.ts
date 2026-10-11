import { load as yamlLoad, dump as yamlDump } from 'js-yaml';
import { parseCsv, serializeToCsv } from './csvParser.ts';

export type DataFormat = 'json' | 'csv' | 'yaml';

export interface DataOptions {
  delimiter?: ',' | ';' | '\t' | string;
  indent?: number;
  minify?: boolean;
}

/**
 * Heuristically detect whether raw text is JSON, CSV, or YAML
 */
export function detectFormat(content: string): DataFormat {
  const trimmed = content.trim();
  if (!trimmed) return 'json';

  // 1. Check JSON
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Might be malformed JSON or something else
    }
  }

  // 2. Check CSV (looks for multi-column separated by commas/tabs/semicolons)
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length > 1) {
    const firstLine = lines[0];
    const commaCount = (firstLine.match(/,/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;

    if (commaCount >= 1 || tabCount >= 1 || semicolonCount >= 1) {
      // Check if subsequent lines have roughly similar delimiter distribution
      const secondLine = lines[1];
      if (
        (commaCount >= 1 && (secondLine.match(/,/g) || []).length >= 1) ||
        (tabCount >= 1 && (secondLine.match(/\t/g) || []).length >= 1) ||
        (semicolonCount >= 1 && (secondLine.match(/;/g) || []).length >= 1)
      ) {
        return 'csv';
      }
    }
  }

  // 3. Check YAML
  try {
    const parsed = yamlLoad(trimmed);
    if (parsed && typeof parsed === 'object') {
      return 'yaml';
    }
  } catch {
    // Not valid YAML
  }

  return 'json';
}

/**
 * Parse input string into a JavaScript data structure based on source format
 */
export function parseInput(content: string, format: DataFormat, options: DataOptions = {}): any {
  const trimmed = content.trim();
  if (!trimmed) return null;

  switch (format) {
    case 'json':
      return JSON.parse(trimmed);

    case 'csv':
      return parseCsv(trimmed, { delimiter: options.delimiter || ',' });

    case 'yaml':
      return yamlLoad(trimmed);

    default:
      throw new Error(`Unsupported source format: ${format}`);
  }
}

/**
 * Serialize a JavaScript data structure into target format string
 */
export function formatOutput(data: any, format: DataFormat, options: DataOptions = {}): string {
  if (data === null || data === undefined) return '';

  const indent = options.indent ?? 2;
  const isMinify = options.minify ?? false;

  switch (format) {
    case 'json':
      return isMinify ? JSON.stringify(data) : JSON.stringify(data, null, indent);

    case 'csv':
      return serializeToCsv(data, { delimiter: options.delimiter || ',' });

    case 'yaml':
      return yamlDump(data, {
        indent: Math.max(2, indent),
        lineWidth: -1,
        noRefs: true,
      });

    default:
      throw new Error(`Unsupported target format: ${format}`);
  }
}

/**
 * Universal data converter between JSON, CSV, and YAML
 */
export function convertData(
  content: string,
  from: DataFormat,
  to: DataFormat,
  options: DataOptions = {}
): string {
  if (!content.trim()) return '';

  const intermediate = parseInput(content, from, options);
  return formatOutput(intermediate, to, options);
}
