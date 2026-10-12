import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Film,
  Music,
  Scissors,
  Download,
  UploadCloud,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  FileAudio,
  FileVideo,
  Sliders,
} from 'lucide-react';
import { engine } from '../../engine';
import type { AudioBitratePreset, MediaOptions, TaskResult } from '../../engine/types';
import { formatBytes, downloadBlob } from '../../utils/fileUtils';
import { urlRegistry } from '../../utils/urlRegistry';

type MediaCategory = 'audio' | 'video';

const AUDIO_FORMATS = ['mp3', 'wav', 'aac', 'ogg', 'flac'] as const;
const VIDEO_FORMATS = ['mp4', 'webm'] as const;

function formatSeconds(secs: number): string {
  if (isNaN(secs) || secs < 0) return '00:00.0';
  const mins = Math.floor(secs / 60);
  const remainingSecs = (secs % 60).toFixed(1);
  const formattedSecs = parseFloat(remainingSecs) < 10 ? `0${remainingSecs}` : remainingSecs;
  const formattedMins = mins < 10 ? `0${mins}` : `${mins}`;
  return `${formattedMins}:${formattedSecs}`;
}

export const MediaTools: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<MediaCategory>('video');
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);

  // Trimming parameters
  const [isTrimEnabled, setIsTrimEnabled] = useState(false);
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(0);
  const [isLosslessTrim, setIsLosslessTrim] = useState(true);

  // Conversion targets
  const [targetFormat, setTargetFormat] = useState<string>('mp3');
  const [bitrate, setBitrate] = useState<AudioBitratePreset>('192k');

  // Transcoding State
  const [isEngineReady, setIsEngineReady] = useState(() => !!engine.isMediaEngineLoaded?.());
  const [isConverting, setIsConverting] = useState(false);
  const [progressRatio, setProgressRatio] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<TaskResult<Blob> | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up object URLs on unmount or file change
  useEffect(() => {
    return () => {
      if (mediaUrl) urlRegistry.revoke(mediaUrl);
      if (resultUrl) urlRegistry.revoke(resultUrl);
    };
  }, [mediaUrl, resultUrl]);

  // Handle media metadata load to extract natural duration
  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLMediaElement>) => {
    const mediaElem = e.currentTarget;
    const naturalDur = mediaElem.duration;
    if (naturalDur && !isNaN(naturalDur) && isFinite(naturalDur)) {
      setDuration(naturalDur);
      setTrimStart(0);
      setTrimEnd(naturalDur);
    }
  };

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLMediaElement>) => {
    setCurrentTime(e.currentTarget.currentTime);
  };

  // Set file and determine media category
  const loadMediaFile = useCallback((file: File) => {
    // Revoke previous URLs
    if (mediaUrl) urlRegistry.revoke(mediaUrl);
    if (resultUrl) urlRegistry.revoke(resultUrl);
    setResult(null);
    setResultUrl(null);
    setErrorMessage(null);
    setProgressRatio(0);
    setElapsedSeconds(0);

    const isAudio =
      file.type.startsWith('audio/') ||
      /\.(mp3|wav|ogg|aac|flac|m4a|wma)$/i.test(file.name);

    const detectedCat: MediaCategory = isAudio ? 'audio' : 'video';
    setMediaType(detectedCat);
    setSelectedFile(file);

    const objUrl = urlRegistry.create(file);
    setMediaUrl(objUrl);

    // Default target format: if video, offer MP3 audio extraction by default or MP4
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (detectedCat === 'video') {
      setTargetFormat('mp3'); // Common workflow: extract audio
    } else {
      setTargetFormat(ext === 'mp3' ? 'wav' : 'mp3');
    }
  }, [mediaUrl, resultUrl]);

  // Global window drop listener
  useEffect(() => {
    const handleGlobalDrop = (e: Event) => {
      const customEvent = e as CustomEvent<File[]>;
      const files = customEvent.detail;
      if (!files || files.length === 0) return;

      const file = files[0];
      const isMedia =
        file.type.startsWith('video/') ||
        file.type.startsWith('audio/') ||
        /\.(mp4|mkv|webm|avi|mov|mp3|wav|ogg|aac|flac|m4a)$/i.test(file.name);

      if (isMedia) {
        loadMediaFile(file);
      }
    };

    window.addEventListener('zeroegress:files-dropped', handleGlobalDrop as EventListener);
    return () => {
      window.removeEventListener('zeroegress:files-dropped', handleGlobalDrop as EventListener);
    };
  }, [loadMediaFile]);

  // Timer for elapsed seconds during transcoding
  useEffect(() => {
    if (!isConverting) return;
    const start = Date.now();
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
    }, 500);

    return () => clearInterval(timer);
  }, [isConverting]);

  // Execute conversion
  const handleStartConversion = async () => {
    if (!selectedFile) return;

    setIsConverting(true);
    setElapsedSeconds(0);
    setErrorMessage(null);
    setResult(null);
    if (resultUrl) urlRegistry.revoke(resultUrl);
    setResultUrl(null);
    setProgressRatio(0.05);
    setStatusMessage('Preparing WebAssembly FFmpeg environment...');

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const options: MediaOptions = {
        targetFormat,
        bitrate,
        losslessTrim: isLosslessTrim,
      };

      if (isTrimEnabled) {
        options.trim = {
          startTime: trimStart,
          endTime: trimEnd,
        };
      }

      setStatusMessage('Transcoding media streams (100% in-browser)...');

      const conversionResult = await engine.convertMedia(
        selectedFile,
        targetFormat,
        options,
        (ratio) => {
          setProgressRatio(Math.min(1.0, Math.max(0, ratio)));
          if (ratio < 0.3) {
            setStatusMessage('Loading audio/video demuxers...');
          } else if (ratio < 0.9) {
            setStatusMessage(`Processing stream: ${Math.round(ratio * 100)}%`);
          } else {
            setStatusMessage('Writing final media container...');
          }
        },
        abortController.signal
      );

      if (conversionResult.success) {
        setResult(conversionResult);
        const outUrl = urlRegistry.create(conversionResult.data);
        setResultUrl(outUrl);
        setIsEngineReady(true);
      } else {
        setErrorMessage(conversionResult.error);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.message?.includes('cancelled')) {
        setErrorMessage('Transcoding cancelled by user.');
      } else {
        setErrorMessage(err?.message || 'Media transcoding failed.');
      }
    } finally {
      setIsConverting(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelConversion = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsConverting(false);
  };

  const handleDownloadResult = () => {
    if (result && result.success) {
      downloadBlob(result.data, result.outputFileName);
    }
  };

  const handleClear = () => {
    if (mediaUrl) urlRegistry.revoke(mediaUrl);
    if (resultUrl) urlRegistry.revoke(resultUrl);
    setSelectedFile(null);
    setMediaUrl(null);
    setResult(null);
    setResultUrl(null);
    setErrorMessage(null);
    setDuration(0);
    setCurrentTime(0);
  };

  // Mark In / Mark Out helper
  const handleMarkIn = () => {
    const target = mediaType === 'video' ? videoRef.current : audioRef.current;
    if (target) {
      const cur = target.currentTime;
      setTrimStart(Math.min(cur, trimEnd));
      setIsTrimEnabled(true);
    }
  };

  const handleMarkOut = () => {
    const target = mediaType === 'video' ? videoRef.current : audioRef.current;
    if (target) {
      const cur = target.currentTime;
      setTrimEnd(Math.max(cur, trimStart));
      setIsTrimEnabled(true);
    }
  };

  const isTargetAudioOnly = AUDIO_FORMATS.includes(targetFormat as any);
  const inputExt = (selectedFile?.name.split('.').pop() || '').toLowerCase();
  const canLossless = isTrimEnabled && inputExt === targetFormat;

  return (
    <div className="space-y-6">
      {/* Top Banner / Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
            <Film className="w-5 h-5 text-sky-400" />
            <span>Media Studio & WebAssembly Transcoder</span>
          </h2>
          <p className="text-xs text-zinc-400 font-mono mt-0.5">
            Video to Audio extraction · Stream trimming · Zero server uploads
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span
            className={`w-2 h-2 rounded-full ${
              isEngineReady ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'
            }`}
          />
          <span className="text-zinc-400">
            {isEngineReady ? 'FFmpeg WASM Loaded' : 'FFmpeg (Lazy on Demand)'}
          </span>
        </div>
      </div>

      {/* 1. Dropzone if no file selected */}
      {!selectedFile && (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="group relative rounded-2xl border-2 border-dashed border-zinc-800 hover:border-zinc-700 bg-zinc-900/30 hover:bg-zinc-900/50 transition-all duration-200 p-12 flex flex-col items-center justify-center text-center cursor-pointer shadow-inner"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,audio/*,.mkv,.mp4,.webm,.avi,.mov,.mp3,.wav,.ogg,.aac,.flac,.m4a"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) loadMediaFile(file);
              e.target.value = '';
            }}
            className="hidden"
          />

          <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-zinc-100 group-hover:scale-105 transition-all shadow-md mb-4">
            <UploadCloud className="w-8 h-8 text-sky-400" />
          </div>

          <h3 className="text-base font-semibold text-zinc-100 mb-1">
            Drop audio or video files here, or click to browse
          </h3>
          <p className="text-xs text-zinc-400 max-w-md font-mono">
            Supports MP4, WebM, MKV, AVI, MP3, WAV, AAC, OGG, FLAC.
            <br />
            100% processed in-browser with WebAssembly.
          </p>
        </div>
      )}

      {/* 2. Media Player & Interactive Timeline */}
      {selectedFile && mediaUrl && (
        <div className="space-y-6">
          {/* File Header Bar */}
          <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-300 shrink-0">
                {mediaType === 'video' ? (
                  <FileVideo className="w-5 h-5 text-sky-400" />
                ) : (
                  <FileAudio className="w-5 h-5 text-emerald-400" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-100 truncate">{selectedFile.name}</p>
                <p className="text-xs font-mono text-zinc-400 flex items-center gap-2">
                  <span>{formatBytes(selectedFile.size)}</span>
                  <span>·</span>
                  <span>{formatSeconds(duration)}</span>
                  <span>·</span>
                  <span className="uppercase">{inputExt}</span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClear}
              className="p-2 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-zinc-800/80 transition-colors cursor-pointer"
              title="Clear media"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Interactive Player Section */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 md:p-6 space-y-4">
            {mediaType === 'video' ? (
              <div className="relative rounded-xl overflow-hidden bg-black aspect-video max-h-[460px] lg:max-h-[560px] xl:max-h-[640px] flex items-center justify-center mx-auto border border-zinc-900 shadow-2xl w-full">
                <video
                  ref={videoRef}
                  src={mediaUrl}
                  controls
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="p-8 rounded-xl bg-zinc-900/50 border border-zinc-800 flex flex-col items-center justify-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-emerald-400 shadow-lg">
                  <Music className="w-8 h-8 animate-pulse" />
                </div>
                <audio
                  ref={audioRef}
                  src={mediaUrl}
                  controls
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  className="w-full max-w-xl"
                />
              </div>
            )}

            {/* Trimming Controls & Timeline Sliders */}
            <div className="pt-2 border-t border-zinc-800/80 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsTrimEnabled((prev) => !prev)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                      isTrimEnabled
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                        : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-zinc-200'
                    }`}
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>{isTrimEnabled ? 'Trimming Active' : 'Enable Stream Trimmer'}</span>
                  </button>

                  {isTrimEnabled && canLossless && (
                    <label className="flex items-center gap-1.5 text-xs text-zinc-300 font-mono cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isLosslessTrim}
                        onChange={(e) => setIsLosslessTrim(e.target.checked)}
                        className="rounded border-zinc-700 bg-zinc-900 text-sky-500 focus:ring-0"
                      />
                      <span>Lossless Stream Copy (-c copy)</span>
                    </label>
                  )}
                </div>

                {isTrimEnabled && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleMarkIn}
                      className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-xs font-mono text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer"
                      title="Set start to current playhead"
                    >
                      [ Mark In
                    </button>
                    <button
                      type="button"
                      onClick={handleMarkOut}
                      className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-xs font-mono text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer"
                      title="Set end to current playhead"
                    >
                      Mark Out ]
                    </button>
                  </div>
                )}
              </div>

              {/* Sliders when trim enabled */}
              {isTrimEnabled && duration > 0 && (
                <div className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-900/30 space-y-4 font-mono text-xs">
                  {/* Visual Range Display */}
                  <div className="flex flex-wrap items-center justify-between text-zinc-400 text-[11px] gap-2">
                    <span>Start: {formatSeconds(trimStart)}</span>
                    <span className="text-zinc-500">Playhead: {formatSeconds(currentTime)}</span>
                    <span className="text-sky-400 font-bold">
                      Segment: {formatSeconds(Math.max(0, trimEnd - trimStart))}
                    </span>
                    <span>End: {formatSeconds(trimEnd)}</span>
                  </div>

                  {/* Dual Sliders */}
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                        <span>Trim Start Handle</span>
                        <span>{formatSeconds(trimStart)}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={duration}
                        step={0.1}
                        value={trimStart}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setTrimStart(Math.min(val, trimEnd));
                        }}
                        className="w-full accent-sky-400 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                        <span>Trim End Handle</span>
                        <span>{formatSeconds(trimEnd)}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={duration}
                        step={0.1}
                        value={trimEnd}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setTrimEnd(Math.max(val, trimStart));
                        }}
                        className="w-full accent-sky-400 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 3. Output Configuration & Presets */}
          <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 space-y-6">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-sky-400" />
              <span>Target Conversion & Encoding Presets</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Target Format */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-300">Target Output Format:</label>
                <div className="flex flex-wrap gap-1.5">
                  <div className="w-full text-[10px] text-zinc-500 font-mono mb-0.5">
                    Audio Extraction / Conversion:
                  </div>
                  {AUDIO_FORMATS.map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setTargetFormat(fmt)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase cursor-pointer transition-all ${
                        targetFormat === fmt
                          ? 'bg-zinc-100 text-zinc-950 font-bold shadow-sm'
                          : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-zinc-200'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}

                  {mediaType === 'video' && (
                    <>
                      <div className="w-full text-[10px] text-zinc-500 font-mono mt-2 mb-0.5">
                        Video Container:
                      </div>
                      {VIDEO_FORMATS.map((fmt) => (
                        <button
                          key={fmt}
                          type="button"
                          onClick={() => setTargetFormat(fmt)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase cursor-pointer transition-all ${
                            targetFormat === fmt
                              ? 'bg-zinc-100 text-zinc-950 font-bold shadow-sm'
                              : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-zinc-200'
                          }`}
                        >
                          {fmt}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </div>

              {/* Bitrate presets (for audio output) */}
              {isTargetAudioOnly && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-300">Audio Bitrate Preset:</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['128k', '192k', '320k'] as AudioBitratePreset[]).map((br) => (
                      <button
                        key={br}
                        type="button"
                        onClick={() => setBitrate(br)}
                        className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                          bitrate === br
                            ? 'border-sky-500/50 bg-sky-500/10 text-sky-300 font-semibold'
                            : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <p className="text-xs font-mono font-bold uppercase">{br}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          {br === '128k' ? 'Compact' : br === '192k' ? 'High Fidelity' : 'Studio'}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action Button & Live Progress */}
            <div className="pt-4 border-t border-zinc-800/80 flex flex-col gap-4">
              {!isConverting ? (
                <button
                  type="button"
                  onClick={handleStartConversion}
                  className="w-full py-3.5 rounded-xl bg-zinc-100 text-zinc-950 font-semibold text-sm hover:bg-white transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>
                    Convert & Export ({selectedFile.name} → .{targetFormat})
                  </span>
                </button>
              ) : (
                <div className="p-4 rounded-xl border border-sky-500/30 bg-sky-950/20 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-sky-200 flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                      <span>{statusMessage}</span>
                    </span>
                    <span className="font-mono text-zinc-400">
                      Elapsed: {elapsedSeconds}s · {Math.round(progressRatio * 100)}%
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden">
                    <div
                      className="h-full bg-sky-400 transition-all duration-300 ease-out"
                      style={{ width: `${Math.round(progressRatio * 100)}%` }}
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleCancelConversion}
                      className="flex items-center gap-1.5 px-3 py-1 rounded bg-zinc-900 border border-zinc-800 text-xs font-medium text-rose-400 hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Cancel</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Error Alert */}
              {errorMessage && (
                <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-950/20 flex items-center gap-3 text-rose-300 text-xs font-mono">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Result Preview & Download */}
              {result && result.success && resultUrl && (
                <div className="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 space-y-4 animate-in fade-in duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-emerald-200">
                          Conversion Completed Successfully!
                        </p>
                        <p className="text-xs font-mono text-emerald-400/80 mt-0.5">
                          {result.outputFileName} · {formatBytes(result.resultSize)} · Finished in{' '}
                          {(result.durationMs / 1000).toFixed(1)}s
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleDownloadResult}
                      className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-zinc-950 font-bold text-xs hover:bg-emerald-400 transition-all cursor-pointer shadow-md"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Clean File</span>
                    </button>
                  </div>

                  {/* Inline result playback preview */}
                  <div className="pt-3 border-t border-emerald-500/20">
                    <p className="text-xs font-mono text-zinc-400 mb-2">Preview Transcoded File:</p>
                    {isTargetAudioOnly ? (
                      <audio src={resultUrl} controls className="w-full max-w-xl" />
                    ) : (
                      <video src={resultUrl} controls className="w-full max-w-3xl rounded-lg border border-zinc-800" />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaTools;
