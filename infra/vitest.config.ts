import { defineConfig } from 'vitest/config';

// Sintetizar el stack (y hashear los assets) tarda unos segundos.
export default defineConfig({ test: { testTimeout: 60_000 } });
