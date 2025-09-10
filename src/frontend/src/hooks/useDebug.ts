import { useEffect, useState, useCallback } from 'react';

// Simple debug types
type DebugLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE';

interface SimpleLogger {
  error: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  debug: (message: string, data?: unknown) => void;
  trace: (message: string, data?: unknown) => void;
}

interface DebugConfig {
  enabled: boolean;
  level: DebugLevel;
  modules: string[];
}

// Simple debug implementation
const isDebugEnabled = () => {
  return process.env.NODE_ENV === 'development' || 
         (typeof window !== 'undefined' && window.location.search.includes('debug=true'));
};

const createSimpleLogger = (module: string): SimpleLogger => {
  const shouldLog = isDebugEnabled();
  
  const logWithModule = (method: 'log' | 'warn' | 'error' | 'info', message: string, data?: unknown) => {
    if (!shouldLog) return;
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${module}]`;
    if (data) {
      console[method](prefix, message, data);
    } else {
      console[method](prefix, message);
    }
  };
  
  return {
    error: (message, data) => logWithModule('error', message, data),
    warn: (message, data) => logWithModule('warn', message, data),
    info: (message, data) => logWithModule('info', message, data),
    debug: (message, data) => logWithModule('log', message, data),
    trace: (message, data) => logWithModule('log', message, data)
  };
};

/**
 * React hook for debug logging
 */
export function useDebug(module: string) {
  const [logger] = useState(() => createSimpleLogger(module));

  return {
    logger,
    isEnabled: isDebugEnabled(),
    
    // Convenience logging methods
    log: logger.info,
    error: logger.error,
    warn: logger.warn,
    info: logger.info,
    debug: logger.debug,
    trace: logger.trace
  };
}

/**
 * Hook for component lifecycle debugging
 */
export function useDebugLifecycle(componentName: string, props?: Record<string, unknown>) {
  const logger = createSimpleLogger(`component:${componentName}`);
  const [renderCount, setRenderCount] = useState(0);

  // Log component mount
  useEffect(() => {
    logger.info(`${componentName} mounted`, props);
    return () => {
      logger.info(`${componentName} unmounted`);
    };
  }, []);

  // Log re-renders
  useEffect(() => {
    setRenderCount(prev => {
      const newCount = prev + 1;
      if (newCount > 1) {
        logger.debug(`${componentName} re-rendered (${newCount})`, props);
      }
      return newCount;
    });
  });

  return {
    renderCount,
    logger
  };
}

// Export types
export type { DebugConfig, DebugLevel };
