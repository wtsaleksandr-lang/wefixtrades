/**
 * Wave W-AW-1 — Standalone TradeLine voice picker page.
 *
 * Mounted at /portal/tradeline/voice. Wraps the shared <VoicePicker /> in the
 * portal layout so customers can revisit their voice + greeting + style
 * choice outside the setup wizard.
 */

import { usePageTitle } from "@/hooks/usePageTitle";
import PortalLayout from "@/components/portal/PortalLayout";
import { VoicePicker } from "./TradelineSetup/VoicePicker";

export default function PortalTradelineVoicePage() {
  usePageTitle("Tradeline Voice");
  return (
    <PortalLayout>
      <div className="max-w-3xl">
        <VoicePicker />
      </div>
    </PortalLayout>
  );
}
