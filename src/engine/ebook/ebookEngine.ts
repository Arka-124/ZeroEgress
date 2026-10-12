import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { unzipSync } from 'fflate';
import mammoth from 'mammoth';

export interface EpubChapter {
  id: string;
  title: string;
  htmlContent: string;
  textContent: string;
}

export interface ParsedEpub {
  title: string;
  author: string;
  description?: string;
  publisher?: string;
  chapters: EpubChapter[];
  fullText: string;
  fullHtml: string;
}

/**
 * Clean HTML markup to plain readable text
 */
function htmlToPlainText(html: string): string {
  // Replace break and paragraph tags with newlines
  const textWithBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/li>/gi, '\n');

  // Strip remaining HTML tags
  const stripped = textWithBreaks.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  return stripped
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Client-side EPUB parser leveraging fflate and XML parsing
 */
export async function parseEpubFile(buffer: ArrayBuffer): Promise<ParsedEpub> {
  const bytes = new Uint8Array(buffer);
  const unzipped = unzipSync(bytes);

  // 1. Locate container.xml to find rootfile path
  const containerFile = unzipped['META-INF/container.xml'];
  if (!containerFile) {
    throw new Error('Invalid EPUB: META-INF/container.xml not found.');
  }

  const containerXml = new TextDecoder('utf-8').decode(containerFile);
  const rootfileMatch = containerXml.match(/full-path=["']([^"']+)["']/i);
  if (!rootfileMatch || !rootfileMatch[1]) {
    throw new Error('Invalid EPUB: Could not locate OPF rootfile path.');
  }

  const opfPath = rootfileMatch[1];
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
  const opfFile = unzipped[opfPath];
  if (!opfFile) {
    throw new Error(`Invalid EPUB: OPF package file not found at ${opfPath}.`);
  }

  const opfXml = new TextDecoder('utf-8').decode(opfFile);

  // Extract metadata
  const titleMatch = opfXml.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
  const authorMatch = opfXml.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
  const descMatch = opfXml.match(/<dc:description[^>]*>([^<]+)<\/dc:description>/i);
  const pubMatch = opfXml.match(/<dc:publisher[^>]*>([^<]+)<\/dc:publisher>/i);

  const title = titleMatch ? titleMatch[1].trim() : 'Untitled EPUB Document';
  const author = authorMatch ? authorMatch[1].trim() : 'Unknown Author';
  const description = descMatch ? descMatch[1].trim() : undefined;
  const publisher = pubMatch ? pubMatch[1].trim() : undefined;

  // Extract manifest items: id -> href
  const manifestMap = new Map<string, string>();
  const itemRegex = /<item\s+[^>]*id=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemRegex.exec(opfXml)) !== null) {
    manifestMap.set(itemMatch[1], itemMatch[2]);
  }

  // Extract spine itemrefs
  const spineIds: string[] = [];
  const itemrefRegex = /<itemref\s+[^>]*idref=["']([^"']+)["'][^>]*\/?>/gi;
  let itemrefMatch: RegExpExecArray | null;
  while ((itemrefMatch = itemrefRegex.exec(opfXml)) !== null) {
    spineIds.push(itemrefMatch[1]);
  }

  // Parse chapters in reading order
  const chapters: EpubChapter[] = [];
  let fullText = '';
  let fullHtml = '';

  for (let i = 0; i < spineIds.length; i++) {
    const id = spineIds[i];
    const rawHref = manifestMap.get(id);
    if (!rawHref) continue;

    // Decode URI component and normalize path
    const cleanHref = decodeURIComponent(rawHref);
    const fullPath = opfDir + cleanHref;

    const chapterFile = unzipped[fullPath] || unzipped[cleanHref];
    if (!chapterFile) continue;

    const chapterHtml = new TextDecoder('utf-8').decode(chapterFile);
    const chapterText = htmlToPlainText(chapterHtml);

    // Try to find chapter title from <title> or <h1> or <h2>
    const chTitleMatch = chapterHtml.match(/<title[^>]*>([^<]+)<\/title>/i) ||
      chapterHtml.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
      chapterHtml.match(/<h2[^>]*>([^<]+)<\/h2>/i);

    const chTitle = chTitleMatch ? chTitleMatch[1].trim() : `Chapter ${i + 1}`;

    chapters.push({
      id,
      title: chTitle,
      htmlContent: chapterHtml,
      textContent: chapterText,
    });

    fullText += `\n\n=== ${chTitle} ===\n\n${chapterText}\n`;
    fullHtml += `<section class="epub-chapter"><h2>${chTitle}</h2>${chapterHtml}</section>`;
  }

  return {
    title,
    author,
    description,
    publisher,
    chapters,
    fullText: fullText.trim(),
    fullHtml,
  };
}

/**
 * Word wrap helper for PDF rendering
 */
function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');

  for (const para of paragraphs) {
    if (para.length <= maxChars) {
      lines.push(para);
      continue;
    }

    const words = para.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + ' ' + word).trim().length <= maxChars) {
        currentLine = (currentLine + ' ' + word).trim();
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
  }

  return lines;
}

/**
 * Formatted Multi-Page PDF Document Generator using pdf-lib
 */
export async function convertTextOrMarkdownToPdf(
  rawContent: string,
  options: {
    title?: string;
    author?: string;
    fontSize?: number;
    margin?: number;
  } = {}
): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const title = options.title || 'Document';
  const author = options.author || 'ZeroEgress Local Client';
  const fontSize = options.fontSize || 10;
  const margin = options.margin || 45;
  const pageWidth = 595.28; // Standard A4 width
  const pageHeight = 841.89; // Standard A4 height
  const lineHeight = fontSize * 1.45;
  const contentWidth = pageWidth - margin * 2;
  const maxCharsPerLine = Math.floor(contentWidth / (fontSize * 0.52));

  // Sanitize text characters that standard fonts can't render
  const sanitized = rawContent
    .replace(/[^\x20-\x7E\t\n\r\xA0-\xFF]/g, ' ')
    .replace(/\t/g, '    ');

  const wrappedLines = wrapText(sanitized, maxCharsPerLine);

  let currentPage = doc.addPage([pageWidth, pageHeight]);
  let currentY = pageHeight - margin;

  // Title Header on First Page
  currentPage.drawText(title, {
    x: margin,
    y: currentY - 14,
    size: 18,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.12),
  });
  currentY -= 36;

  currentPage.drawText(`Author: ${author} · Generated locally with ZeroEgress`, {
    x: margin,
    y: currentY,
    size: 8,
    font,
    color: rgb(0.4, 0.45, 0.5),
  });
  currentY -= 20;

  // Horizontal divider rule
  currentPage.drawLine({
    start: { x: margin, y: currentY },
    end: { x: pageWidth - margin, y: currentY },
    thickness: 0.75,
    color: rgb(0.8, 0.82, 0.85),
  });
  currentY -= 20;

  let pageIndex = 1;

  for (let i = 0; i < wrappedLines.length; i++) {
    const line = wrappedLines[i];

    // Check if new page needed
    if (currentY <= margin + 30) {
      // Draw footer on current page
      currentPage.drawText(`Page ${pageIndex}`, {
        x: pageWidth - margin - 40,
        y: margin - 10,
        size: 8,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });

      currentPage = doc.addPage([pageWidth, pageHeight]);
      currentY = pageHeight - margin;
      pageIndex++;
    }

    // Markdown heading detection
    if (line.startsWith('# ')) {
      currentY -= 8;
      currentPage.drawText(line.substring(2), {
        x: margin,
        y: currentY,
        size: fontSize + 4,
        font: boldFont,
        color: rgb(0.1, 0.1, 0.15),
      });
      currentY -= lineHeight * 1.5;
    } else if (line.startsWith('## ') || line.startsWith('=== ')) {
      currentY -= 6;
      currentPage.drawText(line.replace(/^[#=]+\s*/, '').replace(/\s*===$/, ''), {
        x: margin,
        y: currentY,
        size: fontSize + 2,
        font: boldFont,
        color: rgb(0.15, 0.15, 0.2),
      });
      currentY -= lineHeight * 1.3;
    } else {
      currentPage.drawText(line, {
        x: margin,
        y: currentY,
        size: fontSize,
        font,
        color: rgb(0.15, 0.15, 0.18),
      });
      currentY -= lineHeight;
    }
  }

  // Draw footer on last page
  currentPage.drawText(`Page ${pageIndex}`, {
    x: pageWidth - margin - 40,
    y: margin - 10,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  const pdfBytes = await doc.save();
  return new Blob([pdfBytes as any], { type: 'application/pdf' });
}

/**
 * Convert DOCX file into clean semantic HTML and plain text using Mammoth
 */
export async function convertDocxFile(buffer: ArrayBuffer): Promise<{
  html: string;
  text: string;
  messages: string[];
}> {
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
  const textResult = await mammoth.extractRawText({ arrayBuffer: buffer });

  return {
    html: result.value,
    text: textResult.value,
    messages: result.messages.map((m) => m.message),
  };
}
