declare module 'pdf-lib-encrypt' {
  export function configure(pdfLib: any): void;
  export function lock(
    plainBytes: Uint8Array | ArrayBuffer,
    password?: string,
    opts?: { permissions?: number; algo?: 'aes256' | 'rc4' }
  ): Promise<Uint8Array>;
  export function unlockInPlace(doc: any, password?: string): Promise<boolean>;
}

declare module 'wawoff2' {
  export function compress(input: Uint8Array): Promise<Uint8Array>;
  export function decompress(input: Uint8Array): Promise<Uint8Array>;
}

declare module 'potrace-wasm' {
  export interface PotraceOptions {
    turnPolicy?: 'black' | 'white' | 'left' | 'right' | 'minority' | 'majority';
    turdSize?: number;
    alphaMax?: number;
    optCurve?: boolean;
    optTolerance?: number;
    threshold?: number;
    blackOnWhite?: boolean;
    color?: string;
    background?: string;
  }
  export function loadFromCanvas(canvas: HTMLCanvasElement, options?: PotraceOptions): Promise<string>;
  const defaultExport: {
    loadFromCanvas: typeof loadFromCanvas;
  };
  export default defaultExport;
}

declare module 'mammoth' {
  export interface MammothResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  export function convertToHtml(input: { arrayBuffer: ArrayBuffer } | { buffer: Buffer }): Promise<MammothResult>;
  export function extractRawText(input: { arrayBuffer: ArrayBuffer } | { buffer: Buffer }): Promise<MammothResult>;
  export function convertToMarkdown(input: { arrayBuffer: ArrayBuffer } | { buffer: Buffer }): Promise<MammothResult>;
}

declare module 'epubjs' {
  export interface EpubMetadata {
    title?: string;
    creator?: string;
    description?: string;
    pubdate?: string;
    publisher?: string;
    language?: string;
  }
  export interface EpubChapter {
    id: string;
    href: string;
    label?: string;
    subitems?: EpubChapter[];
  }
  export interface EpubSpineItem {
    idref: string;
    href: string;
    load: (book: any) => Promise<Document>;
  }
  export class Book {
    constructor(urlOrBuffer: string | ArrayBuffer, options?: any);
    ready: Promise<void>;
    loaded: {
      metadata: Promise<EpubMetadata>;
      navigation: Promise<{ toc: EpubChapter[] }>;
      spine: Promise<{ spineItems: EpubSpineItem[] }>;
    };
    archive: any;
    destroy(): void;
  }
  export default function ePub(urlOrBuffer: string | ArrayBuffer, options?: any): Book;
}
