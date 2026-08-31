/**
 * WordPress credential resolution for WebCare.
 *
 * Extracted from webcareMaintenanceWorker so the backup worker, the malware
 * scanner and the 1-click portal actions all resolve credentials the same
 * way instead of each growing their own copy.
 *
 * Two storage locations, checked in order:
 *   1. client_service.metadata.wordpress_credentials  (set by onboarding)
 *   2. rankflow_profiles.credentials.wordpress        (shared with RankFlow)
 *
 * Returns null when credentials are absent or undecryptable. Callers must
 * treat null as "we cannot do this work" and say so — never as "the work
 * succeeded with nothing to do".
 */

import { storage } from "../../storage";
import { createLogger } from "../../lib/logger";
import {
  decryptToken,
  isEncryptionConfigured,
} from "../socialSync/tokenEncryption";
import type { WpCredentials } from "../wordpressMaintenance";

const log = createLogger("WebCareCredentials");

export interface StoredWpCreds {
  cms_url: string;
  cms_username: string;
  cms_app_password: string; // encrypted at rest
}

export async function resolveWpCredentials(
  clientId: number,
  csMetadata: Record<string, any>,
): Promise<WpCredentials | null> {
  if (!isEncryptionConfigured()) {
    log.warn("TOKEN_ENCRYPTION_KEY not set — cannot decrypt WordPress credentials");
    return null;
  }

  const csMeta = csMetadata?.wordpress_credentials as StoredWpCreds | undefined;
  if (csMeta?.cms_url && csMeta?.cms_username && csMeta?.cms_app_password) {
    try {
      return {
        cms_url: csMeta.cms_url,
        cms_username: csMeta.cms_username,
        cms_app_password: decryptToken(csMeta.cms_app_password),
      };
    } catch (err: any) {
      log.warn("Failed to decrypt credentials from client_service metadata", {
        clientId: String(clientId),
        error: err.message,
      });
    }
  }

  try {
    const profile = (await storage.getRankFlowProfile(clientId)) as any;
    if (profile?.credentials?.wordpress) {
      const wp = profile.credentials.wordpress as StoredWpCreds;
      if (wp.cms_url && wp.cms_username && wp.cms_app_password) {
        return {
          cms_url: wp.cms_url,
          cms_username: wp.cms_username,
          cms_app_password: decryptToken(wp.cms_app_password),
        };
      }
    }
  } catch (err: any) {
    log.warn("Failed to load RankFlow profile credentials", {
      clientId: String(clientId),
      error: err.message,
    });
  }

  return null;
}
