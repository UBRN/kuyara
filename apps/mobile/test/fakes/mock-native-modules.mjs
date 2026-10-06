import { registerHooks } from 'node:module';

/**
 * Stands in for native packages the Node test runner cannot load. Each key of `sources` is a
 * package name and its value the source of the in-memory module that replaces it; every other
 * specifier resolves as usual. Call it before the module under test is imported, so that import
 * is dynamic.
 */
export function mockNativeModules(sources) {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (!Object.hasOwn(sources, specifier)) return nextResolve(specifier, context);
      return {
        shortCircuit: true,
        url: `data:text/javascript,${encodeURIComponent(sources[specifier])}`,
      };
    },
  });
}
