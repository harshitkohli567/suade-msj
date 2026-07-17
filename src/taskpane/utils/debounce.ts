/**
 * Generic trailing-edge debounce. Used to keep the selection-change handler
 * from re-reading the document on every keystroke/cursor move (FR-1.6 —
 * "debounce/throttle context recomputation so the task pane does not
 * visibly lag or flicker").
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  waitMs: number
): (...args: Args) => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return (...args: Args) => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => fn(...args), waitMs);
  };
}
