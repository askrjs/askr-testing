/** Race an operation with cancellation and dispose any value produced after abort. */
export function withRequestSignal<T>(
  signal: AbortSignal,
  operation: () => T | PromiseLike<T>,
  discard?: (value: T) => void,
): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve()
      .then(() => {
        signal.throwIfAborted();
        return operation();
      })
      .then(
        (value) => {
          signal.removeEventListener("abort", abort);
          if (signal.aborted) {
            discard?.(value);
            reject(signal.reason);
          } else resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener("abort", abort);
          reject(error);
        },
      );
  });
}
