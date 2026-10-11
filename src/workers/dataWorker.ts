import { convertData } from '../engine/data/dataConverter.ts';
import { md5 } from '../engine/crypto/md5.ts';
import type { DataFormat, DataOptions, HashAlgorithm } from '../engine/types.ts';

export interface WorkerConvertRequest {
  type: 'convert';
  id: string;
  content: string;
  from: DataFormat;
  to: DataFormat;
  options: DataOptions;
}

export interface WorkerHashRequest {
  type: 'hash';
  id: string;
  buffer: ArrayBuffer;
  algorithm: HashAlgorithm;
}

export type WorkerRequest = WorkerConvertRequest | WorkerHashRequest;

export interface WorkerResponse {
  id: string;
  success: boolean;
  result?: string;
  error?: string;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (!req || !req.id) return;

  try {
    if (req.type === 'convert') {
      const output = convertData(req.content, req.from, req.to, req.options);
      const response: WorkerResponse = {
        id: req.id,
        success: true,
        result: output,
      };
      self.postMessage(response);
    } else if (req.type === 'hash') {
      let hashStr: string;
      if (req.algorithm === 'MD5') {
        hashStr = md5(req.buffer);
      } else {
        const subtle = self.crypto?.subtle;
        if (!subtle) {
          throw new Error('Web Cryptography API is unavailable in worker');
        }
        const hashBuffer = await subtle.digest(req.algorithm, req.buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        hashStr = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      }

      const response: WorkerResponse = {
        id: req.id,
        success: true,
        result: hashStr,
      };
      self.postMessage(response);
    }
  } catch (err: any) {
    const response: WorkerResponse = {
      id: req.id,
      success: false,
      error: err?.message || 'Worker processing failed',
    };
    self.postMessage(response);
  }
};
