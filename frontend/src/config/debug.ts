// Debug configuration for controlling console logging
export const DEBUG_CONFIG = {
  // Set from Vite environment variables
  VALIDATION_LOGGING: typeof import.meta.env !== "undefined" && import.meta.env.VITE_DEBUG_VALIDATION === 'true',
  WORKER_LOGGING: typeof import.meta.env !== "undefined" && import.meta.env.VITE_DEBUG_WORKER === 'true',
  
  // Feature flags
  FILTER_INVALID_PERMITS: true, // Remove invalid permits from UI
  SHOW_VALIDATION_SUMMARY: true, // Show summary instead of individual warnings
};

// Helper function for conditional logging
export const debugLog = (category: string, message: string, data?: any) => {
  if (DEBUG_CONFIG.VALIDATION_LOGGING || DEBUG_CONFIG.WORKER_LOGGING) {
    console.debug(`[${category}]`, message, data || '');
  }
};

// Export debug mode flags for use in other modules
export const DEBUG_MODE = DEBUG_CONFIG.WORKER_LOGGING;
export const DEBUG_VALIDATION = DEBUG_CONFIG.VALIDATION_LOGGING;