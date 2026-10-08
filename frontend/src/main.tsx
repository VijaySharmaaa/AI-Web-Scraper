import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/use-theme";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider delayDuration={300}>
        <App />
        <Toaster position="bottom-center" richColors closeButton />
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>
);
