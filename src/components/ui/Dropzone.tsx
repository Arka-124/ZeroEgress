import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, FolderUp } from 'lucide-react';

export interface DropzoneProps {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  title?: string;
  subtitle?: string;
  hint?: string;
  className?: string;
}

export const Dropzone: React.FC<DropzoneProps> = ({
  onFilesSelected,
  accept,
  multiple = true,
  title = 'Drag & drop files here',
  subtitle = 'or click to browse from device',
  hint = '100% Client-Side Processing · Never Uploaded',
  className = '',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      onFilesSelected(filesArray);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      onFilesSelected(filesArray);
      e.target.value = ''; // Reset input to allow selecting the same file again
    }
  };

  // Support clipboard paste (e.g. pasting a copied screenshot or file)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
        const filesArray = Array.from(e.clipboardData.files);
        // If accept filter exists, filter out mismatched files
        if (accept) {
          const matched = filesArray.filter((file) => {
            if (accept.includes('image/*') && file.type.startsWith('image/')) return true;
            if (accept.includes('pdf') && file.type.includes('pdf')) return true;
            return true;
          });
          if (matched.length > 0) {
            onFilesSelected(matched);
          }
        } else {
          onFilesSelected(filesArray);
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [accept, onFilesSelected]);

  return (
    <div
      ref={dropzoneRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`relative group cursor-pointer border border-dashed rounded-xl p-5 sm:p-8 transition-all duration-200 text-center select-none ${
        isDragging
          ? 'border-zinc-300 bg-zinc-900/80 scale-[1.005]'
          : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 hover:bg-zinc-900/30'
      } ${className}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        onChange={handleInputChange}
        className="hidden"
      />

      <div className="flex flex-col items-center justify-center space-y-3 pointer-events-none">
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
            isDragging
              ? 'bg-zinc-100 text-zinc-950'
              : 'bg-zinc-900 border border-zinc-800 text-zinc-400 group-hover:text-zinc-200 group-hover:border-zinc-700'
          }`}
        >
          {isDragging ? <FolderUp className="w-6 h-6" /> : <UploadCloud className="w-6 h-6" />}
        </div>

        <div>
          <p className="text-sm font-medium text-zinc-200">{title}</p>
          <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] text-zinc-500 font-mono text-center">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500/80" />
          <span>{hint}</span>
          <span className="text-zinc-600">·</span>
          <kbd className="border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 rounded text-[10px] text-zinc-400">
            Ctrl+V paste
          </kbd>
        </div>
      </div>
    </div>
  );
};
