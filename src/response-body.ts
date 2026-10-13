/** Discard an owned response without letting cleanup delay or replace the result. */
export function discardResponseBody(response: Response): void {
  void response.body?.cancel().catch(() => {
    // Cleanup is best-effort, including locked streams and failing cancel hooks.
  });
}
