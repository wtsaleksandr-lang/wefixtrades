/**
 * MapGuard alert settings — Wave 27 → Wave 32 redirect shim.
 *
 * Wave 32 consolidated all per-product notification surfaces into a
 * single unified page at /portal/settings/notifications. This file
 * remains so any bookmarked /portal/mapguard/alert-settings link still
 * lands the customer on the right page (filtered to MapGuard events).
 */

import { useEffect } from "react";
import { useLocation } from "wouter";

export default function MapGuardAlertSettingsRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/portal/settings/notifications?filter=mapguard", {
      replace: true,
    });
  }, [setLocation]);
  return null;
}
