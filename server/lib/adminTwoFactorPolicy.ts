/**
 * Mandatory admin 2FA policy (Lane C).
 *
 * Policy: a user with role === "admin" and NO enrolled TOTP factor is
 * forced into the 2FA enrollment flow after their next successful
 * login. They get exactly ONE grace login (a full session, redirected
 * to the enrollment surface); from the following login onwards the
 * session is enrollment-restricted — requireAdmin 403s with
 * code "admin_2fa_enrollment_required" until TOTP is enabled. The
 * /api/user/2fa/* endpoints stay reachable (requireAuth) so the admin
 * can always complete enrollment.
 *
 * Client portal users are untouched — 2FA stays optional for them.
 *
 * Pure decision function — no DB / session imports — so the policy is
 * unit-testable. Login routes persist `admin_2fa_grace_used_at` and
 * stamp the session flags; server/auth.ts requireAdmin enforces them.
 */

export interface AdminTwoFactorPolicyInput {
  role: string | null | undefined;
  totpEnabled: boolean;
  /** users.admin_2fa_grace_used_at — null until the grace login happens. */
  graceUsedAt: Date | null;
  /** Master switch for the mandatory-admin-2FA gate. When false (the
   *  default — sourced from env ADMIN_2FA_MANDATORY at the call site), a
   *  factor-less admin is NEVER forced into enrollment and NEVER blocked:
   *  2FA stays available/encouraged but optional. Flip to true (Doppler:
   *  ADMIN_2FA_MANDATORY=true) to restore the hard-gated Lane-C behavior
   *  with zero code changes. Pure input → the function stays testable. */
  mandatory: boolean;
}

export interface AdminTwoFactorPolicyDecision {
  /** True → the login response must carry requires2faEnrollment and the
   *  session must be stamped with the enrollment flags. */
  enrollmentRequired: boolean;
  /** True → this login IS the one grace login: full admin access for
   *  this session, but redirected into enrollment. False (while
   *  enrollmentRequired) → grace already spent: session is
   *  enrollment-restricted (requireAdmin blocks). */
  graceLogin: boolean;
}

export const ADMIN_2FA_ENROLLMENT_CODE = "admin_2fa_enrollment_required";

export function evaluateAdminTwoFactorPolicy(
  input: AdminTwoFactorPolicyInput,
): AdminTwoFactorPolicyDecision {
  if (!input.mandatory) {
    // Gate disabled (default): admin 2FA is optional — never force
    // enrollment, never block. The enrollment UI stays reachable so an
    // admin can still opt in voluntarily.
    return { enrollmentRequired: false, graceLogin: false };
  }
  if (input.role !== "admin") {
    return { enrollmentRequired: false, graceLogin: false };
  }
  if (input.totpEnabled) {
    // Enrolled admin — the normal TOTP challenge (enforceTwoFactor)
    // already gates every login path.
    return { enrollmentRequired: false, graceLogin: false };
  }
  return {
    enrollmentRequired: true,
    graceLogin: input.graceUsedAt == null,
  };
}

/** Session keys stamped at login-time and read by requireAdmin. */
export interface AdminTwoFactorSessionFlags {
  /** Admin lacks an enrolled factor — must enroll. */
  admin2faEnrollPending?: boolean;
  /** This session is the single grace login (full access). */
  admin2faEnrollGrace?: boolean;
}

/**
 * Pure enforcement check used by requireAdmin: should this request be
 * blocked pending enrollment?
 */
export function isAdminBlockedPendingEnrollment(
  flags: AdminTwoFactorSessionFlags | null | undefined,
): boolean {
  if (!flags) return false;
  return flags.admin2faEnrollPending === true && flags.admin2faEnrollGrace !== true;
}
