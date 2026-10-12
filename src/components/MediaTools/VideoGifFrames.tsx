import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Film,
  Camera,
  Play,
  Pause,
  Download,
  Trash2,
  Sparkles,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  UploadCloud,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { formatBytes, downloadBlob } from '../../utils/fileUtils';
import { urlRegistry } from '../../utils/urlRegistry';
import { ffmpegService } from '../../engine/media/ffmpegService';

interface CapturedFrame {
  id: string;
  blob: Blob;
  url: string;
  timestamp: number;
  width: number;
  height: number;
  format: 'png' | 'jpeg';
}

function formatTime(secs: number): string {
  if (isNaN(secs) || secs < 0) return '00:00.0';
  const mins = Math.floor(secs / 60);
  const remainingSecs = (secs % 60).toFixed(1);
  const formattedSecs = parseFloat(remainingSecs) < 10 ? `0${remainingSecs}` : remainingSecs;
  const formattedMins = mins < 10 ? `0${mins}` : `${mins}`;
  return `${formattedMins}:${formattedSecs}`;
}

export const VideoGifFrames: React.FC = () => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Frame Capture State
  const [capturedFrames, setCapturedFrames] = useState<CapturedFrame[]>([]);
  const [captureFormat, setCaptureFormat] = useState<'png' | 'jpeg'>('png');
  const [isCapturingKeyframes, setIsCapturingKeyframes] = useState(false);

  // GIF Generator State
  const [gifStart, setGifStart] = useState(0);
  const [gifEnd, setGifEnd] = useState(3);
  const [gifFps, setGifFps] = useState(10);
  const [isGeneratingGif, setIsGeneratingGif] = useState(false);
  const [gifProgress, setGifProgress] = useState(0);
  const [gifStatusText, setGifStatusText] = useState('');
  const [gifResult, setGifResult] = useState<{ blob: Blob; url: string; size: number } | null>(null);
  const [gifError, setGifError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Cleanup object URLs on unmount or file reset
  useEffect(() => {
    return () => {
      if (videoUrl) urlRegistry.revoke(videoUrl);
      capturedFrames.forEach((frame) => urlRegistry.revoke(frame.url));
      if (gifResult?.url) urlRegistry.revoke(gifResult.url);
    };
  }, [videoUrl, capturedFrames, gifResult]);

  // Load Video File
  const handleLoadVideo = useCallback((file: File) => {
    if (!file.type.startsWith('video/')) return;
    if (videoUrl) urlRegistry.revoke(videoUrl);
    capturedFrames.forEach((frame) => urlRegistry.revoke(frame.url));
    if (gifResult?.url) urlRegistry.revoke(gifResult.url);

    const url = urlRegistry.create(file);
    setVideoFile(file);
    setVideoUrl(url);
    setCapturedFrames([]);
    setGifResult(null);
    setGifError(null);
    setCurrentTime(0);
  }, [videoUrl, capturedFrames, gifResult]);

  // Global drop listener
  useEffect(() => {
    const handleGlobalDrop = (e: Event) => {
      const customEvent = e as CustomEvent<File[]>;
      const files = customEvent.detail;
      if (!files || files.length === 0) return;
      const file = files[0];
      if (file.type.startsWith('video/')) {
        handleLoadVideo(file);
      }
    };
    window.addEventListener('zeroegress:files-dropped', handleGlobalDrop as EventListener);
    return () => {
      window.removeEventListener('zeroegress:files-dropped', handleGlobalDrop as EventListener);
    };
  }, [handleLoadVideo]);

  // Metadata loaded callback
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration || 0;
      setDuration(dur);
      setGifStart(0);
      setGifEnd(Math.min(dur, 4));
      setVideoDimensions({
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight,
      });
    }
  };

  // Play / Pause toggle
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  // Step frames (± 0.04 sec)
  const stepFrame = (secondsOffset: number) => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    setIsPlaying(false);
    const newTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + secondsOffset));
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Capture Single Frame
  const captureCurrentFrame = useCallback(() => {
    if (!videoRef.current || !videoDimensions.width) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const mime = captureFormat === 'png' ? 'image/png' : 'image/jpeg';

    canvas.toBlob((blob) => {
      if (!blob) return;
      const frameUrl = urlRegistry.create(blob);
      const newFrame: CapturedFrame = {
        id: `frame_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        blob,
        url: frameUrl,
        timestamp: video.currentTime,
        width: canvas.width,
        height: canvas.height,
        format: captureFormat,
      };
      setCapturedFrames((prev) => [newFrame, ...prev]);
    }, mime, 0.95);
  }, [videoDimensions, captureFormat]);

  // Auto-extract 5 evenly spaced keyframes
  const extractKeyframes = async () => {
    if (!videoRef.current || !duration) return;
    setIsCapturingKeyframes(true);
    const video = videoRef.current;
    const originalTime = video.currentTime;
    const wasPlaying = !video.paused;
    if (wasPlaying) video.pause();

    const count = 5;
    const interval = duration / (count + 1);

    for (let i = 1; i <= count; i++) {
      const targetTime = interval * i;
      video.currentTime = targetTime;
      // Wait for seek to complete
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
      });

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        await new Promise<void>((resolve) => {
          canvas.toBlob((blob) => {
            if (blob) {
              const frameUrl = urlRegistry.create(blob);
              setCapturedFrames((prev) => [
                ...prev,
                {
                  id: `keyframe_${Date.now()}_${i}`,
                  blob,
                  url: frameUrl,
                  timestamp: targetTime,
                  width: canvas.width,
                  height: canvas.height,
                  format: captureFormat,
                },
              ]);
            }
            resolve();
          }, 'image/png');
        });
      }
    }

    video.currentTime = originalTime;
    setIsCapturingKeyframes(false);
  };

  // Generate Animated GIF using FFmpeg WASM
  const handleGenerateGif = async () => {
    if (!videoFile) return;
    setIsGeneratingGif(true);
    setGifProgress(0.05);
    setGifStatusText('Initializing FFmpeg WebAssembly...');
    setGifError(null);

    if (gifResult?.url) {
      urlRegistry.revoke(gifResult.url);
      setGifResult(null);
    }

    try {
      const result = await ffmpegService.convert(
        videoFile,
        videoFile.name,
        {
          targetFormat: 'gif',
          trim: {
            startTime: Math.max(0, gifStart),
            endTime: Math.min(duration, Math.max(gifStart + 0.5, gifEnd)),
          },
        },
        (ratio) => {
          setGifProgress(ratio);
          setGifStatusText(`Transcoding GIF... ${Math.round(ratio * 100)}%`);
        }
      );

      if (result.success && result.data) {
        const gifBlob = result.data;
        const url = urlRegistry.create(gifBlob);
        setGifResult({ blob: gifBlob, url, size: gifBlob.size });
      } else if (!result.success) {
        setGifError(result.error || 'Failed to render animated GIF.');
      }
    } catch (err: any) {
      setGifError(err?.message || 'Error occurred while generating animated GIF.');
    } finally {
      setIsGeneratingGif(false);
    }
  };

  const handleDownloadFrame = (frame: CapturedFrame) => {
    const baseName = videoFile ? videoFile.name.replace(/\.[^/.]+$/, '') : 'frame';
    const timeStr = frame.timestamp.toFixed(1).replace('.', '_');
    downloadBlob(frame.blob, `${baseName}-snapshot-${timeStr}s.${frame.format}`);
  };

  const handleDeleteFrame = (id: string) => {
    setCapturedFrames((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target) urlRegistry.revoke(target.url);
      return prev.filter((f) => f.id !== id);
    });
  };

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <Film className="w-5 h-5 text-purple-400" />
            <span>Video to GIF & Frame Capture Studio</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Scrub high-definition videos frame-by-frame, capture full-resolution stills, and convert clips into optimized animated GIFs.
          </p>
        </div>

        {videoFile && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (videoUrl) urlRegistry.revoke(videoUrl);
              setVideoFile(null);
              setVideoUrl(null);
              setCapturedFrames([]);
              setGifResult(null);
            }}
            icon={<Trash2 className="w-4 h-4 text-red-400" />}
          >
            Clear Video
          </Button>
        )}
      </div>

      {!videoFile ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="group relative rounded-2xl border-2 border-dashed border-zinc-800 hover:border-zinc-700 bg-zinc-900/30 hover:bg-zinc-900/50 transition-all duration-200 p-12 flex flex-col items-center justify-center text-center cursor-pointer min-h-[320px]"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleLoadVideo(file);
              e.target.value = '';
            }}
            className="hidden"
          />
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-zinc-100 group-hover:scale-105 transition-all shadow-md mb-4">
            <UploadCloud className="w-8 h-8" />
          </div>
          <h3 className="text-base font-semibold text-zinc-100 mb-1">
            Drop a video file here, or click to browse
          </h3>
          <p className="text-xs text-zinc-400 max-w-sm">
            Supports MP4, WebM, MOV, and MKV. Runs 100% locally in browser memory.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Video Player & Scrubbing Bar */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 space-y-4 shadow-xl">
            <div className="relative rounded-xl overflow-hidden bg-black flex items-center justify-center max-h-[460px]">
              <video
                ref={videoRef}
                src={videoUrl || undefined}
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={() => {
                  if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                className="max-h-[460px] max-w-full rounded-lg"
              />
            </div>

            {/* Scrubber and Time Indicators */}
            <div className="space-y-2 px-1">
              <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                <span className="text-zinc-200 font-semibold">{formatTime(currentTime)}</span>
                <span>{videoDimensions.width} × {videoDimensions.height} px · {formatBytes(videoFile.size)}</span>
                <span>{formatTime(duration)}</span>
              </div>

              {/* Progress Slider */}
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.01}
                value={currentTime}
                onChange={(e) => {
                  const t = parseFloat(e.target.value);
                  if (videoRef.current) videoRef.current.currentTime = t;
                  setCurrentTime(t);
                }}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-400"
              />

              {/* Player Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-1.5">
                  <Button variant="secondary" size="sm" onClick={() => stepFrame(-1)} title="Previous 1s">
                    -1s
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => stepFrame(-0.04)} title="Previous Frame (-0.04s)">
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={togglePlay}
                    icon={isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  >
                    {isPlaying ? 'Pause' : 'Play'}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => stepFrame(0.04)} title="Next Frame (+0.04s)">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => stepFrame(1)} title="Next 1s">
                    +1s
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={captureFormat}
                    onChange={(e) => setCaptureFormat(e.target.value as 'png' | 'jpeg')}
                    className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-300 focus:outline-none"
                  >
                    <option value="png">PNG (Lossless)</option>
                    <option value="jpeg">JPEG (Compact)</option>
                  </select>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={captureCurrentFrame}
                    icon={<Camera className="w-3.5 h-3.5 text-emerald-400" />}
                  >
                    Capture Current Frame
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={extractKeyframes}
                    loading={isCapturingKeyframes}
                    icon={<Sparkles className="w-3.5 h-3.5 text-purple-400" />}
                  >
                    Auto 5 Keyframes
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Sub-tools Grid: Animated GIF Creator & Captured Stills Gallery */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Animated GIF Creator (5 cols) */}
            <div className="lg:col-span-5 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
                <Film className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-semibold text-zinc-100">Create Animated GIF</h3>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">Start Time (s)</label>
                    <div className="flex gap-1.5">
                      <input
                        type="number"
                        min={0}
                        max={duration}
                        step={0.1}
                        value={gifStart.toFixed(1)}
                        onChange={(e) => setGifStart(parseFloat(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-100"
                      />
                      <Button variant="ghost" size="sm" onClick={() => setGifStart(currentTime)} title="Set to current playhead">
                        Now
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">End Time (s)</label>
                    <div className="flex gap-1.5">
                      <input
                        type="number"
                        min={gifStart + 0.1}
                        max={duration}
                        step={0.1}
                        value={gifEnd.toFixed(1)}
                        onChange={(e) => setGifEnd(parseFloat(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-100"
                      />
                      <Button variant="ghost" size="sm" onClick={() => setGifEnd(currentTime)} title="Set to current playhead">
                        Now
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-zinc-300">Animation Framerate:</span>
                  <div className="flex gap-1.5">
                    {[8, 10, 15].map((fps) => (
                      <button
                        key={fps}
                        type="button"
                        onClick={() => setGifFps(fps)}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer transition-colors ${
                          gifFps === fps
                            ? 'bg-purple-600 text-white font-bold'
                            : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {fps} fps
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-xs font-mono text-zinc-400 flex items-center justify-between">
                  <span>Clip Duration:</span>
                  <span className="text-zinc-200">{Math.max(0, gifEnd - gifStart).toFixed(1)} seconds</span>
                </div>

                <Button
                  variant="primary"
                  size="md"
                  className="w-full"
                  onClick={handleGenerateGif}
                  loading={isGeneratingGif}
                  icon={<Sparkles className="w-4 h-4" />}
                >
                  Render Animated GIF
                </Button>

                {isGeneratingGif && (
                  <div className="space-y-1.5 pt-2">
                    <div className="flex justify-between text-xs font-mono text-zinc-400">
                      <span>{gifStatusText}</span>
                      <span>{Math.round(gifProgress * 100)}%</span>
                    </div>
                    <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-purple-500 h-full transition-all duration-200"
                        style={{ width: `${gifProgress * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {gifError && (
                  <div className="p-3 rounded-lg border border-red-900/50 bg-red-950/30 text-xs text-red-300 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <span>{gifError}</span>
                  </div>
                )}

                {gifResult && (
                  <div className="space-y-3 pt-3 border-t border-zinc-800">
                    <div className="relative rounded-lg overflow-hidden border border-zinc-800 bg-black flex items-center justify-center max-h-[220px]">
                      <img src={gifResult.url} alt="Generated GIF" className="max-h-[220px] object-contain" />
                    </div>
                    <div className="flex items-center justify-between text-xs font-mono text-zinc-300">
                      <span>Rendered GIF</span>
                      <span>{formatBytes(gifResult.size)}</span>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        const base = videoFile.name.replace(/\.[^/.]+$/, '');
                        downloadBlob(gifResult.blob, `${base}-clip.gif`);
                      }}
                      icon={<Download className="w-4 h-4" />}
                    >
                      Download GIF
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Captured Stills Gallery (7 cols) */}
            <div className="lg:col-span-7 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-zinc-100">
                    Captured Stills ({capturedFrames.length})
                  </h3>
                </div>
                {capturedFrames.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      capturedFrames.forEach((f) => urlRegistry.revoke(f.url));
                      setCapturedFrames([]);
                    }}
                    icon={<Trash2 className="w-3.5 h-3.5 text-zinc-400" />}
                  >
                    Clear All
                  </Button>
                )}
              </div>

              {capturedFrames.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center text-zinc-500 space-y-2">
                  <Camera className="w-8 h-8 stroke-1 text-zinc-600" />
                  <p className="text-xs">No frames captured yet.</p>
                  <p className="text-[11px] text-zinc-600">
                    Click "Capture Current Frame" or "Auto 5 Keyframes" to extract video stills.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[460px] overflow-y-auto pr-1">
                  {capturedFrames.map((frame) => (
                    <div
                      key={frame.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-2.5 flex flex-col gap-2 group hover:border-zinc-700 transition-colors"
                    >
                      <div className="relative rounded-lg overflow-hidden bg-black aspect-video flex items-center justify-center">
                        <img src={frame.url} alt={`Frame at ${frame.timestamp}s`} className="object-contain w-full h-full" />
                        <span className="absolute bottom-1.5 right-1.5 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-200">
                          {formatTime(frame.timestamp)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                        <span>{frame.width} × {frame.height}</span>
                        <span>{formatBytes(frame.blob.size)}</span>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-800/80">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteFrame(frame.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          Delete
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleDownloadFrame(frame)}
                          icon={<Download className="w-3 h-3" />}
                        >
                          Download
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoGifFrames;
