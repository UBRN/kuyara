// The uri a stand-in `expo-file-system` File or Directory gets from its constructor parts: a
// root (a string or an object with a `uri`) followed by path segments.
export function fileUri(parts) {
  const [root, ...segments] = parts;
  const rootUri = typeof root === 'string' ? root : root.uri;
  return [rootUri.replace(/\/$/, ''), ...segments].join('/');
}
