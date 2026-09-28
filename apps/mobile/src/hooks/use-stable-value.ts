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
