import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { IconProvider } from "@/lib/icon-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/feedback/toast-provider";
import { AuthProvider } from "@/lib/auth-context";
import { App } from "./App";
import { ErrorBoundary } from "@/components/feedback/error-boundary";
import { installPreloadErrorReload } from "@/lib/chunk-reload";
import "./index.css";

installPreloadErrorReload();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <IconProvider>
        <TooltipProvider>
          <ToastProvider>
            <AuthProvider>
              <ErrorBoundary><App /></ErrorBoundary>
            </AuthProvider>
          </ToastProvider>
        </TooltipProvider>
      </IconProvider>
    </BrowserRouter>
  </StrictMode>,
);
