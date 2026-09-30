// Prints one source file as React Compiler compiles it, so a test can read which inputs a
// memo block is keyed on. Run in its own process for the reason given in
// `react-compiler-report.cjs`.
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');

const expoRequire = createRequire(require.resolve('expo/package.json'));
const presetRequire = createRequire(expoRequire.resolve('babel-preset-expo'));
const babel = expoRequire('@babel/core');
const reactCompiler = presetRequire('babel-plugin-react-compiler');

const filename = process.argv[2];
const { code } = babel.transformSync(readFileSync(filename, 'utf8'), {
  filename,
  babelrc: false,
  configFile: false,
  parserOpts: { plugins: ['jsx', 'typescript'] },
  plugins: [reactCompiler],
});
process.stdout.write(code);
