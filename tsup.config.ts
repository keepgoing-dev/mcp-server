import { defineConfig } from 'tsup';
import path from 'path';
import fs from 'fs';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: true,
  noExternal: ['@keepgoingdev/shared'],
  external: ['@modelcontextprotocol/sdk', 'zod'],
  esbuildOptions(options) {
    // Resolve shared from TypeScript source to avoid CJS/ESM mismatch
    options.alias = {
      '@keepgoingdev/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    };
  },
  async onSuccess() {
    // Copy statusline.sh to dist so it ships with the package
    fs.copyFileSync(
      path.resolve(__dirname, 'src/cli/statusline.sh'),
      path.resolve(__dirname, 'dist/statusline.sh'),
    );
    fs.chmodSync(path.resolve(__dirname, 'dist/statusline.sh'), 0o755);
  },
});
