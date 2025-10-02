declare module 'spark-md5';

declare global {
  interface Window {
    // Global cache for chat profile data keyed by lowercased email
    carcloutProfileCache?: Record<string, unknown>;
    umami?: import("@/lib/umami").UmamiClient;
  }
}

export {};

