import React from 'react';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function highlightCode(code: string, format: 'json' | 'csv' | 'yaml'): string {
  if (!code) return '';

  // Limit syntax highlighting to 1 MB to prevent regex slowdown on huge files
  if (code.length > 1024 * 1024) {
    return escapeHtml(code);
  }

  const safe = escapeHtml(code);

  if (format === 'json') {
    return safe
      // Strings (keys and values)
      .replace(
        /(&quot;(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*&quot;(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
        (match) => {
          let cls = 'text-amber-300'; // number
          if (/^&quot;.*&quot;:$/.test(match)) {
            cls = 'text-sky-300 font-semibold'; // key
          } else if (/^&quot;/.test(match)) {
            cls = 'text-emerald-300'; // string value
          } else if (/true|false/.test(match)) {
            cls = 'text-purple-300'; // boolean
          } else if (/null/.test(match)) {
            cls = 'text-zinc-500'; // null
          }
          return `<span class="${cls}">${match}</span>`;
        }
      );
  }

  if (format === 'yaml') {
    const lines = safe.split('\n');
    return lines
      .map((line) => {
        // Comment
        if (line.trim().startsWith('#')) {
          return `<span class="text-zinc-500 italic">${line}</span>`;
        }

        // Key-value pair
        return line.replace(
          /^(\s*)([a-zA-Z0-9_-]+):(\s*)(.*)$/,
          (_, indent, key, space, val) => {
            let styledVal = val;
            if (/^(true|false|yes|no)$/i.test(val.trim())) {
              styledVal = `<span class="text-purple-300">${val}</span>`;
            } else if (/^-?\d+(\.\d+)?$/.test(val.trim())) {
              styledVal = `<span class="text-amber-300">${val}</span>`;
            } else if (/^(&quot;|&#039;)/.test(val.trim())) {
              styledVal = `<span class="text-emerald-300">${val}</span>`;
            } else if (val.trim()) {
              styledVal = `<span class="text-zinc-200">${val}</span>`;
            }
            return `${indent}<span class="text-sky-300 font-medium">${key}</span>:${space}${styledVal}`;
          }
        );
      })
      .join('\n');
  }

  if (format === 'csv') {
    const lines = safe.split('\n');
    return lines
      .map((line, idx) => {
        if (idx === 0) {
          // Header line
          return `<span class="text-sky-300 font-semibold">${line}</span>`;
        }
        return `<span class="text-zinc-300">${line}</span>`;
      })
      .join('\n');
  }

  return safe;
}

interface CodeDisplayProps {
  code: string;
  format: 'json' | 'csv' | 'yaml';
}

export const CodeDisplay: React.FC<CodeDisplayProps> = ({ code, format }) => {
  const highlighted = highlightCode(code, format);
  return (
    <div
      className="font-mono text-xs leading-5 whitespace-pre selection:bg-zinc-800"
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  );
};
