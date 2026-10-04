/**
 * Runs `task` one at a time: a call while it runs gets one more run after it, which every such
 * call awaits, so a change that lands during a read is still read. `task` answering true asks
 * for that one more run itself.
 */
export function coalescedRun(task: () => Promise<boolean | void>): () => Promise<void> {
  let running: Promise<void> | null = null;
  let again = false;
  return () => {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        if (await task()) again = true;
      } while (again);
    })().finally(() => {
      running = null;
    });
    return running;
  };
}
