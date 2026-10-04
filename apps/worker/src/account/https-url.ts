export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    // Not a URL at all: the same answer as a missing setting.
    return false;
  }
}
