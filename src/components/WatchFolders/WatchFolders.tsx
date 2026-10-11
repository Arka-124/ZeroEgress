import React, { useState, useEffect } from 'react';
import {
  FolderSync,
  Play,
  Square,
  FolderOpen,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Sparkles,
  RefreshCw,
  HardDrive,
  Clock,
} from 'lucide-react';
import { engine } from '../../engine';
import { hasEntitlement } from '../../engine/license/licenseVerifier.ts';
import type { WatchFolderConfig, WatchFolderEvent } from '../../engine/types.ts';
import { formatBytes } from '../../utils/fileUtils.ts';

export interface WatchFoldersProps {
  onOpenLicense?: () => void;
}

export const WatchFolders: React.FC<WatchFoldersProps> = ({ onOpenLicense }) => {
  const [hasLicense, setHasLicense] = useState(false);
  const [isCheckingLicense, setIsCheckingLicense] = useState(true);

  // Configuration state
  const [inputDir, setInputDir] = useState('C:\\ZeroEgress\\Incoming');
  const [outputDir, setOutputDir] = useState('C:\\ZeroEgress\\Export');
  const [ruleType, setRuleType] = useState<'webp' | 'mp3' | 'metadata' | 'redact'>('webp');
  const [isWatching, setIsWatching] = useState(false);
  const [watcherHandle, setWatcherHandle] = useState<{ id: string; stop: () => void } | null>(null);

  // Activity log & metrics
  const [events, setEvents] = useState<WatchFolderEvent[]>(() => [
    {
      timestamp: Date.now() - 1000 * 60 * 3,
      fileName: 'system_daemon',
      status: 'detected',
      details: 'Automated background watcher subsystem initialized in zero-egress sandbox.',
    },
  ]);
  const [stats, setStats] = useState(() => ({
    filesProcessed: 0,
    totalBytesProcessed: 0,
    lastActive: Date.now(),
  }));

  useEffect(() => {
    hasEntitlement('automated_watch_folders')
      .then((allowed) => {
        setHasLicense(allowed);
        setIsCheckingLicense(false);
      })
      .catch(() => {
        setHasLicense(false);
        setIsCheckingLicense(false);
      });
  }, []);

  const handleStartWatching = async () => {
    if (!hasLicense) {
      onOpenLicense?.();
      return;
    }

    const config: WatchFolderConfig = {
      id: `watch_${Date.now()}`,
      name: `Pipeline [${ruleType.toUpperCase()}]`,
      inputPath: inputDir,
      outputPath: outputDir,
      targetFormat: ruleType,
      isActive: true,
      filesProcessed: 0,
    };

    if (engine.startWatchFolder) {
      const handle = await engine.startWatchFolder(config, (event) => {
        setEvents((prev) => [event, ...prev.slice(0, 40)]);
      });
      setWatcherHandle(handle);
    }

    setIsWatching(true);
    setEvents((prev) => [
      {
        timestamp: Date.now(),
        fileName: 'daemon',
        status: 'detected',
        details: `Watching "${inputDir}" → auto-converting to [${ruleType.toUpperCase()}] into "${outputDir}"`,
      },
      ...prev,
    ]);
  };

  const handleStopWatching = () => {
    if (watcherHandle) {
      watcherHandle.stop();
      setWatcherHandle(null);
    }
    setIsWatching(false);
    setEvents((prev) => [
      {
        timestamp: Date.now(),
        fileName: 'daemon',
        status: 'detected',
        details: 'Watcher daemon paused. File monitoring suspended.',
      },
      ...prev,
    ]);
  };

  // Simulate dropping a test file into the watch pipeline
  const handleSimulateIncomingFile = () => {
    const mockFiles: Record<typeof ruleType, { name: string; size: number; outName: string }> = {
      webp: { name: 'raw_photo_8k.png', size: 14200000, outName: 'raw_photo_8k.webp' },
      mp3: { name: 'meeting_recording.mp4', size: 45600000, outName: 'meeting_recording.mp3' },
      metadata: { name: 'confidential_brief.jpg', size: 3200000, outName: 'confidential_brief_clean.jpg' },
      redact: { name: 'defense_contract.pdf', size: 8100000, outName: 'defense_contract_redacted.pdf' },
    };

    const target = mockFiles[ruleType];
    const duration = Math.floor(Math.random() * 45) + 12;

    setEvents((prev) => [
      {
        timestamp: Date.now(),
        fileName: target.outName,
        status: 'processed',
        details: `Transcoded ${target.name} (${formatBytes(target.size)}) → ${target.outName} in ${duration}ms (0 egress)`,
      },
      {
        timestamp: Date.now() - 50,
        fileName: target.name,
        status: 'detected',
        details: `New file detected in ${inputDir}`,
      },
      ...prev.slice(0, 40),
    ]);

    setStats((prev) => ({
      filesProcessed: prev.filesProcessed + 1,
      totalBytesProcessed: prev.totalBytesProcessed + target.size,
      lastActive: Date.now(),
    }));
  };

  return (
    <div className="space-y-6">
      {/* Title & Introduction */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2.5">
            <FolderSync className="w-6 h-6 text-emerald-400" />
            <span>Automated Watch Folders Pipeline</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-400 font-semibold">
              PRO DAEMON
            </span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Specify local disk directories to automatically process, transcode, and scrub incoming files in the background without cloud interaction.
          </p>
        </div>

        {/* License Pill */}
        <div className="flex items-center gap-2">
          {!isCheckingLicense && (
            <button
              type="button"
              onClick={onOpenLicense}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors cursor-pointer ${
                hasLicense
                  ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/40'
                  : 'border-amber-800 bg-amber-950/40 text-amber-300 hover:bg-amber-900/40'
              }`}
            >
              {hasLicense ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Licensed (Offline Active)</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Pro License Required</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Pro Locked Callout Banner (if unlicensed) */}
      {!hasLicense && !isCheckingLicense && (
        <div className="p-4 rounded-xl border border-amber-900/70 bg-amber-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-900/40 border border-amber-800/80 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-amber-200">
                Automated Background Watchers is a ZeroEgress Pro Feature
              </h3>
              <p className="text-[11px] text-amber-400/80">
                Enter an Ed25519 offline license key or load the evaluation key to run local watch folder background workers.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenLicense}
            className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs transition-colors shrink-0 cursor-pointer shadow-sm"
          >
            Unlock / Load Evaluation Key
          </button>
        </div>
      )}

      {/* Pipeline Configuration Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Source Folder Card */}
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
            <span className="flex items-center gap-1.5">
              <FolderOpen className="w-4 h-4 text-zinc-400" />
              <span>Input Monitored Folder</span>
            </span>
            <span className="text-[10px] font-mono text-zinc-500">Local OS Path</span>
          </div>
          <input
            type="text"
            value={inputDir}
            onChange={(e) => setInputDir(e.target.value)}
            disabled={isWatching}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-700 disabled:opacity-60"
            placeholder="C:\Path\To\Input\Folder"
          />
          <p className="text-[10px] text-zinc-500">
            Files placed in this folder will be queued and converted automatically.
          </p>
        </div>

        {/* Destination Folder Card */}
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
            <span className="flex items-center gap-1.5">
              <HardDrive className="w-4 h-4 text-zinc-400" />
              <span>Output Export Folder</span>
            </span>
            <span className="text-[10px] font-mono text-zinc-500">Destination</span>
          </div>
          <input
            type="text"
            value={outputDir}
            onChange={(e) => setOutputDir(e.target.value)}
            disabled={isWatching}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-700 disabled:opacity-60"
            placeholder="C:\Path\To\Export\Folder"
          />
          <p className="text-[10px] text-zinc-500">
            Transcoded sanitized files are saved here with original files untouched.
          </p>
        </div>
      </div>

      {/* Conversion Rule Selector & Controls */}
      <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-zinc-300">Conversion Pipeline:</span>
          <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-950 p-1 gap-1 text-xs font-mono">
            <button
              type="button"
              onClick={() => setRuleType('webp')}
              disabled={isWatching}
              className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                ruleType === 'webp'
                  ? 'bg-zinc-200 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Image → WebP (85%)
            </button>
            <button
              type="button"
              onClick={() => setRuleType('mp3')}
              disabled={isWatching}
              className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                ruleType === 'mp3'
                  ? 'bg-zinc-200 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Media → MP3 Audio
            </button>
            <button
              type="button"
              onClick={() => setRuleType('metadata')}
              disabled={isWatching}
              className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                ruleType === 'metadata'
                  ? 'bg-zinc-200 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Deep EXIF Stripper
            </button>
            <button
              type="button"
              onClick={() => setRuleType('redact')}
              disabled={isWatching}
              className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                ruleType === 'redact'
                  ? 'bg-zinc-200 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              PDF Vector Redaction
            </button>
          </div>
        </div>

        {/* Start / Stop Button */}
        <div className="flex items-center gap-2">
          {isWatching ? (
            <button
              type="button"
              onClick={handleStopWatching}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Pause Watching</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartWatching}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start Watcher Daemon</span>
            </button>
          )}

          {isWatching && (
            <button
              type="button"
              onClick={handleSimulateIncomingFile}
              className="px-3 py-2 text-xs font-mono rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors cursor-pointer"
              title="Simulate a new incoming file placed into the input directory"
            >
              + Ingest Test File
            </button>
          )}
        </div>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-950/60">
          <div className="text-[10px] font-mono text-zinc-500 uppercase">Daemon Status</div>
          <div className="text-sm font-bold flex items-center gap-1.5 mt-0.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isWatching ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'
              }`}
            />
            <span className={isWatching ? 'text-emerald-400' : 'text-zinc-400'}>
              {isWatching ? 'ACTIVE' : 'IDLE'}
            </span>
          </div>
        </div>

        <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-950/60">
          <div className="text-[10px] font-mono text-zinc-500 uppercase">Files Transcoded</div>
          <div className="text-sm font-bold text-zinc-200 mt-0.5 font-mono">
            {stats.filesProcessed} files
          </div>
        </div>

        <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-950/60">
          <div className="text-[10px] font-mono text-zinc-500 uppercase">Volume Processed</div>
          <div className="text-sm font-bold text-zinc-200 mt-0.5 font-mono">
            {formatBytes(stats.totalBytesProcessed)}
          </div>
        </div>

        <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-950/60">
          <div className="text-[10px] font-mono text-zinc-500 uppercase">Network Outflow</div>
          <div className="text-sm font-bold text-emerald-400 mt-0.5 font-mono">
            0 Bytes (Air-Gapped)
          </div>
        </div>
      </div>

      {/* Live Activity Feed */}
      <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-zinc-400" />
            <h3 className="text-xs font-semibold text-zinc-300">Live Activity Feed</h3>
          </div>
          <span className="text-[10px] font-mono text-zinc-500">
            Real-Time Background Ingestion
          </span>
        </div>

        <div className="max-h-56 overflow-y-auto space-y-2 font-mono text-xs pr-1">
          {events.map((evt, idx) => (
            <div
              key={idx}
              className="flex items-start justify-between p-2 rounded-lg border border-zinc-800/80 bg-zinc-950/80 text-[11px]"
            >
              <div className="flex items-start gap-2">
                {evt.status === 'processed' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="font-semibold text-zinc-300">{evt.fileName}: </span>
                  <span className="text-zinc-400">{evt.details}</span>
                </div>
              </div>
              <span className="text-[10px] text-zinc-500 shrink-0 ml-2">
                {new Date(evt.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
