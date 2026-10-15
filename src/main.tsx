import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Fonts are bundled locally (OFL-licensed) so typography never depends on the network.
import "@fontsource-variable/urbanist";
import "@fontsource-variable/vazirmatn";
import "./styles/globals.css";

import { App } from "./app/App";

// The native context menu has no meaning in RYLORA except inside text fields.
window.addEventListener("contextmenu", (e) => {
  const target = e.target as HTMLElement;
  if (!target.closest("input, textarea, .selectable")) e.preventDefault();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
