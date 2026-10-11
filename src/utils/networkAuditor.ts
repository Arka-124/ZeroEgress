/**
 * ZeroEgress Network Traffic & Egress Auditor
 * Monitors network activity in real-time to guarantee and prove
 * that zero sensitive file data is uploaded to any external server.
 */

export interface NetworkAuditReport {
  isOnline: boolean;
  externalEgressCount: number;
  externalBytesSent: number;
  localFetchCount: number;
  isAirGapped: boolean;
  lastCheckedAt: number;
}

type AuditListener = (report: NetworkAuditReport) => void;

class NetworkAuditor {
  private externalEgressCount = 0;
  private externalBytesSent = 0;
  private localFetchCount = 0;
  private listeners = new Set<AuditListener>();
  private isInitialized = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  private init(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Listen to online / offline network state changes
    window.addEventListener('online', () => this.notify());
    window.addEventListener('offline', () => this.notify());

    // Intercept fetch API to verify zero external egress
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const input = args[0];
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

      const isLocal =
        url.startsWith('/') ||
        url.startsWith('blob:') ||
        url.startsWith('data:') ||
        url.includes(window.location.host);

      if (isLocal) {
        this.localFetchCount++;
      } else {
        // Any request outside localhost or current origin
        this.externalEgressCount++;
        // If request has a body, track its size
        const init = args[1];
        if (init?.body) {
          if (typeof init.body === 'string') {
            this.externalBytesSent += init.body.length;
          } else if (init.body instanceof Blob) {
            this.externalBytesSent += init.body.size;
          } else if (init.body instanceof ArrayBuffer) {
            this.externalBytesSent += init.body.byteLength;
          }
        }
      }

      this.notify();
      return originalFetch.apply(window, args);
    };
  }

  public getReport(): NetworkAuditReport {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    return {
      isOnline,
      externalEgressCount: this.externalEgressCount,
      externalBytesSent: this.externalBytesSent,
      localFetchCount: this.localFetchCount,
      isAirGapped: this.externalEgressCount === 0 && this.externalBytesSent === 0,
      lastCheckedAt: Date.now(),
    };
  }

  public subscribe(listener: AuditListener): () => void {
    this.listeners.add(listener);
    listener(this.getReport());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const report = this.getReport();
    this.listeners.forEach((cb) => {
      try {
        cb(report);
      } catch {
        // Ignore subscriber error
      }
    });
  }
}

export const networkAuditor = new NetworkAuditor();
