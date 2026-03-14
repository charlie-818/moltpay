import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const isLibraryBuild = process.env.BUILD_LIB === 'true';

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.md'],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: isLibraryBuild
    ? {
        outDir: 'dist/ui',
        lib: {
          entry: path.resolve(__dirname, 'src/ui/index.ts'),
          name: 'MoltpayUI',
          formats: ['es', 'cjs'],
          fileName: (format) => `moltpay-ui.${format}.js`,
        },
        rollupOptions: {
          external: ['react', 'react-dom'],
          output: {
            globals: {
              react: 'React',
              'react-dom': 'ReactDOM',
            },
          },
        },
      }
    : {
        outDir: 'dist/public',
      },
});
