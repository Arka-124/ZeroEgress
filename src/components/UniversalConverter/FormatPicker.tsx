import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Archive,
  Music,
  Video,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  Compass,
  Type,
  BookOpen,
} from 'lucide-react';
import {
  type FormatCategory,
  ALL_CATEGORIES,
  FORMAT_CATALOG,
  getCompatibleOutputCategories,
  detectSourceCategory,
} from '../../engine/formatRegistry';

export interface FormatPickerProps {
  fileName: string;
  mimeType?: string;
  selectedFormat: string;
  onSelectFormat: (format: string) => void;
  disabled?: boolean;
}

const CATEGORY_ICONS: Record<FormatCategory, React.ReactNode> = {
  Archive: <Archive className="w-3.5 h-3.5 text-amber-400" />,
  Audio: <Music className="w-3.5 h-3.5 text-cyan-400" />,
  Video: <Video className="w-3.5 h-3.5 text-purple-400" />,
  Document: <FileText className="w-3.5 h-3.5 text-blue-400" />,
  Image: <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />,
  Spreadsheet: <FileSpreadsheet className="w-3.5 h-3.5 text-teal-400" />,
  Vector: <Compass className="w-3.5 h-3.5 text-rose-400" />,
  Font: <Type className="w-3.5 h-3.5 text-sky-400" />,
  Ebook: <BookOpen className="w-3.5 h-3.5 text-indigo-400" />,
};

export const FormatPicker: React.FC<FormatPickerProps> = ({
  fileName,
  mimeType,
  selectedFormat,
  onSelectFormat,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const compatibleMap = getCompatibleOutputCategories(fileName, mimeType);
  const compatibleCategories = Object.keys(compatibleMap) as FormatCategory[];

  // Determine initial category based on selected format or source category
  const [activeCategory, setActiveCategory] = useState<FormatCategory>(() => {
    for (const [cat, fmts] of Object.entries(FORMAT_CATALOG)) {
      if (fmts.includes(selectedFormat.toUpperCase())) {
        return cat as FormatCategory;
      }
    }
    return compatibleCategories[0] || detectSourceCategory(fileName, mimeType);
  });

  // Close popover when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Formats to display in the right column
  const formatsForCategory = compatibleMap[activeCategory] || FORMAT_CATALOG[activeCategory] || [];

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      {/* High-Contrast Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-semibold transition-all cursor-pointer ${
          disabled
            ? 'opacity-40 cursor-not-allowed border-zinc-800 bg-zinc-900/50 text-zinc-500'
            : isOpen
            ? 'border-emerald-500/80 bg-zinc-900 text-zinc-100 shadow-md ring-1 ring-emerald-500/30'
            : 'border-zinc-700 bg-zinc-900/90 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-850'
        }`}
        title="Select Target Conversion Format"
      >
        <span className="text-zinc-400 font-sans text-[11px]">to</span>
        <span className="text-emerald-400 font-bold uppercase">{selectedFormat}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-emerald-400' : ''
          }`}
        />
      </button>

      {/* Two-Pane Cascading Popover */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Format Selector"
          className="absolute z-50 right-0 sm:left-0 sm:right-auto mt-2 w-[340px] sm:w-[430px] h-[270px] rounded-xl border border-zinc-800 bg-[#121214] shadow-2xl backdrop-blur-md flex overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Left Column: Category Selector (~140px wide) */}
          <div className="w-[130px] sm:w-[145px] shrink-0 border-r border-zinc-800/80 bg-zinc-950/70 overflow-y-auto no-scrollbar py-1">
            {ALL_CATEGORIES.map((cat) => {
              const isCompatible = compatibleCategories.includes(cat);
              const isActive = activeCategory === cat;

              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-[11px] font-medium transition-colors text-left cursor-pointer ${
                    isActive
                      ? 'bg-zinc-800/90 text-white font-semibold'
                      : isCompatible
                      ? 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
                      : 'text-zinc-550 opacity-40 hover:opacity-75'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {CATEGORY_ICONS[cat]}
                    <span className="truncate">{cat}</span>
                  </div>
                  {isActive && <ChevronRight className="w-3 h-3 text-zinc-400 shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Right Column: Format Grid (~280px wide) */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#121214]">
            {/* Header info */}
            <div className="px-3 py-2 border-b border-zinc-800/60 flex items-center justify-between text-[10px] font-mono text-zinc-400">
              <span className="uppercase text-zinc-300 font-semibold">{activeCategory} Formats</span>
              <span>{formatsForCategory.length} options</span>
            </div>

            {/* Scrollable Format Buttons Grid */}
            <div className="flex-1 overflow-y-auto p-2 grid grid-cols-3 gap-1.5 content-start">
              {formatsForCategory.map((fmt) => {
                const isSelected = selectedFormat.toUpperCase() === fmt.toUpperCase();

                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => {
                      onSelectFormat(fmt);
                      setIsOpen(false);
                    }}
                    className={`py-2 px-2 text-center text-xs font-semibold rounded-lg border transition-all cursor-pointer font-mono ${
                      isSelected
                        ? 'bg-emerald-950/80 border-emerald-500/80 text-emerald-300 shadow-sm ring-1 ring-emerald-500/40'
                        : 'bg-[#1c1c1f] hover:bg-zinc-800 hover:border-zinc-700 border-zinc-800/80 text-zinc-200'
                    }`}
                  >
                    {fmt}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FormatPicker;
