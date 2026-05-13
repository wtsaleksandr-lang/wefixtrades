/**
 * Mobile API types — mirrored 1:1 with the wefixtrades-softphone repo's
 * src/api/types.ts.
 *
 * NOT auto-synced. When you change a server-side response shape, edit
 * this file AND the matching file in
 *   wefixtrades-softphone/src/api/types.ts
 * in the same PR. Otherwise the mobile app and backend will drift.
 */

/* ─── Auth ─── */

export interface MobileTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds until access token expires
  refreshExpiresAt: string; // ISO timestamp
  user: MobileAuthUser;
}

export interface MobileAuthUser {
  id: number;
  email: string;
  role: string;
  name: string | null;
}

export interface MobileLoginRequest {
  email: string;
  password: string;
  deviceLabel?: string;
}

export interface MobileRefreshRequest {
  refreshToken: string;
}

export interface MobileLogoutRequest {
  refreshToken: string;
}

/* ─── Profile + duty ─── */

export type DutyMode = "available" | "on_the_job" | "after_hours";

export interface MobileProfileResponse {
  user: MobileAuthUser;
  client: {
    id: number;
    business_name: string;
    contact_name: string | null;
  } | null;
  tradeline: {
    service: string | null;
    status: string | null;
    currentMode: DutyMode;
  };
}

export interface DutyPatchRequest {
  mode: DutyMode;
}

export interface DutyPatchResponse {
  ok: true;
  mode: DutyMode;
}

/* ─── Generic error envelope ─── */

export interface MobileApiErrorBody {
  error: string;
  code?: string;
}
