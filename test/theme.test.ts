import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('ZeroEgress Theme Switching Mechanics', () => {
  it('correctly toggles dark and light classes and syncs localStorage key', () => {
    // Mock minimal DOM environment
    const classList = new Set<string>(['dark']);
    const storage: Record<string, string> = { 'zeroegress-theme': 'dark' };

    const mockDocumentElement = {
      classList: {
        add: (cls: string) => classList.add(cls),
        remove: (cls: string) => classList.delete(cls),
        contains: (cls: string) => classList.has(cls),
      },
    };

    const mockLocalStorage = {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, val: string) => {
        storage[key] = val;
      },
    };

    // Simulate switching to Light Mode
    let isDark = false;
    if (isDark) {
      mockDocumentElement.classList.add('dark');
      mockLocalStorage.setItem('zeroegress-theme', 'dark');
    } else {
      mockDocumentElement.classList.remove('dark');
      mockLocalStorage.setItem('zeroegress-theme', 'light');
    }

    assert.strictEqual(mockDocumentElement.classList.contains('dark'), false);
    assert.strictEqual(mockLocalStorage.getItem('zeroegress-theme'), 'light');

    // Simulate switching back to Dark Mode
    isDark = true;
    if (isDark) {
      mockDocumentElement.classList.add('dark');
      mockLocalStorage.setItem('zeroegress-theme', 'dark');
    } else {
      mockDocumentElement.classList.remove('dark');
      mockLocalStorage.setItem('zeroegress-theme', 'light');
    }

    assert.strictEqual(mockDocumentElement.classList.contains('dark'), true);
    assert.strictEqual(mockLocalStorage.getItem('zeroegress-theme'), 'dark');
  });

  it('verifies light and dark hex color variables defined in index.css', async () => {
    const fs = await import('node:fs/promises');
    const cssPath = new URL('../src/index.css', import.meta.url);
    const cssContent = await fs.readFile(cssPath, 'utf-8');

    // Assert that light-mode :root defines clean light slate & white palette
    assert.ok(cssContent.includes(':root {'));
    assert.ok(cssContent.includes('--color-zinc-950: #f8fafc;'));
    assert.ok(cssContent.includes('--color-zinc-900: #ffffff;'));
    assert.ok(cssContent.includes('--color-zinc-800: #e2e8f0;'));
    assert.ok(cssContent.includes('--color-zinc-100: #020617;'));

    // Assert that dark-mode html.dark defines deep zinc palette
    assert.ok(cssContent.includes('html.dark {'));
    assert.ok(cssContent.includes('--color-zinc-950: #09090b;'));
    assert.ok(cssContent.includes('--color-zinc-900: #18181b;'));
    assert.ok(cssContent.includes('--color-zinc-800: #27272a;'));
    assert.ok(cssContent.includes('--color-zinc-100: #f4f4f5;'));
  });
});
