import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'] },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
