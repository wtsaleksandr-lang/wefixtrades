import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  QrCode,
  Star,
  Download,
  Printer,
  ContactRound,
  Info,
  AlertCircle,
} from "lucide-react";
import QRCode from "qrcode";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCopilotForm } from "@/context/CopilotFormContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { cn } from "@/lib/utils";
import {
  FieldGroupHeader,
  TitleInField,
} from "./_shared";

/**
 * Review QR + Digital Card generator — interactive Free Tool.
 *
 * Pure client-side, $0, no backend. Renders two printable QR-powered outputs
 * trades can leave behind after a job:
 *   1. A Review QR — points at the business's Google review link (pasted URL
 *      or place id) so scanning opens the "write a review" flow. Wrapped in a
 *      printable "Scan to leave a review ⭐" card.
 *   2. A vCard QR — encodes a standard VERSION:3.0 vCard built from the
 *      contact inputs so scanning saves the business as a phone contact.
 *      Wrapped in a printable digital business card.
 *
 * QR codes are produced with the already-installed `qrcode` lib
 * (QRCode.toDataURL → PNG data URI). No new dependency, no 3rd-party QR API.
 * QR PNGs are inherently black-on-white image data — that's the encoded image,
 * not editor UI chrome. Print-card colors live in a clearly-scoped @media print
 * stylesheet (`.rqc-print-*`) injected on this page only.
 *
 * DS compliance: title-in-field + top-left help cue + 2px input-cluster gaps +
 * single .btn-primary-premium per page (Print cards). Icon sizes drawn from
 * {12,14,16,20,24,32}.
 */

const ACCENTS = [
  { id: "blue", label: "Blue", hex: "#2563eb" },
  { id: "green", label: "Green", hex: "#16a34a" },
  { id: "amber", label: "Amber", hex: "#d97706" },
  { id: "violet", label: "Violet", hex: "#7c3aed" },
  { id: "slate", label: "Slate", hex: "#475569" },
] as const;

type AccentId = (typeof ACCENTS)[number]["id"];

/**
 * Escape a value for safe inclusion in a vCard text field.
 * Per RFC 6350 / vCard 3.0: backslash, comma, semicolon and newlines are the
 * special characters that must be escaped in a property value.
 */
function escapeVCard(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** Build a VERSION:3.0 vCard string from the contact inputs. */
function buildVCard(opts: {
  fullName: string;
  business: string;
  phone: string;
  email: string;
  website: string;
  address: string;
}): string {
  const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0"];

  const fn = opts.fullName.trim() || opts.business.trim();
  if (fn) {
    lines.push(`FN:${escapeVCard(fn)}`);
    // N is structured: Family;Given;Additional;Prefix;Suffix.
    // We only have a single display name, so place it in the Given slot.
    lines.push(`N:;${escapeVCard(fn)};;;`);
  }
  if (opts.business.trim()) lines.push(`ORG:${escapeVCard(opts.business.trim())}`);
  if (opts.phone.trim()) lines.push(`TEL;TYPE=CELL:${escapeVCard(opts.phone.trim())}`);
  if (opts.email.trim()) lines.push(`EMAIL;TYPE=WORK:${escapeVCard(opts.email.trim())}`);
  if (opts.website.trim()) lines.push(`URL:${escapeVCard(opts.website.trim())}`);
  if (opts.address.trim()) {
    // ADR is structured: PO;Ext;Street;Locality;Region;Postal;Country.
    // We only have a freeform single-line address → put it in the Street slot.
    lines.push(`ADR;TYPE=WORK:;;${escapeVCard(opts.address.trim())};;;;`);
  }

  lines.push("END:VCARD");
  return lines.join("\n");
}

/**
 * Normalise the review input into a scannable URL.
 * - A full http(s) URL is used as-is.
 * - A bare Google Place ID (e.g. "ChIJ...") becomes the canonical
 *   write-review deep link.
 * Returns null when there's nothing usable yet.
 */
function buildReviewUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  // Looks like a place id (Google place ids have no spaces / scheme).
  if (!/\s/.test(v)) {
    return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(v)}`;
  }
  return null;
}

/**
 * Generate a PNG data-URL QR for `text`.
 *   • no input        → { url: null, failed: false }  (empty state)
 *   • encode failure  → { url: null, failed: true }   (distinct error state)
 */
async function makeQr(
  text: string | null,
): Promise<{ url: string | null; failed: boolean }> {
  if (!text) return { url: null, failed: false };
  try {
    const url = await QRCode.toDataURL(text, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 512,
    });
    return { url, failed: false };
  } catch {
    // Encoding can fail when the payload is too large to fit a QR symbol.
    return { url: null, failed: true };
  }
}

/** Trigger a browser download of a data-URL as `filename`. */
function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** Slugify a business name for use in a download filename. */
function fileSlug(name: string, fallback: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
  return s || fallback;
}

export default function ReviewQrCard() {
  usePageTitle("Review QR + Digital Card");
  const { toast } = useToast();

  // ── Config inputs ──
  const [business, setBusiness] = useState("");
  const [reviewInput, setReviewInput] = useState("");
  const [tagline, setTagline] = useState("");
  const [accent, setAccent] = useState<AccentId>("blue");

  // vCard contact inputs
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");

  // ── Derived encodable payloads ──
  const reviewUrl = useMemo(() => buildReviewUrl(reviewInput), [reviewInput]);
  const vcard = useMemo(
    () =>
      buildVCard({ fullName, business, phone, email, website, address }),
    [fullName, business, phone, email, website, address],
  );
  // A vCard with only the envelope (BEGIN/VERSION/END) has nothing to save.
  const hasVcardContent = useMemo(
    () => vcard.split("\n").length > 3,
    [vcard],
  );

  const accentHex = ACCENTS.find((a) => a.id === accent)?.hex ?? ACCENTS[0].hex;

  // ── Async QR generation (toDataURL is a Promise). Regenerate when the
  //    encoded payload changes; guard against out-of-order async resolves. ──
  const [reviewQr, setReviewQr] = useState<string | null>(null);
  const [vcardQr, setVcardQr] = useState<string | null>(null);
  // Distinct "input existed but encoding failed" flags so the placeholder can
  // tell a real failure (e.g. link too long to encode) from the empty state.
  const [reviewQrFailed, setReviewQrFailed] = useState(false);
  const [vcardQrFailed, setVcardQrFailed] = useState(false);
  const genSeq = useRef(0);

  useEffect(() => {
    const seq = ++genSeq.current;
    let cancelled = false;
    Promise.all([
      makeQr(reviewUrl),
      makeQr(hasVcardContent ? vcard : null),
    ]).then(([rq, vq]) => {
      // Drop stale results from superseded runs.
      if (cancelled || seq !== genSeq.current) return;
      setReviewQr(rq.url);
      setVcardQr(vq.url);
      setReviewQrFailed(rq.failed);
      setVcardQrFailed(vq.failed);
    });
    return () => {
      cancelled = true;
    };
  }, [reviewUrl, vcard, hasVcardContent]);

  // ── Copilot form-fill wiring. ──
  useCopilotForm({
    formLabel: "Review QR + Digital Card",
    fields: [
      { key: "business", label: "Business name", required: true },
      { key: "reviewInput", label: "Google review URL or Place ID", required: false },
      { key: "tagline", label: "Optional tagline on the review card", required: false },
      { key: "fullName", label: "Contact name for the vCard", required: false },
      { key: "phone", label: "Phone number", required: false },
      { key: "email", label: "Email address", required: false },
      { key: "website", label: "Website URL", required: false },
      { key: "address", label: "Business address", required: false },
    ],
    values: { business, reviewInput, tagline, fullName, phone, email, website, address },
    onApply: (fills) => {
      for (const f of fills) {
        const v = String(f.value ?? "");
        switch (f.field_key) {
          case "business": setBusiness(v); break;
          case "reviewInput": setReviewInput(v); break;
          case "tagline": setTagline(v); break;
          case "fullName": setFullName(v); break;
          case "phone": setPhone(v); break;
          case "email": setEmail(v); break;
          case "website": setWebsite(v); break;
          case "address": setAddress(v); break;
        }
      }
    },
    enabled: true,
  });

  const printableName = business.trim() || "Your Business";

  const handleDownloadReview = () => {
    if (!reviewQr) return;
    downloadDataUrl(reviewQr, `${fileSlug(business, "review")}-review-qr.png`);
    toast({ title: "Downloaded", description: "Review QR saved as a PNG." });
  };

  const handleDownloadVcard = () => {
    if (!vcardQr) return;
    downloadDataUrl(vcardQr, `${fileSlug(business, "contact")}-card-qr.png`);
    toast({ title: "Downloaded", description: "Digital card QR saved as a PNG." });
  };

  const handlePrint = () => {
    if (!reviewQr && !vcardQr) {
      toast({
        title: "Nothing to print yet",
        description: "Add a review link or contact details first.",
        variant: "destructive",
      });
      return;
    }
    window.print();
  };

  return (
    <PortalLayout
      breadcrumb={
        <span className="flex items-center gap-1.5">
          <Link href="/portal/free-tools" className="hover:text-brand-blue">
            Free Tools
          </Link>
          <span className="text-gray-400">/</span>
          <span>Review QR + Digital Card</span>
        </span>
      }
    >
      {/* Print-only stylesheet — scoped to this page. Hides the app chrome and
          shows ONLY the cards on a white sheet. The white/black literals here
          are intentionally confined to the print context (physical paper). */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .rqc-print-area, .rqc-print-area * { visibility: visible !important; }
          .rqc-print-area {
            position: absolute;
            inset: 0;
            padding: 24px;
            display: flex;
            flex-wrap: wrap;
            gap: 24px;
            align-content: flex-start;
          }
          .rqc-no-print { display: none !important; }
          .rqc-print-card {
            break-inside: avoid;
            page-break-inside: avoid;
            box-shadow: none !important;
          }
        }
        @media screen {
          .rqc-print-area { display: contents; }
        }
      `}</style>

      <div data-theme="light" className="qq-paper-surface space-y-6">
        <header className="rqc-no-print">
          <div className="flex items-center gap-2 mb-1">
            <QrCode className="w-5 h-5 text-brand-blue" aria-hidden="true" />
            <h2 className="text-2xl font-bold text-gray-900">
              Review QR + Digital Card
            </h2>
          </div>
          <p className="text-sm text-gray-600 max-w-3xl">
            Two printable QR codes to leave behind after every job. One sends
            happy customers straight to your Google review page; the other saves
            your business as a phone contact in a single scan. Everything runs in
            your browser — nothing is saved or sent anywhere.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Config column ── */}
          <div className="lg:col-span-1 space-y-3 rqc-no-print">
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Business details"
                  help="Your business name appears on both printable cards. The accent colour tints the card headers and the small print."
                />
                <div className="space-y-0.5">
                  <TitleInField
                    id="rqc-business"
                    label="Business name"
                    value={business}
                    onChange={setBusiness}
                    placeholder="Smith Plumbing"
                    required
                    help="Shown as the heading on both the review card and the digital card."
                    testid="rqc-input-business"
                  />
                  <TitleInField
                    id="rqc-tagline"
                    label="Tagline (optional)"
                    value={tagline}
                    onChange={setTagline}
                    placeholder="Trusted local plumbers"
                    help="A short line under your name on the review card."
                    testid="rqc-input-tagline"
                  />
                  {/* Accent picker — selected = outline (DS hard rule), not a
                      bright fill. */}
                  <div className="pl-5 pt-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                      Accent colour
                    </p>
                    <div
                      role="radiogroup"
                      aria-label="Accent colour"
                      className="flex flex-wrap gap-1.5"
                    >
                      {ACCENTS.map((a) => {
                        const active = accent === a.id;
                        return (
                          <button
                            key={a.id}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            aria-label={a.label}
                            onClick={() => setAccent(a.id)}
                            data-testid={`rqc-accent-${a.id}`}
                            className={cn(
                              "h-7 w-7 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-brand-blue/30",
                              active
                                ? "ring-2 ring-offset-2 ring-gray-700"
                                : "ring-1 ring-gray-200 hover:ring-gray-400",
                            )}
                            style={{ backgroundColor: a.hex }}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Review link"
                  help="Paste the 'Write a review' link from your Google Business Profile, or just your Google Place ID. Scanning the QR opens this so the customer can leave a review."
                />
                <div className="space-y-0.5">
                  <TitleInField
                    id="rqc-review"
                    label="Google review URL or Place ID"
                    value={reviewInput}
                    onChange={setReviewInput}
                    placeholder="https://search.google.com/local/writereview?placeid=…"
                    help="A full review URL is used as-is. A bare Place ID (ChIJ…) is turned into the canonical Google write-review link."
                    testid="rqc-input-review"
                  />
                </div>
                {reviewInput.trim() && !reviewUrl && (
                  <div className="flex items-start gap-2 text-xs text-amber-700">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                    <p>
                      That doesn't look like a URL or a Place ID. Paste the full
                      review link or a single Place ID with no spaces.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Contact details (for the digital card)"
                  help="These build a standard vCard. Scanning the digital-card QR saves them as a contact on the customer's phone. Fill in whatever you want shared."
                />
                <div className="space-y-0.5">
                  <TitleInField
                    id="rqc-name"
                    label="Contact name"
                    value={fullName}
                    onChange={setFullName}
                    placeholder="John Smith"
                    help="The person's name saved on the contact. Falls back to the business name if left blank."
                    testid="rqc-input-name"
                  />
                  <TitleInField
                    id="rqc-phone"
                    label="Phone"
                    type="tel"
                    value={phone}
                    onChange={setPhone}
                    placeholder="+1 555 123 4567"
                    testid="rqc-input-phone"
                  />
                  <TitleInField
                    id="rqc-email"
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="hello@smithplumbing.com"
                    testid="rqc-input-email"
                  />
                  <TitleInField
                    id="rqc-website"
                    label="Website"
                    value={website}
                    onChange={setWebsite}
                    placeholder="https://smithplumbing.com"
                    testid="rqc-input-website"
                  />
                  <TitleInField
                    id="rqc-address"
                    label="Address"
                    value={address}
                    onChange={setAddress}
                    placeholder="123 Main St, Springfield"
                    testid="rqc-input-address"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Preview + actions column ── */}
          <div className="lg:col-span-2 space-y-3">
            <Card className="rqc-no-print">
              <CardContent className="p-5">
                <FieldGroupHeader
                  title="Your printable cards"
                  help="Live preview. Download either QR as a PNG, or print both cards onto a single white sheet to cut out and hand to customers."
                  right={
                    /* DS rule — single .btn-primary-premium per page. */
                    <Button
                      type="button"
                      onClick={handlePrint}
                      className="btn-primary-premium"
                      data-testid="rqc-print"
                    >
                      <Printer className="w-4 h-4 mr-1.5" />
                      Print cards
                    </Button>
                  }
                />
              </CardContent>
            </Card>

            {/* The print area — on screen it lays out as a normal grid; in the
                print stylesheet it becomes the only visible content. */}
            <div className="rqc-print-area">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                {/* ── Review card ── */}
                <Card className="rqc-print-card overflow-hidden">
                  <CardContent className="p-0">
                    <div
                      className="px-4 py-3 text-white"
                      style={{ backgroundColor: accentHex }}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wider opacity-90">
                        Leave a review
                      </p>
                      <p className="text-base font-bold leading-tight truncate">
                        {printableName}
                      </p>
                    </div>
                    <div className="p-5 flex flex-col items-center text-center gap-3">
                      <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                        Enjoyed our work? Scan to leave a review
                        <Star
                          className="w-4 h-4"
                          style={{ color: accentHex }}
                          fill="currentColor"
                          aria-hidden="true"
                        />
                      </p>
                      {reviewQr ? (
                        <img
                          src={reviewQr}
                          alt={`QR code linking to the Google review page for ${printableName}`}
                          style={{ width: 160, height: 160 }}
                          data-testid="rqc-review-qr"
                        />
                      ) : (
                        <QrPlaceholder
                          label="Add your Google review link to generate this QR"
                          failed={reviewQrFailed}
                        />
                      )}
                      {tagline.trim() && (
                        <p className="text-xs text-gray-500">{tagline.trim()}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* ── Digital business card (vCard) ── */}
                <Card className="rqc-print-card overflow-hidden">
                  <CardContent className="p-0">
                    <div
                      className="px-4 py-3 text-white flex items-center gap-2"
                      style={{ backgroundColor: accentHex }}
                    >
                      <ContactRound className="w-5 h-5 shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wider opacity-90">
                          Save our contact
                        </p>
                        <p className="text-base font-bold leading-tight truncate">
                          {printableName}
                        </p>
                      </div>
                    </div>
                    <div className="p-5 flex flex-col items-center text-center gap-3">
                      <p className="text-sm font-semibold text-gray-900">
                        Scan to save us to your phone
                      </p>
                      {vcardQr ? (
                        <img
                          src={vcardQr}
                          alt={`QR code that saves the contact details for ${printableName}`}
                          style={{ width: 160, height: 160 }}
                          data-testid="rqc-vcard-qr"
                        />
                      ) : (
                        <QrPlaceholder
                          label="Add a phone, email, or website to generate this QR"
                          failed={vcardQrFailed}
                        />
                      )}
                      <div className="text-xs text-gray-500 space-y-0.5">
                        {phone.trim() && <p>{phone.trim()}</p>}
                        {website.trim() && <p className="truncate max-w-[200px]">{website.trim()}</p>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Download actions — secondary (plain outline) buttons. */}
            <Card className="rqc-no-print">
              <CardContent className="p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDownloadReview}
                    disabled={!reviewQr}
                    className="w-full"
                    data-testid="rqc-download-review"
                  >
                    <Download className="w-4 h-4 mr-1.5" />
                    Download review QR
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDownloadVcard}
                    disabled={!vcardQr}
                    className="w-full"
                    data-testid="rqc-download-vcard"
                  >
                    <Download className="w-4 h-4 mr-1.5" />
                    Download contact QR
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="rqc-no-print">
              <CardContent className="p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-2">
                  How to use these
                </h2>
                <ul className="space-y-1.5 text-xs text-gray-700 list-disc pl-5">
                  <li>
                    <strong>Review QR:</strong> print it, stick it on the invoice
                    or a leave-behind card. A scan opens your Google review page —
                    the fastest way to turn a happy job into a 5★ review.
                  </li>
                  <li>
                    <strong>Digital card QR:</strong> encodes a standard vCard, so
                    one scan saves your name, phone, email, website and address as
                    a phone contact — no typing.
                  </li>
                  <li>
                    Everything is generated in your browser. Nothing is uploaded,
                    saved, or shared.
                  </li>
                </ul>
                <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-slate-50 text-xs text-gray-600">
                  <Info
                    className="w-3.5 h-3.5 shrink-0 mt-0.5 text-brand-blue"
                    aria-hidden="true"
                  />
                  <p>
                    <strong>Tip:</strong> "Print cards" lays both cards on one
                    white sheet — cut them out to business-card size and keep a
                    stack in the van.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}

/** Dashed empty-state box shown before a QR can be generated. */
function QrPlaceholder({ label, failed = false }: { label: string; failed?: boolean }) {
  const text = failed
    ? "Couldn't generate this QR — the link may be too long."
    : label;
  return (
    <div style={{ width: 160, height: 160 }} className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 px-3 text-center">
      <QrCode className="w-6 h-6 text-gray-300" aria-hidden="true" />
      <p className="text-[11px] text-gray-400 leading-snug">{text}</p>
    </div>
  );
}
