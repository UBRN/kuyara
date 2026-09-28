// Compiles the given source files with React Compiler and prints, as JSON, what it did:
// { [file]: { compiled: number, skipped: string[] } }. Run in its own process by
// `src/react-compiler-bailouts.test.mjs`: the Node test runner's TypeScript resolver hook
// rewrites the extensionless requires inside Babel's CommonJS packages.
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');

// Babel and the compiler are dependencies of `expo` and of its Babel preset, not of this
// package.
const expoRequire = createRequire(require.resolve('expo/package.json'));
const presetRequire = createRequire(expoRequire.resolve('babel-preset-expo'));
const babel = expoRequire('@babel/core');
const reactCompiler = presetRequire('babel-plugin-react-compiler');

const report = {};
for (const filename of process.argv.slice(2)) {
  const entry = { compiled: 0, skipped: [] };
  babel.transformSync(readFileSync(filename, 'utf8'), {
    filename,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ['jsx', 'typescript'] },
    plugins: [[reactCompiler, {
      logger: {
        logEvent(_file, event) {
          if (event.kind === 'CompileSuccess') entry.compiled += 1;
          else if (event.kind === 'CompileError' || event.kind === 'CompileSkip') {
            entry.skipped.push(`line ${event.fnLoc?.start.line}: ${event.detail?.reason ?? event.reason}`);
          }
        },
      },
    }]],
  });
  report[filename] = entry;
}
process.stdout.write(JSON.stringify(report));
