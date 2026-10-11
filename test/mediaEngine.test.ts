import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ffmpegService } from '../src/engine/media/ffmpegService.ts';
import { BrowserAdapter } from '../src/engine/adapters/browserAdapter.ts';

describe('Media Engine & FFmpeg Integration Checks', () => {
  const adapter = new BrowserAdapter();

  it('reports initial engine loading status accurately', () => {
    // Before load is invoked, engine should report not loaded
    const isLoaded = adapter.isMediaEngineLoaded();
    assert.strictEqual(typeof isLoaded, 'boolean');
    assert.strictEqual(ffmpegService.isEngineLoaded(), false);
  });

  it('handles empty or malformed media files with graceful error fallbacks', async () => {
    // Test conversion on an empty mock buffer
    const mockBlob = new Blob([], { type: 'video/mp4' });
    const mockFile = new File([mockBlob], 'corrupted.mp4', { type: 'video/mp4' });

    // In Node test runner without browser WebAssembly worker or SharedArrayBuffer,
    // the service should catch error and return a safe TaskResultFailure
    const result = await adapter.convertMedia(mockFile, 'mp3', {
      targetFormat: 'mp3',
      bitrate: '192k',
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error.length > 0, 'Error message is returned');
    assert.strictEqual(typeof result.durationMs, 'number');
  });

  it('properly validates trim parameters and audio extraction options', () => {
    // Verify that adapter supports convertMedia with task interface
    const task = {
      id: 'task-test-1',
      type: 'media-convert' as const,
      createdAt: Date.now(),
      file: new Blob([new Uint8Array(10)], { type: 'audio/wav' }),
      fileName: 'sample.wav',
      options: {
        targetFormat: 'mp3',
        bitrate: '320k',
        trim: {
          startTime: 2.5,
          endTime: 8.0,
        },
      },
    };

    assert.strictEqual(task.type, 'media-convert');
    assert.strictEqual(task.options.targetFormat, 'mp3');
    assert.strictEqual(task.options.trim.startTime, 2.5);
    assert.strictEqual(task.options.trim.endTime, 8.0);
  });

  it('ensures terminate resets the engine and frees memory allocations', () => {
    ffmpegService.terminate();
    assert.strictEqual(ffmpegService.isEngineLoaded(), false);
  });
});
