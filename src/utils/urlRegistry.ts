/**
 * URL Registry for Memory Safety
 * Tracks all generated Object URLs (URL.createObjectURL) to prevent memory leaks
 * during large batch conversions and ensures systematic revocation.
 */

class UrlRegistry {
  private activeUrls = new Set<string>();

  /**
   * Create and register an object URL for a given Blob or MediaSource
   */
  create(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this.activeUrls.add(url);
    return url;
  }

  /**
   * Revoke a specific tracked URL and remove from registry
   */
  revoke(url: string | undefined | null): void {
    if (!url) return;
    if (this.activeUrls.has(url)) {
      URL.revokeObjectURL(url);
      this.activeUrls.delete(url);
    } else {
      // Even if not tracked directly, attempt revocation
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore if already revoked
      }
    }
  }

  /**
   * Revoke multiple URLs in batch
   */
  revokeBatch(urls: (string | undefined | null)[]): void {
    urls.forEach((u) => this.revoke(u));
  }

  /**
   * Revoke all active tracked URLs
   */
  revokeAll(): void {
    this.activeUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore
      }
    });
    this.activeUrls.clear();
  }

  /**
   * Returns current count of active tracked URLs in memory
   */
  get count(): number {
    return this.activeUrls.size;
  }
}

export const urlRegistry = new UrlRegistry();
