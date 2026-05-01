import { createLogger } from "../lib/logger";
const log = createLogger("AlertService");
export async function fireAlert(alert: { severity: string; category: string; title: string; details?: string; metadata?: any }): Promise<void> {
  log.warn("Alert fired (stub)", { title: alert.title, severity: alert.severity });
}
