import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { DesktopApp } from "./DesktopApp.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {new URLSearchParams(location.search).has('legacy-prototype') && !window.tokenAssistant ? <App /> : <DesktopApp />}
  </React.StrictMode>,
);
