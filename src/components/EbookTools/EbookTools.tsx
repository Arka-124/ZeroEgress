import React, { useState } from 'react';
import {
  BookOpen,
  FileText,
  FileCode,
  Download,
  AlertCircle,
  CheckCircle2,
  List,
  Sparkles,
  Copy,
  Check,
} from 'lucide-react';
import { Dropzone } from '../ui/Dropzone';
import { Button } from '../ui/Button';
import { formatBytes, downloadBlob } from '../../utils/fileUtils';
import {
  parseEpubFile,
  convertTextOrMarkdownToPdf,
  convertDocxFile,
  type ParsedEpub,
} from '../../engine/ebook/ebookEngine';

export const EbookTools: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'epub' | 'docs' | 'docx'>('epub');

  // ===================== EPUB STATE =====================
  const [epubFile, setEpubFile] = useState<File | null>(null);
  const [parsedEpub, setParsedEpub] = useState<ParsedEpub | null>(null);
  const [isParsingEpub, setIsParsingEpub] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [epubError, setEpubError] = useState<string | null>(null);

  // ===================== DOCS TO PDF STATE =====================
  const [docFile, setDocFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('# Sample Document Title\n\nThis is a sample markdown document converted to a formatted PDF completely inside your browser with **ZeroEgress**.\n\n## Section 1: Client-Side Conversion\nNo servers or cloud proxies are involved in this transformation.\n\n- Zero data egress\n- Memory safe\n- Preserves typography and pagination\n');
  const [docTitle, setDocTitle] = useState('My Document');
  const [docFontSize, setDocFontSize] = useState(10);
  const [isGeneratingDocPdf, setIsGeneratingDocPdf] = useState(false);
  const [docPdfBlob, setDocPdfBlob] = useState<Blob | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  // ===================== DOCX STATE =====================
  const [docxFile, setDocxFile] = useState<File | null>(null);
  const [docxHtml, setDocxHtml] = useState<string>('');
  const [docxText, setDocxText] = useState<string>('');
  const [isConvertingDocx, setIsConvertingDocx] = useState(false);
  const [docxError, setDocxError] = useState<string | null>(null);
  const [copiedHtml, setCopiedHtml] = useState(false);

  // Handle EPUB Selection
  const handleEpubSelect = async (file: File) => {
    setEpubFile(file);
    setParsedEpub(null);
    setEpubError(null);
    setIsParsingEpub(true);

    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parseEpubFile(buffer);
      setParsedEpub(parsed);
    } catch (err: any) {
      setEpubError(err.message || 'Failed to parse EPUB file. Ensure it is a valid, unencrypted e-book.');
    } finally {
      setIsParsingEpub(false);
    }
  };

  // Convert EPUB to PDF
  const handleExportEpubPdf = async () => {
    if (!parsedEpub || !epubFile) return;
    setIsExportingPdf(true);
    setEpubError(null);

    try {
      const pdfBlob = await convertTextOrMarkdownToPdf(parsedEpub.fullText, {
        title: parsedEpub.title,
        author: parsedEpub.author,
      });
      const base = epubFile.name.replace(/\.[^/.]+$/, '');
      downloadBlob(pdfBlob, `${base}.pdf`);
    } catch (err: any) {
      setEpubError(err.message || 'Failed to convert EPUB to PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportEpubTxt = () => {
    if (!parsedEpub || !epubFile) return;
    const base = epubFile.name.replace(/\.[^/.]+$/, '');
    const blob = new Blob([parsedEpub.fullText], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, `${base}.txt`);
  };

  const handleExportEpubHtml = () => {
    if (!parsedEpub || !epubFile) return;
    const base = epubFile.name.replace(/\.[^/.]+$/, '');
    const htmlDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${parsedEpub.title}</title><style>body{font-family:sans-serif;max-width:800px;margin:2rem auto;padding:1rem;line-height:1.6;color:#1e293b;}</style></head><body><h1>${parsedEpub.title}</h1><p><em>${parsedEpub.author}</em></p><hr/>${parsedEpub.fullHtml}</body></html>`;
    const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8' });
    downloadBlob(blob, `${base}.html`);
  };

  // Handle Document to PDF Generation
  const handleGenerateDocPdf = async () => {
    if (!rawText.trim()) return;
    setIsGeneratingDocPdf(true);
    setDocError(null);

    try {
      const pdfBlob = await convertTextOrMarkdownToPdf(rawText, {
        title: docTitle,
        fontSize: docFontSize,
      });
      setDocPdfBlob(pdfBlob);
    } catch (err: any) {
      setDocError(err.message || 'Failed to generate PDF document.');
    } finally {
      setIsGeneratingDocPdf(false);
    }
  };

  // Handle DOCX Selection
  const handleDocxSelect = async (file: File) => {
    setDocxFile(file);
    setDocxHtml('');
    setDocxText('');
    setDocxError(null);
    setIsConvertingDocx(true);

    try {
      const buffer = await file.arrayBuffer();
      const res = await convertDocxFile(buffer);
      setDocxHtml(res.html);
      setDocxText(res.text);
    } catch (err: any) {
      setDocxError(err.message || 'Failed to read DOCX document.');
    } finally {
      setIsConvertingDocx(false);
    }
  };

  const handleDownloadDocxPdf = async () => {
    if (!docxText || !docxFile) return;
    try {
      const base = docxFile.name.replace(/\.[^/.]+$/, '');
      const blob = await convertTextOrMarkdownToPdf(docxText, {
        title: base,
      });
      downloadBlob(blob, `${base}.pdf`);
    } catch (err: any) {
      setDocxError(err.message || 'Failed to export PDF.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-400" />
            <span>E-Books & Extended Document Suite</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Convert EPUB e-books, format Markdown / TXT into PDFs, and extract DOCX documents with zero cloud egress.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg border border-zinc-800 bg-zinc-900/60">
          <button
            type="button"
            onClick={() => setActiveTab('epub')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === 'epub'
                ? 'bg-zinc-100 text-zinc-950 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
            <span>EPUB Converter</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('docs')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === 'docs'
                ? 'bg-zinc-100 text-zinc-950 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-sky-400" />
            <span>Markdown / TXT to PDF</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('docx')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === 'docx'
                ? 'bg-zinc-100 text-zinc-950 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5 text-amber-400" />
            <span>Word DOCX Tools</span>
          </button>
        </div>
      </div>

      {/* ======================= TAB 1: EPUB CONVERTER ======================= */}
      {activeTab === 'epub' && (
        <div className="space-y-6">
          {!epubFile ? (
            <Dropzone
              onFilesSelected={(files: File[]) => files[0] && handleEpubSelect(files[0])}
              accept=".epub,application/epub+zip"
              multiple={false}
              title="Drag and drop an EPUB e-book"
              subtitle="Parses container XML and spine chapters into clean PDF, TXT, and HTML"
            />
          ) : (
            <div className="space-y-5">
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center text-emerald-400">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-zinc-100">
                        {parsedEpub?.title || epubFile.name}
                      </h4>
                      <p className="text-xs text-zinc-400">
                        Author: {parsedEpub?.author || 'Unknown'} · {formatBytes(epubFile.size)}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEpubFile(null);
                      setParsedEpub(null);
                    }}
                    className="text-zinc-400 hover:text-zinc-200"
                  >
                    Change File
                  </Button>
                </div>

                {isParsingEpub && (
                  <div className="py-8 text-center text-xs font-mono text-emerald-400 animate-pulse">
                    Unpacking EPUB archive and parsing table of contents...
                  </div>
                )}

                {parsedEpub && (
                  <div className="space-y-4">
                    {/* Chapter Metadata */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                      <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800">
                        <span className="text-zinc-500 block text-[11px]">Total Chapters</span>
                        <span className="font-mono font-semibold text-zinc-200">
                          {parsedEpub.chapters.length} chapters
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800">
                        <span className="text-zinc-500 block text-[11px]">Total Word Count</span>
                        <span className="font-mono font-semibold text-zinc-200">
                          ~{parsedEpub.fullText.split(/\s+/).length.toLocaleString()} words
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800 col-span-2 sm:col-span-1">
                        <span className="text-zinc-500 block text-[11px]">Publisher</span>
                        <span className="font-mono font-semibold text-zinc-200 truncate block">
                          {parsedEpub.publisher || 'Independent / Public Domain'}
                        </span>
                      </div>
                    </div>

                    {/* Chapter Browser Accordion */}
                    <div className="p-3 rounded-lg bg-zinc-950/80 border border-zinc-800/80 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                        <List className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Chapters & Table of Contents</span>
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-zinc-800/60 text-xs">
                        {parsedEpub.chapters.slice(0, 30).map((ch, idx) => (
                          <div key={ch.id} className="py-1.5 px-2 flex justify-between items-center text-zinc-400">
                            <span className="truncate pr-2">
                              {idx + 1}. {ch.title}
                            </span>
                            <span className="font-mono text-[10px] text-zinc-500 shrink-0">
                              {ch.textContent.split(/\s+/).length} words
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Conversion Export Bar */}
                    <div className="p-4 rounded-xl border border-emerald-900/60 bg-emerald-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="text-xs font-semibold text-emerald-300">Export Formats</h4>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Download clean document representations without DRM or watermarks.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          onClick={handleExportEpubPdf}
                          loading={isExportingPdf}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8"
                        >
                          <Download className="w-3.5 h-3.5 mr-1" />
                          Export PDF
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleExportEpubTxt} className="text-xs h-8">
                          <Download className="w-3.5 h-3.5 mr-1" />
                          Export TXT
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleExportEpubHtml} className="text-xs h-8">
                          <Download className="w-3.5 h-3.5 mr-1" />
                          Export HTML
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {epubError && (
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-800 text-red-200 text-xs flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <span>{epubError}</span>
            </div>
          )}
        </div>
      )}

      {/* ======================= TAB 2: MARKDOWN / TXT TO PDF ======================= */}
      {activeTab === 'docs' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200">Convert Markdown & Text to Formatted PDF</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Lays out headings, body text, and automatic multi-page pagination using pdf-lib.
                </p>
              </div>

              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".md,.txt,.html"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setDocFile(f);
                      setDocTitle(f.name.replace(/\.[^/.]+$/, ''));
                      const text = await f.text();
                      setRawText(text);
                      setDocPdfBlob(null);
                    }
                  }}
                  className="hidden"
                />
                <Button variant="outline" size="sm" className="text-xs h-8">
                  <FileText className="w-3.5 h-3.5 mr-1.5" />
                  Load .MD / .TXT File
                </Button>
              </label>
            </div>

            {docFile && (
              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 flex items-center justify-between">
                <span>Loaded file: <strong className="text-emerald-400 font-mono">{docFile.name}</strong> ({formatBytes(docFile.size)})</span>
                <button
                  type="button"
                  onClick={() => setDocFile(null)}
                  className="text-zinc-500 hover:text-zinc-300 text-[11px]"
                >
                  Clear File
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-300">Document Title</label>
                <input
                  type="text"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-300 flex justify-between">
                  <span>Font Size</span>
                  <span className="font-mono text-zinc-400">{docFontSize}pt</span>
                </label>
                <input
                  type="range"
                  min="8"
                  max="14"
                  value={docFontSize}
                  onChange={(e) => setDocFontSize(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-300">Document Markdown / Text Content</label>
              <textarea
                value={rawText}
                onChange={(e) => {
                  setRawText(e.target.value);
                  setDocPdfBlob(null);
                }}
                rows={10}
                className="w-full p-3 text-xs font-mono bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-300 resize-y focus:outline-none"
              />
            </div>

            {!docPdfBlob && (
              <Button
                onClick={handleGenerateDocPdf}
                loading={isGeneratingDocPdf}
                disabled={!rawText.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Render Formatted Multi-Page PDF
              </Button>
            )}

            {docPdfBlob && (
              <div className="p-4 rounded-xl border border-emerald-900/60 bg-emerald-950/30 flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-300 text-xs font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>PDF Document is ready ({formatBytes(docPdfBlob.size)})</span>
                </div>
                <Button
                  size="sm"
                  onClick={() => downloadBlob(docPdfBlob, `${docTitle.replace(/\s+/g, '_')}.pdf`)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8"
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Download PDF
                </Button>
              </div>
            )}
          </div>

          {docError && (
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-800 text-red-200 text-xs flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <span>{docError}</span>
            </div>
          )}
        </div>
      )}

      {/* ======================= TAB 3: DOCX TOOLS ======================= */}
      {activeTab === 'docx' && (
        <div className="space-y-6">
          {!docxFile ? (
            <Dropzone
              onFilesSelected={(files: File[]) => files[0] && handleDocxSelect(files[0])}
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              multiple={false}
              title="Drag and drop a Word document (.docx)"
              subtitle="Converts Word XML into clean semantic HTML preview and formatted PDF"
            />
          ) : (
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center text-emerald-400">
                    <FileCode className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-100">{docxFile.name}</h4>
                    <p className="text-xs text-zinc-400 font-mono">{formatBytes(docxFile.size)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (!docxHtml) return;
                      await navigator.clipboard.writeText(docxHtml);
                      setCopiedHtml(true);
                      setTimeout(() => setCopiedHtml(false), 2000);
                    }}
                    className="text-xs h-8"
                  >
                    {copiedHtml ? <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                    {copiedHtml ? 'Copied' : 'Copy HTML'}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleDownloadDocxPdf}
                    className="text-xs h-8 bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    <Download className="w-3.5 h-3.5 mr-1" />
                    Export PDF
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDocxFile(null);
                      setDocxHtml('');
                      setDocxText('');
                    }}
                    className="text-zinc-400 hover:text-zinc-200"
                  >
                    Change File
                  </Button>
                </div>
              </div>

              {isConvertingDocx && (
                <div className="py-8 text-center text-xs font-mono text-emerald-400 animate-pulse">
                  Decompressing Word XML and extracting typography...
                </div>
              )}

              {docxHtml && (
                <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 max-h-96 overflow-y-auto text-zinc-300 text-xs leading-relaxed space-y-2">
                  <div
                    className="prose prose-invert max-w-none [&_h1]:text-base [&_h1]:font-bold [&_h2]:text-sm [&_h2]:font-semibold [&_p]:my-1.5"
                    dangerouslySetInnerHTML={{ __html: docxHtml }}
                  />
                </div>
              )}
            </div>
          )}

          {docxError && (
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-800 text-red-200 text-xs flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <span>{docxError}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default EbookTools;
