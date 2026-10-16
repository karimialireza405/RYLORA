import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Fonts are bundled locally (OFL-licensed) so typography never depends on the network.
import "@fontsource/italiana";
import "@fontsource/marcellus";
import "@fontsource-variable/vazirmatn";
import "./styles/globals.css";

import { App } from "./app/App";
import { MiniApp } from "./features/mini/MiniPlayer";

/** The mini player is a second window of the same app (`?window=mini`). */
const isMini = new URLSearchParams(window.location.search).get("window") === "mini";

// The native context menu has no meaning in RYLORA except inside text fields.
window.addEventListener("contextmenu", (e) => {
  const target = e.target as HTMLElement;
  if (!target.closest("input, textarea, .selectable")) e.preventDefault();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isMini ? <MiniApp /> : <App />}
  </StrictMode>,
);
