import "@xyflow/react/dist/style.css";
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { SharedMapViewer } from "./ui/SharedMapViewer";
import "./styles.css";

// Auto-login quando carregado via plataforma Tek-Tools
const _u = new URL(window.location.href);
const _t = _u.searchParams.get("_t");
if (_t) {
  localStorage.setItem("tek-map-token", _t);
  _u.searchParams.delete("_t");
  window.history.replaceState(null, "", _u.toString());
}

const shareMatch = window.location.pathname.match(/^\/share\/([A-Za-z0-9_-]+)$/);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {shareMatch ? <SharedMapViewer token={shareMatch[1]} /> : <App />}
  </React.StrictMode>
);
