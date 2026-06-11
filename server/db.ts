import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { createLogger } from "./lib/logger";
import { isTransientInfraError, describeError } from "./lib/transientInfraErrors";

const { Pool } = pg;

const log = createLogger("Db");

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon force-closes idle/suspended connections; TCP keepalive lets the
  // driver notice dead sockets instead of handing them back to queries.
  keepAlive: true,
});

/* Sentry NODEWEFIXTRADES-Y (fatal "Connection terminated unexpectedly",
 * mech onuncaughtexception): node-postgres emits 'error' on the Pool when an
 * IDLE client's connection drops (Neon compute suspend, control-plane blips).
 * With no listener that event THROWS and crashes the whole process. The
 * client is already removed from the pool by pg before the event fires, so
 * the only correct handling is: log and carry on — the next checkout opens a
 * fresh connection. Transient drops log at warn (expected with serverless
 * Postgres); anything else stays loud at error level. */
pool.on("error", (err: Error) => {
  const detail = describeError(err);
  if (isTransientInfraError(err)) {
    log.warn("idle client connection dropped (transient — pool will reconnect)", { ...detail });
  } else {
    log.error("unexpected idle client error on pg pool", { ...detail, err });
  }
});

export const db = drizzle(pool, { schema });
