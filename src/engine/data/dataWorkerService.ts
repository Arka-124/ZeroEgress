import type { DataFormat, DataOptions, HashAlgorithm } from '../types.ts';
import { convertData as fallbackConvertData } from './dataConverter.ts';
import { md5 as fallbackMd5 } from '../crypto/md5.ts';
import type { WorkerRequest, WorkerResponse } from '../../workers/dataWorker.ts';

class DataWorkerService {
  private worker: Worker | null = null;
  private pendingRequests = new Map<
    string,
    { resolve: (val: string) => void; reject: (err: Error) => void }
  >();
  private isWorkerSupported: boolean;

  constructor() {
    this.isWorkerSupported = typeof window !== 'undefined' && typeof Worker !== 'undefined';
  }

  private getWorker(): Worker | null {
    if (!this.isWorkerSupported) return null;
    if (this.worker) return this.worker;

    try {
      this.worker = new Worker(new URL('../../workers/dataWorker.ts', import.meta.url), {
        type: 'module',
      });

      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const { id, success, result, error } = e.data;
        const pending = this.pendingRequests.get(id);
        if (!pending) return;

        this.pendingRequests.delete(id);
        if (success && result !== undefined) {
          pending.resolve(result);
        } else {
          pending.reject(new Error(error || 'Worker operation failed'));
        }
      };

      this.worker.onerror = () => {
        // Fallback flag if worker failed to load
        this.isWorkerSupported = false;
        this.terminate();
      };

      return this.worker;
    } catch {
      this.isWorkerSupported = false;
      return null;
    }
  }

  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    // Reject any pending
    this.pendingRequests.forEach(({ reject }) => {
      reject(new Error('Worker terminated'));
    });
    this.pendingRequests.clear();
  }

  /**
   * Convert structured data asynchronously in a Web Worker, preventing UI frame drops.
   */
  async convertAsync(
    content: string,
    from: DataFormat,
    to: DataFormat,
    options: DataOptions = {}
  ): Promise<string> {
    const worker = this.getWorker();
    if (!worker) {
      // Synchronous fallback
      return fallbackConvertData(content, from, to, options);
    }

    const id = `req_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    const req: WorkerRequest = {
      type: 'convert',
      id,
      content,
      from,
      to,
      options,
    };

    return new Promise<string>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      worker.postMessage(req);
    });
  }

  /**
   * Compute cryptographic hash asynchronously in a Web Worker.
   */
  async computeHashAsync(
    buffer: ArrayBuffer,
    algorithm: HashAlgorithm
  ): Promise<string> {
    const worker = this.getWorker();
    if (!worker) {
      // Fallback
      if (algorithm === 'MD5') {
        return fallbackMd5(buffer);
      }
      const subtle = globalThis.crypto?.subtle;
      if (!subtle) {
        throw new Error('Web Cryptography API is unavailable');
      }
      const hashBuffer = await subtle.digest(algorithm, buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    const id = `req_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    const req: WorkerRequest = {
      type: 'hash',
      id,
      buffer,
      algorithm,
    };

    return new Promise<string>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      // Post buffer without transfer to allow caller to reuse buffer for multiple algorithms
      worker.postMessage(req);
    });
  }
}

export const dataWorkerService = new DataWorkerService();
