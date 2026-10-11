import { BrowserAdapter } from './adapters/browserAdapter';
import type { EngineAdapter } from './types';

// Default engine adapter running 100% in-browser client-side
export const engine: EngineAdapter = new BrowserAdapter();

export * from './types';
export { BrowserAdapter };
