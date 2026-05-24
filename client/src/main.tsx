import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initAnalytics } from "./lib/analytics";
import { initWebVitals } from "./lib/rum/webVitals";

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  });
}

initAnalytics();
// SEO Wave D — RUM Core Web Vitals. No-ops on /admin/* and /portal/*.
initWebVitals();

createRoot(document.getElementById("root")!).render(<App />);
