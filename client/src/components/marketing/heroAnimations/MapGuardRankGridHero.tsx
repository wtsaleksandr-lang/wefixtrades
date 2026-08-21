/**
 * MapGuardRankGridHero — the MapGuard product-page hero visual.
 *
 * Replaces the old abstract red→green tile grid with the REAL Local Rank Grid
 * card (Google static-map image + overlaid 5×5 rank pins + SoLV/ARP/ATRP), the
 * same premium visual the tool ships. Uses the Seattle / "Emerald Electric"
 * preset so it differs from the home "four tools" MapGuard tab (Austin / "Lone
 * Star HVAC"). The card owns its own reduced-motion fallback (holds the result
 * frame). Default-exported for the lazy hero-animation registry.
 */
import { RankGridDemoLoop, SEATTLE_PRESET } from "@/components/marketing/RankGridDemoLoop";

export default function MapGuardRankGridHero() {
  return (
    <div style={{ width: "100%", maxWidth: 440, margin: "0 auto" }}>
      <RankGridDemoLoop preset={SEATTLE_PRESET} />
    </div>
  );
}
