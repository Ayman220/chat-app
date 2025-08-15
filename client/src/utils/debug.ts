// Debug utility for client-side debugging
export const DEBUG = process.env.REACT_APP_DEBUG === 'true' || process.env.NODE_ENV === 'development';

export const debugLog = (message: string, data?: any) => {
    if (DEBUG) {
        console.log(`🔍 [DEBUG] ${message}`, data || '');
    }
};

export const debugError = (message: string, error?: any) => {
    if (DEBUG) {
        console.error(`❌ [DEBUG ERROR] ${message}`, error || '');
    }
};

export const debugWarn = (message: string, data?: any) => {
    if (DEBUG) {
        console.warn(`⚠️ [DEBUG WARN] ${message}`, data || '');
    }
};

export const debugGroup = (label: string, fn: () => void) => {
    if (DEBUG) {
        console.group(`🔍 [DEBUG GROUP] ${label}`);
        fn();
        console.groupEnd();
    }
};

export const debugTime = (label: string) => {
    if (DEBUG) {
        console.time(`⏱️ [DEBUG TIME] ${label}`);
    }
};

export const debugTimeEnd = (label: string) => {
    if (DEBUG) {
        console.timeEnd(`⏱️ [DEBUG TIME] ${label}`);
    }
};

// Debug Redux actions
export const debugAction = (action: any) => {
    if (DEBUG) {
        console.log(`🔄 [REDUX ACTION] ${action.type}`, action.payload || '');
    }
};

// Debug API calls
export const debugApiCall = (method: string, url: string, data?: any) => {
    if (DEBUG) {
        console.log(`🌐 [API CALL] ${method} ${url}`, data || '');
    }
};

// Debug Socket events
export const debugSocketEvent = (event: string, data?: any) => {
    if (DEBUG) {
        console.log(`🔌 [SOCKET EVENT] ${event}`, data || '');
    }
};

// Debug component lifecycle
export const debugComponent = (componentName: string, lifecycle: string, props?: any) => {
    if (DEBUG) {
        console.log(`🏗️ [COMPONENT] ${componentName} - ${lifecycle}`, props || '');
    }
};

// Debug performance
export const debugPerformance = (operation: string, startTime: number) => {
    if (DEBUG) {
        const endTime = performance.now();
        const duration = endTime - startTime;
        console.log(`⚡ [PERFORMANCE] ${operation} took ${duration.toFixed(2)}ms`);
    }
};

// Debug localStorage
export const debugStorage = (operation: string, key: string, value?: any) => {
    if (DEBUG) {
        console.log(`💾 [STORAGE] ${operation} ${key}`, value || '');
    }
};

// Debug network requests
export const debugNetwork = (request: any, response?: any) => {
    if (DEBUG) {
        console.group(`🌐 [NETWORK] ${request.method} ${request.url}`);
        console.log('Request:', request);
        if (response) {
            console.log('Response:', response);
        }
        console.groupEnd();
    }
}; 