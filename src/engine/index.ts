import { BrowserAdapter } from './adapters/browserAdapter.ts';
import { DesktopAdapter, isTauriEnvironment } from './adapters/desktopAdapter.ts';
import type { EngineAdapter } from './types.ts';

// Dynamic engine adapter: transparently swaps between Tauri Native Rust and Browser Wasm/Canvas
export const engine: EngineAdapter = isTauriEnvironment()
  ? new DesktopAdapter()
  : new BrowserAdapter();

export * from './types.ts';
export { BrowserAdapter, DesktopAdapter, isTauriEnvironment };
export { detectFormat, parseInput, formatOutput, convertData } from './data/dataConverter.ts';
export { dataWorkerService } from './data/dataWorkerService.ts';
export { md5 } from './crypto/md5.ts';
export { ffmpegService } from './media/ffmpegService.ts';



