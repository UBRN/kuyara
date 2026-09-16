// ESLint and the shared Expo config are installed in apps/mobile, which lints itself with its
// own config. Resolving them from there lets the Worker and the contracts package share that
// rule set (TypeScript, import ordering, unused variables) without a second toolchain copy.
const { createRequire } = require('node:module');

const requireFromMobile = createRequire(require.resolve('./apps/mobile/package.json'));
const { defineConfig } = requireFromMobile('eslint/config');
const expoConfig = requireFromMobile('eslint-config-expo/flat');

module.exports = defineConfig([
  {
    files: ['apps/worker/src/**/*.{ts,js,mjs,cjs}', 'packages/contracts/src/**/*.{ts,js,mjs,cjs}'],
    extends: [expoConfig],
    // Neither package renders JSX, so the shared config's React rules never fire and its
    // "detect" setting has no react package to read here.
    settings: { react: { version: '19.2' } },
    // The Node test files run under `node --test`; the shared config declares the rest of the
    // Node globals they use but not Buffer.
    languageOptions: { globals: { Buffer: 'readonly' } },
  },
]);
