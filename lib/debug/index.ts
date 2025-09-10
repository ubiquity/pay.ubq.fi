/**
 * Debug Configuration System
 * Provides centralized debug logging and configuration management
 */

export interface DebugConfig {
  enabled: boolean;
  level: DebugLevel;
  modules: string[];
  timestamp: boolean;
  colors: boolean;
  persist: boolean;
  maxLogs: number;
}

export enum DebugLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

export interface DebugLog {
  timestamp: number;
  level: DebugLevel;
  module: string;
  message: string;
  data?: unknown;
  stack?: string;
}

class DebugManager {
  private config: DebugConfig;
  private logs: DebugLog[] = [];
  private modules: Set<string> = new Set();

  constructor() {
    this.config = this.loadConfig();
    this.setupConsoleOverrides();
  }

  private loadConfig(): DebugConfig {
    // Check environment variables first
    const envConfig = {
      enabled: process.env.DEBUG_ENABLED === 'true' || process.env.NODE_ENV === 'development',
      level: this.parseDebugLevel(process.env.DEBUG_LEVEL || 'INFO'),
      modules: process.env.DEBUG_MODULES ? process.env.DEBUG_MODULES.split(',') : ['*'],
      timestamp: process.env.DEBUG_TIMESTAMP !== 'false',
      colors: process.env.DEBUG_COLORS !== 'false' && process.env.NODE_ENV !== 'production',
      persist: process.env.DEBUG_PERSIST === 'true',
      maxLogs: parseInt(process.env.DEBUG_MAX_LOGS || '1000', 10)
    };

    // Try to load from localStorage in browser environments
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const stored = localStorage.getItem('ubiquity_debug_config');
        if (stored) {
          const storedConfig = JSON.parse(stored);
          return { ...envConfig, ...storedConfig };
        }
      } catch (error) {
        console.warn('Failed to load debug config from localStorage:', error);
      }
    }

    return envConfig;
  }

  private parseDebugLevel(level: string): DebugLevel {
    switch (level.toUpperCase()) {
      case 'ERROR': return DebugLevel.ERROR;
      case 'WARN': return DebugLevel.WARN;
      case 'INFO': return DebugLevel.INFO;
      case 'DEBUG': return DebugLevel.DEBUG;
      case 'TRACE': return DebugLevel.TRACE;
      default: return DebugLevel.INFO;
    }
  }

  private setupConsoleOverrides() {
    if (!this.config.enabled || process.env.NODE_ENV === 'production') {
      return;
    }

    // Store original console methods
    const originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug
    };

    // Override console methods to capture debug logs
    console.log = (...args) => {
      this.log(DebugLevel.INFO, 'console', args.join(' '));
      originalConsole.log(...args);
    };

    console.info = (...args) => {
      this.log(DebugLevel.INFO, 'console', args.join(' '));
      originalConsole.info(...args);
    };

    console.warn = (...args) => {
      this.log(DebugLevel.WARN, 'console', args.join(' '));
      originalConsole.warn(...args);
    };

    console.error = (...args) => {
      this.log(DebugLevel.ERROR, 'console', args.join(' '));
      originalConsole.error(...args);
    };

    console.debug = (...args) => {
      this.log(DebugLevel.DEBUG, 'console', args.join(' '));
      originalConsole.debug(...args);
    };
  }

  public isModuleEnabled(module: string): boolean {
    if (!this.config.enabled) return false;
    if (this.config.modules.includes('*')) return true;
    return this.config.modules.some(m => 
      module.startsWith(m) || module.match(new RegExp(m.replace('*', '.*')))
    );
  }

  public log(level: DebugLevel, module: string, message: string, data?: unknown): void {
    if (!this.config.enabled) return;
    if (level > this.config.level) return;
    if (!this.isModuleEnabled(module)) return;

    const logEntry: DebugLog = {
      timestamp: Date.now(),
      level,
      module,
      message,
      data,
      stack: level === DebugLevel.ERROR ? new Error().stack : undefined
    };

    // Add to internal log storage
    this.logs.push(logEntry);
    if (this.logs.length > this.config.maxLogs) {
      this.logs.shift(); // Remove oldest log
    }

    // Register module
    this.modules.add(module);

    // Output to console
    this.outputToConsole(logEntry);

    // Persist if enabled
    if (this.config.persist) {
      this.persistLog(logEntry);
    }
  }

  private outputToConsole(log: DebugLog): void {
    const levelNames = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'];
    const levelColors = ['\x1b[31m', '\x1b[33m', '\x1b[36m', '\x1b[32m', '\x1b[35m'];
    const reset = '\x1b[0m';

    let output = '';
    
    if (this.config.timestamp) {
      const timestamp = new Date(log.timestamp).toISOString();
      output += `[${timestamp}] `;
    }

    if (this.config.colors && process.env.NODE_ENV !== 'production') {
      output += `${levelColors[log.level]}[${levelNames[log.level]}]${reset} `;
      output += `\x1b[90m[${log.module}]${reset} `;
    } else {
      output += `[${levelNames[log.level]}] [${log.module}] `;
    }

    output += log.message;

    // Use appropriate console method
    switch (log.level) {
      case DebugLevel.ERROR:
        console.error(output, log.data || '');
        if (log.stack) console.error(log.stack);
        break;
      case DebugLevel.WARN:
        console.warn(output, log.data || '');
        break;
      case DebugLevel.DEBUG:
        console.debug(output, log.data || '');
        break;
      default:
        console.log(output, log.data || '');
    }
  }

  private persistLog(log: DebugLog): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const key = `ubiquity_debug_log_${log.timestamp}`;
        localStorage.setItem(key, JSON.stringify(log));
        
        // Clean up old logs
        const keys = Object.keys(localStorage).filter(k => k.startsWith('ubiquity_debug_log_'));
        if (keys.length > this.config.maxLogs) {
          keys.sort().slice(0, keys.length - this.config.maxLogs).forEach(k => {
            localStorage.removeItem(k);
          });
        }
      } catch (error) {
        console.warn('Failed to persist debug log:', error);
      }
    }
  }

  public updateConfig(updates: Partial<DebugConfig>): void {
    this.config = { ...this.config, ...updates };
    
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem('ubiquity_debug_config', JSON.stringify(this.config));
      } catch (error) {
        console.warn('Failed to persist debug config:', error);
      }
    }
  }

  public getConfig(): DebugConfig {
    return { ...this.config };
  }

  public getLogs(module?: string, level?: DebugLevel): DebugLog[] {
    let filteredLogs = [...this.logs];
    
    if (module) {
      filteredLogs = filteredLogs.filter(log => log.module === module);
    }
    
    if (level !== undefined) {
      filteredLogs = filteredLogs.filter(log => log.level >= level);
    }
    
    return filteredLogs;
  }

  public getModules(): string[] {
    return Array.from(this.modules).sort();
  }

  public clearLogs(): void {
    this.logs = [];
    
    if (typeof window !== 'undefined' && window.localStorage) {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('ubiquity_debug_log_'));
      keys.forEach(k => localStorage.removeItem(k));
    }
  }

  public createLogger(module: string) {
    return {
      error: (message: string, data?: unknown) => this.log(DebugLevel.ERROR, module, message, data),
      warn: (message: string, data?: unknown) => this.log(DebugLevel.WARN, module, message, data),
      info: (message: string, data?: unknown) => this.log(DebugLevel.INFO, module, message, data),
      debug: (message: string, data?: unknown) => this.log(DebugLevel.DEBUG, module, message, data),
      trace: (message: string, data?: unknown) => this.log(DebugLevel.TRACE, module, message, data),
      
      // Conditional logging
      logIf: (condition: boolean, level: DebugLevel, message: string, data?: unknown) => {
        if (condition) this.log(level, module, message, data);
      },
      
      // Performance timing
      time: (label: string) => {
        this.log(DebugLevel.DEBUG, module, `Timer started: ${label}`);
        return {
          end: () => {
            this.log(DebugLevel.DEBUG, module, `Timer ended: ${label}`);
          }
        };
      },
      
      // Group logging
      group: (label: string) => {
        this.log(DebugLevel.INFO, module, `--- ${label} ---`);
        return {
          end: () => {
            this.log(DebugLevel.INFO, module, `--- End ${label} ---`);
          }
        };
      }
    };
  }
}

// Singleton instance
const debugManager = new DebugManager();

// Export utilities
export const debug = debugManager;
export const createLogger = (module: string) => debugManager.createLogger(module);
export const updateDebugConfig = (config: Partial<DebugConfig>) => debugManager.updateConfig(config);
export const getDebugConfig = () => debugManager.getConfig();
export const getDebugLogs = (module?: string, level?: DebugLevel) => debugManager.getLogs(module, level);
export const getDebugModules = () => debugManager.getModules();
export const clearDebugLogs = () => debugManager.clearLogs();

// Environment helpers
export const isDebugEnabled = () => debugManager.getConfig().enabled;
export const isDevelopment = () => process.env.NODE_ENV === 'development';
export const isProduction = () => process.env.NODE_ENV === 'production';

// React hooks (if in React environment)
if (typeof window !== 'undefined') {
  (window as any).UbiquityDebug = {
    debug: debugManager,
    updateConfig: updateDebugConfig,
    getConfig: getDebugConfig,
    getLogs: getDebugLogs,
    getModules: getDebugModules,
    clearLogs: clearDebugLogs,
    DebugLevel
  };
}

// Default export
export default debugManager;
