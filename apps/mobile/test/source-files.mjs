import { readdirSync } from 'node:fs';
import path from 'node:path';

const allSourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const skippedDirectories = new Set(['node_modules', '.expo', '.expo-shared', 'dist', 'build']);

/**
 * The source files under `directory`, as paths relative to it in posix form. Test files (a name
 * holding `.test.`) are left out unless `includeTests` is set; `extensions` narrows the kinds read.
 */
export function sourceFiles(
  directory,
  { includeTests = false, extensions = allSourceExtensions } = {},
  relative = '',
) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryRelative = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) {
        found.push(...sourceFiles(path.join(directory, entry.name), { includeTests, extensions }, entryRelative));
      }
    } else if (
      entry.isFile()
      && extensions.includes(path.extname(entry.name))
      && (includeTests || !entry.name.includes('.test.'))
    ) {
      found.push(entryRelative);
    }
  }
  return found;
}
