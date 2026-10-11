import React, { useState, useEffect } from 'react';
import { ImageIcon, FileText, Shield } from 'lucide-react';
import { Header } from './components/Header';
import { ImageConverter } from './components/ImageConverter/ImageConverter';
import { PdfTools } from './components/PdfTools/PdfTools';
import { PrivacyInfo } from './components/PrivacyInfo';

type ActiveTool = 'image' | 'pdf';

export const App: React.FC = () => {
  const [activeTool, setActiveTool] = useState<ActiveTool>('image');
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('zeroegress-theme');
      return saved ? saved === 'dark' : true; // Default dark mode
    }
    return true;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('zeroegress-theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('zeroegress-theme', 'light');
    }
  }, [isDark]);

  const toggleTheme = () => setIsDark((prev) => !prev);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans transition-colors selection:bg-zinc-800 selection:text-zinc-100">
      {/* Top Header */}
      <Header
        isDark={isDark}
        onToggleTheme={toggleTheme}
        onOpenPrivacyInfo={() => setIsPrivacyOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 space-y-8">
        {/* Tool Switcher Navigation (Linear / Raycast utilitarian tab bar) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="inline-flex p-1 rounded-xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm self-start">
            <button
              type="button"
              onClick={() => setActiveTool('image')}
              className={`flex items-center gap-2.5 px-4 py-2 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer ${
                activeTool === 'image'
                  ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              <span>Instant Image Converter</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTool('pdf')}
              className={`flex items-center gap-2.5 px-4 py-2 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer ${
                activeTool === 'pdf'
                  ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>PDF Split & Merge</span>
            </button>
          </div>

          {/* Quick Architecture Callout */}
          <div className="hidden md:flex items-center gap-3 text-xs text-zinc-400 font-mono">
            <span className="flex items-center gap-1.5 text-zinc-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Engine: Browser WebAssembly
            </span>
            <span className="text-zinc-600">·</span>
            <button
              type="button"
              onClick={() => setIsPrivacyOpen(true)}
              className="text-zinc-400 hover:text-zinc-200 transition-colors underline underline-offset-4 decoration-zinc-700 cursor-pointer"
            >
              Verify Air-Gap
            </button>
          </div>
        </div>

        {/* Active Tool View */}
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-6 md:p-8 backdrop-blur-sm shadow-xl">
          {activeTool === 'image' && <ImageConverter />}
          {activeTool === 'pdf' && <PdfTools />}
        </div>
      </main>

      {/* Utilitarian Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950/90 py-6 text-xs text-zinc-400 transition-colors">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[11px]">
          <div className="flex items-center gap-2 text-zinc-400">
            <span className="font-semibold text-zinc-300">ZeroEgress</span>
            <span className="text-zinc-600">·</span>
            <span>No telemetry</span>
            <span className="text-zinc-600">·</span>
            <span>No logins</span>
            <span className="text-zinc-600">·</span>
            <span>100% Client-Side Sandbox</span>
          </div>

          <div className="flex items-center gap-4 text-zinc-400">
            <button
              type="button"
              onClick={() => setIsPrivacyOpen(true)}
              className="hover:text-zinc-200 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Shield className="w-3 h-3 text-emerald-400" />
              <span>Air-Gap Verification</span>
            </button>
            <span className="text-zinc-700">|</span>
            <span className="text-zinc-500">Tauri / Rust Bridge Ready</span>
          </div>
        </div>
      </footer>

      {/* Privacy and Architecture Sheet Modal */}
      <PrivacyInfo isOpen={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)} />
    </div>
  );
};

export default App;
