import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { I18nProvider } from "./i18n/I18nContext";
import App from "./App";
import "./index.css";

const gid = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

const inner = (
  <BrowserRouter>
    <I18nProvider>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </I18nProvider>
  </BrowserRouter>
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {gid ? (
      <GoogleOAuthProvider clientId={gid}>{inner}</GoogleOAuthProvider>
    ) : (
      inner
    )}
  </React.StrictMode>,
);
