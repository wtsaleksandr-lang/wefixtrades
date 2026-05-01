import { createLogger } from "../lib/logger";
const log = createLogger("EmailQueue");
export async function processEmailQueue(): Promise<{ sent: number; failed: number }> {
  return { sent: 0, failed: 0 };
}
