/**
 * ReputationShield notifications — Wave 28 → Wave 32 redirect shim.
 *
 * Consolidated into /portal/settings/notifications (Wave 32). This file
 * remains so old links resolve.
 */

import { useEffect } from "react";
import { useLocation } from "wouter";

export default function ReputationShieldNotificationSettingsRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/portal/settings/notifications?filter=reputationshield", {
      replace: true,
    });
  }, [setLocation]);
  return null;
}
