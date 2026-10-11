import { BrowserAdapter } from './adapters/browserAdapter';
import type { EngineAdapter } from './types';

// Default engine adapter running 100% in-browser client-side
export const engine: EngineAdapter = new BrowserAdapter();

export * from './types';
export { BrowserAdapter };
export { detectFormat, parseInput, formatOutput, convertData } from './data/dataConverter';
export { dataWorkerService } from './data/dataWorkerService';
export { md5 } from './crypto/md5';

