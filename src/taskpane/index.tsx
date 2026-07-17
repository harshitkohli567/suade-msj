import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

/* global document, Office, module, require */

const title = "Suade";

const render = (Component: React.ComponentType) => {
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("Suade: could not find #root element to mount into.");
  }
  const root = createRoot(container);
  root.render(<Component />);
};

Office.onReady((info) => {
  if (info.host !== Office.HostType.Word) {
    // Suade is Word-only for Phase 1. Fail loudly rather than silently
    // rendering a broken UI in an unsupported host.
    const container = document.getElementById("root");
    if (container) {
      container.innerText = `${title}: this add-in only supports Word. Detected host: ${info.host}.`;
    }
    return;
  }
  render(App);
});

// Hot module replacement for local dev only — no effect in production build.
if ((module as any).hot) {
  (module as any).hot.accept("./App", () => render(App));
}
