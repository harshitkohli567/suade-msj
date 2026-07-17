/* global Office */

// Suade doesn't register any ExecuteFunction ribbon commands in Phase 1 —
// the task pane opens declaratively via the manifest's ShowTaskpane action.
// This file exists so webpack has a valid entry point matching the
// manifest's FunctionFile reference (commands.html/commands.js).

Office.onReady(() => {
  // Intentionally empty for Phase 1.
});
