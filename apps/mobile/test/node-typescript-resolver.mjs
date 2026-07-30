import { registerHooks } from 'node:module';
import { extname } from 'node:path';

registerHooks({
  resolve(specifier, context, nextResolve) {
    const isRelative = specifier.startsWith('./') || specifier.startsWith('../');

    if (specifier.startsWith('@/')) {
      const sourcePath = specifier.slice(2);
      const extension = extname(sourcePath);
      const url = new URL(`../src/${sourcePath}${extension ? '' : '.ts'}`, import.meta.url);

      return { shortCircuit: true, url: url.href };
    }

    if (isRelative && !extname(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }

    return nextResolve(specifier, context);
  },
});
