import { useState } from 'react';

/**
 * One value per content: a caller that rebuilds an object on every render hands its
 * children the same instance while the content is equal, so their memos hold. Content is
 * compared by `JSON.stringify`, so the value must be plain data.
 */
export function useStableValue<T>(value: T): T {
  const key = JSON.stringify(value);
  const [held, setHeld] = useState({ key, value });
  if (held.key !== key) {
    setHeld({ key, value });
    return value;
  }
  return held.value;
}

/**
 * A map whose values keep their instance one by one: after a change, every entry whose
 * content is equal to the one it replaces is the old instance, so a child that reads one
 * entry keeps its memo while another entry changes. Content is compared by `JSON.stringify`.
 */
export function useStableEntries<K, V>(entries: readonly (readonly [K, V])[]): ReadonlyMap<K, V> {
  const key = JSON.stringify(entries);
  const [held, setHeld] = useState(() => ({ key, map: new Map(entries) as ReadonlyMap<K, V> }));
  if (held.key === key) return held.map;
  const map: ReadonlyMap<K, V> = new Map(entries.map(([entryKey, value]) => {
    const before = held.map.get(entryKey);
    return [entryKey, before !== undefined && JSON.stringify(before) === JSON.stringify(value) ? before : value];
  }));
  setHeld({ key, map });
  return map;
}
