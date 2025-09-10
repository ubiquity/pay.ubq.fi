/**
 * Enhanced logging utility for better console management
 * Reduces console noise while maintaining important error tracking
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface Logger {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
}

class AppLogger implements Logger {
  private isDevelopment = import.meta.env.DEV;
  private logCounts = new Map<string, number>();
  private readonly MAX_REPEATED_LOGS = 5;
  private readonly MAX_LOG_ENTRIES = 1000;
  private lastCleanup = Date.now();
  
  private cleanupLogCounts(): void {
    const now = Date.now();
    // Clean up every 5 minutes
    if (now - this.lastCleanup > 5 * 60 * 1000) {
      if (this.logCounts.size > this.MAX_LOG_ENTRIES) {
        // Clear all entries when we exceed the limit
        this.logCounts.clear();
      }
      this.lastCleanup = now;
    }
  }

  private shouldLog(level: LogLevel, message: string): boolean {
    // Always log errors
    if (level === 'error') return true;
    
    // In production, only log warnings and errors
    if (!this.isDevelopment && level === 'debug') return false;
    
    // Periodic cleanup to prevent memory leaks
    this.cleanupLogCounts();
    
    // Rate limiting for repeated messages
    const key = `${level}:${message}`;
    const count = this.logCounts.get(key) || 0;
    
    if (count >= this.MAX_REPEATED_LOGS) {
      if (count === this.MAX_REPEATED_LOGS) {
        console.warn(`[${level.toUpperCase()}] Message suppressed (repeated ${this.MAX_REPEATED_LOGS}+ times):`, message);
        this.logCounts.set(key, count + 1);
      }
      return false;
    }
    
    this.logCounts.set(key, count + 1);
    return true;
  }
  
  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug', message)) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }
  
  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info', message)) {
      console.log(`[INFO] ${message}`, ...args);
    }
  }
  
  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn', message)) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }
  
  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error', message)) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }
  
  // Special method for validation errors that can be batched
  batchValidationWarn(permits: Array<{ nonce: string; issue: string }>): void {
    if (!this.isDevelopment) return;
    
    const issues = permits.reduce((acc, permit) => {
      acc[permit.issue] = (acc[permit.issue] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.warn('[VALIDATION] Permit validation issues:', issues);
    if (permits.length > 10) {
      console.warn(`[VALIDATION] Suppressed details for ${permits.length - 10} additional permits`);
    } else {
      permits.forEach(permit => {
        console.warn(`[VALIDATION] Permit ${permit.nonce}: ${permit.issue}`);
      });
    }
  }
}

export const logger = new AppLogger();

// Helper for worker contexts where import.meta might not be available
export class WorkerLogger implements Logger {
  private logCounts = new Map<string, number>();
  private readonly MAX_REPEATED_LOGS = 3;
  private readonly MAX_LOG_ENTRIES = 500;
  private lastCleanup = Date.now();
  
  private cleanupLogCounts(): void {
    const now = Date.now();
    // Clean up every 5 minutes
    if (now - this.lastCleanup > 5 * 60 * 1000) {
      if (this.logCounts.size > this.MAX_LOG_ENTRIES) {
        // Clear all entries when we exceed the limit
        this.logCounts.clear();
      }
      this.lastCleanup = now;
    }
  }

  private shouldLog(level: LogLevel, message: string): boolean {
    if (level === 'error') return true;
    
    // Periodic cleanup to prevent memory leaks
    this.cleanupLogCounts();
    
    const key = `${level}:${message}`;
    const count = this.logCounts.get(key) || 0;
    
    if (count >= this.MAX_REPEATED_LOGS) {
      if (count === this.MAX_REPEATED_LOGS) {
        console.warn(`[WORKER-${level.toUpperCase()}] Message suppressed (repeated):`, message);
        this.logCounts.set(key, count + 1);
      }
      return false;
    }
    
    this.logCounts.set(key, count + 1);
    return true;
  }
  
  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug', message)) {
      console.log(`[WORKER-DEBUG] ${message}`, ...args);
    }
  }
  
  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info', message)) {
      console.log(`[WORKER-INFO] ${message}`, ...args);
    }
  }
  
  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn', message)) {
      console.warn(`[WORKER-WARN] ${message}`, ...args);
    }
  }
  
  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error', message)) {
      console.error(`[WORKER-ERROR] ${message}`, ...args);
    }
  }
}

export const workerLogger = new WorkerLogger();