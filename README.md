# ZeroEgress — Air-Gapped Privacy-First Web Utility Suite

> **Air-Gapped: 100% Client-Side (Zero Server Uploads)**  
> Modern, utilitarian, distraction-free file utility suite inspired by Linear, Raycast, and Apple system utilities.

---

## 1. Design & Aesthetic Philosophy

- **Visual Style**: Clean, utilitarian, and distraction-free high-contrast neutral palette (slate/zinc gray, deep black `#09090b`, clean white) with subtle 1px border lines and smooth micro-interactions.
- **UX Focus**: *"It just works."* Zero onboarding screens, zero required logins, zero popups. Drag and drop any file and get converted results in two clicks.
- **Persistent Privacy Indicator**: Active status pill badge showing `"Air-Gapped: 100% Client-Side (Zero Server Uploads)"` with live client runtime diagnostics.
- **Dark & Light Mode**: Seamless theme switching with persistent local state.

---

## 2. Decoupled Engine Layer Architecture

Conversions are **never** hardcoded directly inside UI components. ZeroEgress is architected around a decoupled abstraction layer:

```
src/
├── engine/
│   ├── types.ts                   # Standardized EngineAdapter, ConversionTask, and TaskResult interfaces
│   ├── index.ts                   # Engine singleton & module entrypoint
│   └── adapters/
│       ├── browserAdapter.ts      # Pure client-side OffscreenCanvas & pdf-lib implementation
│       └── (tauriRustAdapter.ts)  # Future native Tauri/Rust drop-in adapter
```

### Swapping Runtimes
To switch from in-browser execution to a native Tauri/Rust backend:
1. Implement `EngineAdapter` in `src/engine/adapters/tauriRustAdapter.ts`.
2. Swap the exported instance in `src/engine/index.ts`:
   ```typescript
   export const engine: EngineAdapter = isTauri ? new TauriRustAdapter() : new BrowserAdapter();
   ```
Zero UI code changes required.

---

## 3. Implemented Tools (Phase 1 MVP)

### a) Instant Image Converter
- **Formats Supported**: PNG, JPG, WebP, AVIF, SVG, BMP.
- **Processing**: 100% in-browser using HTML5 `createImageBitmap`, `OffscreenCanvas`, and 2D canvas contexts without any server interaction.
- **Capabilities**:
  - Quality slider (1–100%) with quick presets (Max Compression 65%, Balanced 85%, Lossless 98%).
  - Target format selector with real-time browser capability detection.
  - Optional dimension resizing (Max Width / Max Height) with aspect ratio preservation.
  - Clipboard paste support (`Ctrl+V` / `Cmd+V`) for immediate screenshot conversion.
  - File queue displaying thumbnail preview, natural dimensions, original size, output size, savings badge (`-42% saved`), and execution duration in milliseconds.
  - Individual one-click download & batch `"Download All as ZIP"` packaging via JSZip.

### b) PDF Split & Merge
- **Engine**: Pure client-side `pdf-lib` execution in the browser.
- **Capabilities**:
  - **Merge Mode**:
    - Multi-file drag-and-drop.
    - Reorder files with Move Up / Move Down controls.
    - Real-time client inspection showing page counts and combined totals (`X files · Y total pages`).
    - Custom output file name.
    - Fast in-browser merge with instant download.
  - **Split & Extract Mode**:
    - Real-time PDF metadata inspection (page count, dimensions).
    - **Extract Selected Pages**: Outputs a single PDF containing specified pages.
    - **Split Each Page**: Splits every page into an individual 1-page PDF bundled into a ZIP archive.
    - Flexible page range input (e.g. `1-3, 5, 8-10`).
    - **Interactive Visual Page Grid / Chips**: Clickable chips (`p.1`, `p.2`, ...) with live toggle and quick selection presets (All, Odd, Even, Clear).

---

## 4. Offline Readiness & PWA

Configured with `vite-plugin-pwa` and Workbox:
- All static assets, fonts, icons, and bundles are precached via Service Worker.
- Functions entirely without an active internet connection once loaded.
- Network status indicator dynamically reflects online / offline sandbox mode.

---

## 5. Development & Verification

### Scripts
- `npm run dev`: Start Vite development server
- `npm run build`: Production build with TypeScript validation and PWA service worker generation
- `npm test`: Run native Node.js unit test suite for PDF engine and utilities
- `npm run lint`: Run Oxlint linter
- `npm run preview`: Preview production build locally

```bash
# Run unit tests
npm test

# Build production bundle
npm run build
```
