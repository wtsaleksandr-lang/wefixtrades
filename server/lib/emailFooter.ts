/**
 * CAN-SPAM compliant legal-entity footer for all customer-facing emails.
 *
 * US law requires every commercial message include a valid postal address.
 * Transactional emails (receipts, password resets) are technically exempt,
 * but using the same footer everywhere keeps brand consistency and removes
 * any ambiguity about which messages are which.
 */

const LEGAL_ENTITY_NAME = "MR Holdings & Trade LLC";
const LEGAL_ENTITY_ADDRESS = "30 N. Gould St. Suite R, Sheridan, WY 82801, United States";

/**
 * Returns a styled <div> containing the legal-entity footer.
 *
 * @param theme  "dark" matches the marketing site palette (#0B0F14 bg).
 *               "light" matches white-card emails (audit reports, etc.).
 *               Defaults to "dark".
 */
export function buildLegalFooter(theme: "dark" | "light" = "dark"): string {
  if (theme === "light") {
    return `
      <div style="margin-top:18px;padding:16px 12px 0;text-align:center;border-top:1px solid #E5E7EB;">
        <p style="font-size:11px;color:#9CA3AF;line-height:1.5;margin:0 0 4px;">
          WeFixTrades is operated by ${LEGAL_ENTITY_NAME}.
        </p>
        <p style="font-size:11px;color:#9CA3AF;line-height:1.5;margin:0;">
          ${LEGAL_ENTITY_ADDRESS}
        </p>
      </div>`;
  }
  return `
    <p style="font-size:10px;color:#3D434A;text-align:center;margin:6px 0 0;line-height:1.5;">
      ${LEGAL_ENTITY_NAME} · ${LEGAL_ENTITY_ADDRESS}
    </p>`;
}

export const LEGAL_ENTITY = {
  name: LEGAL_ENTITY_NAME,
  address: LEGAL_ENTITY_ADDRESS,
};
