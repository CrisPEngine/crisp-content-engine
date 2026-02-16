/**
 * Google Analytics gtag.js type declarations
 */

interface Window {
  gtag?: (
    command: 'config' | 'set' | 'event',
    targetId: string,
    config?: Record<string, any>
  ) => void;
}
