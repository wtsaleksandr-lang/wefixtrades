/**
 * AdFlow notifications — Wave 30 → Wave 32 redirect shim.
 *
 * Consolidated into /portal/settings/notifications (Wave 32). This file
 * remains so old links resolve.
 */

import { useEffect } from "react";
import { useLocation } from "wouter";

export default function AdFlowNotificationSettingsRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/portal/settings/notifications?filter=adflow", {
      replace: true,
    });
  }, [setLocation]);
  return null;
}
