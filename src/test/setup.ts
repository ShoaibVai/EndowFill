import '@testing-library/jest-dom/vitest';

// Mock matchMedia for theme detection in tests
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// Ensure a minimal localStorage implementation exists in the jsdom test environment
// (Used by Supabase auth SDK for session persistence)
if (typeof window.localStorage === 'undefined' || typeof window.localStorage.getItem !== 'function') {
  const store: Record<string, string> = {};
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (key: string) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
      setItem: (key: string, value: string) => { store[key] = String(value); },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    },
    configurable: true,
  });
}
