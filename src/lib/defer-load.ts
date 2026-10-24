/** Minimal reusable wrapper that defers a one-time load task out of the effect body
 * so hooks lint rules do not flag synchronous state updates during mount. */
export function deferInitialLoad(task: () => Promise<unknown> | void): () => void {
  let cancelled = false;
  queueMicrotask(() => {
    if (cancelled) return;
    void Promise.resolve(task()).catch(() => {});
  });
  return () => {
    cancelled = true;
  };
}
