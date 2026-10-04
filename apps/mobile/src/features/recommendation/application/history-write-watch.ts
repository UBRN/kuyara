/**
 * History's answer to a database write it did not make, such as a sync pull landing another
 * phone's looks or deletions (ADR 0041 section 4). The returned check reads History's change
 * key; the first read is the baseline, and each later read that differs tells `changed`, so
 * History and the Closet's worn counts read again, and removes the photos of looks deleted
 * elsewhere. A write during a read gets one more read after it; a read that fails changes nothing.
 */
export function createHistoryWriteWatch({ changeKey, changed, cleanupPendingPhotos }: Readonly<{
  changeKey: () => Promise<string>;
  cleanupPendingPhotos: () => Promise<void>;
  changed: () => void;
}>): () => void {
  let last: string | null = null;
  let running = false;
  let stale = false;
  const readOnce = async () => {
    let key: string;
    try {
      key = await changeKey();
    } catch {
      return;
    }
    const previous = last;
    last = key;
    if (previous === null || previous === key) return;
    changed();
    try {
      await cleanupPendingPhotos();
    } catch {
      // A photo that cannot be removed now keeps its name on the deleted look for the next try.
    }
  };
  return () => {
    if (running) {
      stale = true;
      return;
    }
    running = true;
    void (async () => {
      do {
        stale = false;
        await readOnce();
      } while (stale);
      running = false;
    })();
  };
}
