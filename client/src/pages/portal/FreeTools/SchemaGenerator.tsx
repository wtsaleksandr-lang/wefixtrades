import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Copy,
  Check,
  FileCode2,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  AlertCircle,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCopilotForm } from "@/context/CopilotFormContext";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  FieldGroupHeader,
  TitleInField,
  TitleInFieldSelect,
} from "./_shared";

/**
 * Local Business Schema Generator — first live Free Tool.
 *
 * Stateless v1: pulls business name / contact / website from the existing
 * /api/portal/settings endpoint and lets the customer fill in everything
 * else (address, hours, price range, extra social URLs) inline. Nothing
 * persists — regenerate on every visit from current profile data.
 *
 * DS compliance (PR #692 audit): title-in-field + top-left help cue + 2px
 * input-cluster gaps + single .btn-primary-premium (Copy snippet).
 */

interface SettingsData {
  business_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
  logo_url: string | null;
  trade_type: string | null;
  account_email: string | null;
}

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

type Day = (typeof DAYS)[number];

interface DayHours {
  open: boolean;
  opens: string;
  closes: string;
}

type HoursMap = Record<Day, DayHours>;

const DEFAULT_HOURS: HoursMap = {
  Monday: { open: true, opens: "09:00", closes: "17:00" },
  Tuesday: { open: true, opens: "09:00", closes: "17:00" },
  Wednesday: { open: true, opens: "09:00", closes: "17:00" },
  Thursday: { open: true, opens: "09:00", closes: "17:00" },
  Friday: { open: true, opens: "09:00", closes: "17:00" },
  Saturday: { open: false, opens: "09:00", closes: "17:00" },
  Sunday: { open: false, opens: "09:00", closes: "17:00" },
};

const PRICE_RANGES = ["$", "$$", "$$$", "$$$$"] as const;
type PriceRange = (typeof PRICE_RANGES)[number];

const timeInputClass =
  "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors";

function buildSchema(opts: {
  business_name: string;
  website_url?: string | null;
  contact_phone?: string | null;
  streetAddress: string;
  addressLocality: string;
  addressRegion: string;
  postalCode: string;
  addressCountry: string;
  priceRange: PriceRange;
  hours: HoursMap;
  sameAs: string[];
}): Record<string, unknown> {
  const address: Record<string, string> = { "@type": "PostalAddress" };
  if (opts.streetAddress) address.streetAddress = opts.streetAddress;
  if (opts.addressLocality) address.addressLocality = opts.addressLocality;
  if (opts.addressRegion) address.addressRegion = opts.addressRegion;
  if (opts.postalCode) address.postalCode = opts.postalCode;
  if (opts.addressCountry) address.addressCountry = opts.addressCountry;

  const openingHoursSpecification = DAYS.filter((d) => opts.hours[d].open).map(
    (d) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: d,
      opens: opts.hours[d].opens,
      closes: opts.hours[d].closes,
    })
  );

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: opts.business_name || "Your Business Name",
    address,
    priceRange: opts.priceRange,
  };
  if (opts.contact_phone) schema.telephone = opts.contact_phone;
  if (opts.website_url) schema.url = opts.website_url;
  if (openingHoursSpecification.length > 0) {
    schema.openingHoursSpecification = openingHoursSpecification;
  }
  const sameAs = opts.sameAs.map((s) => s.trim()).filter(Boolean);
  if (sameAs.length > 0) schema.sameAs = sameAs;
  return schema;
}

export default function SchemaGenerator() {
  usePageTitle("Local Business Schema Generator");
  const { toast } = useToast();

  const { data: profile } = useQuery<SettingsData>({
    queryKey: ["/api/portal/settings"],
    queryFn: async () => {
      const res = await fetch("/api/portal/settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
  });

  // Editable overrides — none persist server-side in v1; refresh = reset.
  const [streetAddress, setStreetAddress] = useState("");
  const [addressLocality, setAddressLocality] = useState("");
  const [addressRegion, setAddressRegion] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [addressCountry, setAddressCountry] = useState("US");
  const [priceRange, setPriceRange] = useState<PriceRange>("$$");
  const [hours, setHours] = useState<HoursMap>(DEFAULT_HOURS);
  const [sameAs, setSameAs] = useState<string[]>([]);
  const [newSocialUrl, setNewSocialUrl] = useState("");
  const [howOpen, setHowOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const profileComplete = !!(
    profile?.business_name &&
    profile?.website_url &&
    profile?.contact_phone
  );

  const schema = useMemo(
    () =>
      buildSchema({
        business_name: profile?.business_name ?? "",
        website_url: profile?.website_url,
        contact_phone: profile?.contact_phone,
        streetAddress,
        addressLocality,
        addressRegion,
        postalCode,
        addressCountry,
        priceRange,
        hours,
        sameAs,
      }),
    [
      profile,
      streetAddress,
      addressLocality,
      addressRegion,
      postalCode,
      addressCountry,
      priceRange,
      hours,
      sameAs,
    ]
  );

  const snippet = `<script type="application/ld+json">\n${JSON.stringify(
    schema,
    null,
    2
  )}\n</script>`;

  // Wire Copilot form-fill — address + price range can be auto-filled by the
  // AI assistant. Hours and sameAs URLs stay user-driven.
  useCopilotForm({
    formLabel: "Local Business Schema",
    fields: [
      { key: "streetAddress", label: "Street address", required: false },
      { key: "addressLocality", label: "City", required: false },
      { key: "addressRegion", label: "Region / state", required: false },
      { key: "postalCode", label: "Postal code", required: false },
      { key: "addressCountry", label: "Country (2-letter)", required: false },
      { key: "priceRange", label: "Price range ($, $$, $$$, $$$$)", required: false },
    ],
    values: {
      streetAddress,
      addressLocality,
      addressRegion,
      postalCode,
      addressCountry,
      priceRange,
    },
    onApply: (fills) => {
      for (const f of fills) {
        const v = String(f.value ?? "");
        switch (f.field_key) {
          case "streetAddress":
            setStreetAddress(v);
            break;
          case "addressLocality":
            setAddressLocality(v);
            break;
          case "addressRegion":
            setAddressRegion(v);
            break;
          case "postalCode":
            setPostalCode(v);
            break;
          case "addressCountry":
            setAddressCountry(v.toUpperCase().slice(0, 2));
            break;
          case "priceRange":
            if ((PRICE_RANGES as readonly string[]).includes(v)) {
              setPriceRange(v as PriceRange);
            }
            break;
        }
      }
    },
    enabled: true,
  });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast({
        title: "Copied",
        description: "Schema snippet copied to clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Copy failed",
        description: "Select the snippet and copy manually.",
        variant: "destructive",
      });
    }
  };

  const addSocial = () => {
    const trimmed = newSocialUrl.trim();
    if (!trimmed) return;
    if (sameAs.includes(trimmed)) {
      setNewSocialUrl("");
      return;
    }
    setSameAs([...sameAs, trimmed]);
    setNewSocialUrl("");
  };

  const removeSocial = (url: string) => {
    setSameAs(sameAs.filter((s) => s !== url));
  };

  return (
    <PortalLayout breadcrumb={
      <span className="flex items-center gap-1.5">
        <Link href="/portal/free-tools" className="hover:text-brand-blue">Free Tools</Link>
        <span className="text-gray-400">/</span>
        <span>Schema Generator</span>
      </span>
    }>
      <div data-theme="light" className="space-y-6">
        <header>
          <div className="flex items-center gap-2 mb-1">
            <FileCode2 className="w-5 h-5 text-brand-blue" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-gray-900">
              Local Business Schema
            </h1>
          </div>
          <p className="text-sm text-gray-600 max-w-3xl">
            This JSON-LD block tells Google your business details in a
            machine-readable format. Paste it once into your site's{" "}
            <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
              &lt;head&gt;
            </code>{" "}
            and you'll be eligible for rich Google search results forever.
          </p>
        </header>

        {!profileComplete && (
          <div
            className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-900"
            data-testid="profile-incomplete-banner"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-medium">Fill in your profile to complete this</p>
              <p className="text-xs mt-0.5">
                Business name, phone, and website come from your account
                settings. Missing values render as placeholders.
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/portal/settings">Open Settings</Link>
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Configuration column */}
          <div className="lg:col-span-1 space-y-3">
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Business address"
                  help="Drop in the postal address Google should associate with your business. Leave any line blank if you don't have it."
                />
                {/* DS rule 4 — 2px gap between stacked inputs. */}
                <div className="space-y-0.5">
                  <TitleInField
                    id="schema-street"
                    label="Street address"
                    value={streetAddress}
                    onChange={setStreetAddress}
                    placeholder="123 Main St"
                    help="The street line of your business address."
                  />
                  <TitleInField
                    id="schema-city"
                    label="City"
                    value={addressLocality}
                    onChange={setAddressLocality}
                    placeholder="Toronto"
                  />
                  <div className="grid grid-cols-2 gap-0.5">
                    <TitleInField
                      id="schema-region"
                      label="Region"
                      value={addressRegion}
                      onChange={setAddressRegion}
                      placeholder="ON"
                      help="Province / state abbreviation."
                    />
                    <TitleInField
                      id="schema-postal"
                      label="Postal code"
                      value={postalCode}
                      onChange={setPostalCode}
                      placeholder="M5V 1A1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-0.5">
                    <TitleInField
                      id="schema-country"
                      label="Country"
                      value={addressCountry}
                      onChange={(v) => setAddressCountry(v.toUpperCase().slice(0, 2))}
                      placeholder="CA"
                      maxLength={2}
                      help="ISO 3166-1 alpha-2 code, e.g. CA, US, GB."
                    />
                    <TitleInFieldSelect
                      id="schema-price"
                      label="Price range"
                      value={priceRange}
                      onChange={(v) => setPriceRange(v as PriceRange)}
                      help="$ = budget, $$$$ = high-end. Used in Google rich results."
                    >
                      {PRICE_RANGES.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </TitleInFieldSelect>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Opening hours"
                  help="Tick the days you're open. Leave a day unchecked to mark it closed in the schema."
                />
                <div className="space-y-0.5">
                  {DAYS.map((d) => (
                    <div key={d} className="flex items-center gap-2">
                      <label className="flex items-center gap-2 w-28 text-xs text-gray-700">
                        <input
                          type="checkbox"
                          checked={hours[d].open}
                          onChange={(e) =>
                            setHours({
                              ...hours,
                              [d]: { ...hours[d], open: e.target.checked },
                            })
                          }
                          className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue/20"
                        />
                        {d.slice(0, 3)}
                      </label>
                      <input
                        type="time"
                        aria-label={`${d} opens`}
                        disabled={!hours[d].open}
                        value={hours[d].opens}
                        onChange={(e) =>
                          setHours({
                            ...hours,
                            [d]: { ...hours[d], opens: e.target.value },
                          })
                        }
                        className={cn(timeInputClass, "flex-1 disabled:opacity-50")}
                      />
                      <input
                        type="time"
                        aria-label={`${d} closes`}
                        disabled={!hours[d].open}
                        value={hours[d].closes}
                        onChange={(e) =>
                          setHours({
                            ...hours,
                            [d]: { ...hours[d], closes: e.target.value },
                          })
                        }
                        className={cn(timeInputClass, "flex-1 disabled:opacity-50")}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Social profiles (sameAs)"
                  help="Add Facebook, Google Business, Yelp, etc. — anywhere else your business has an official profile."
                />
                <div className="flex gap-1.5 items-start">
                  <div className="flex-1">
                    <TitleInField
                      id="schema-social-new"
                      label="Profile URL"
                      value={newSocialUrl}
                      onChange={setNewSocialUrl}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addSocial();
                        }
                      }}
                      placeholder="https://facebook.com/yourbusiness"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addSocial}
                    aria-label="Add social URL"
                    className="mt-1"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {sameAs.length > 0 && (
                  <ul className="space-y-0.5">
                    {sameAs.map((url) => (
                      <li
                        key={url}
                        className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-gray-50 text-xs"
                      >
                        <span className="truncate flex-1 text-gray-700">
                          {url}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeSocial(url)}
                          className="text-gray-400 hover:text-red-600 shrink-0"
                          aria-label={`Remove ${url}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Preview + actions */}
          <div className="lg:col-span-2 space-y-3">
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Your snippet"
                  help="The JSON-LD block to paste into your site's <head>. Updates live as you edit the fields on the left."
                  right={
                    /* DS rule 4 — single .btn-primary-premium per page: this
                       is the primary action (copy the generated snippet). */
                    <Button
                      type="button"
                      onClick={handleCopy}
                      className="btn-primary-premium"
                      data-testid="copy-schema-snippet"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 mr-1.5" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-1.5" />
                          Copy snippet
                        </>
                      )}
                    </Button>
                  }
                />
                <pre
                  className="text-xs bg-slate-50 text-gray-800 p-3 rounded-md overflow-x-auto border border-gray-200 max-h-[480px]"
                  data-testid="schema-snippet"
                >
                  <code>{snippet}</code>
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <button
                  type="button"
                  onClick={() => setHowOpen((v) => !v)}
                  className="flex items-center justify-between w-full text-left"
                  aria-expanded={howOpen}
                >
                  <h2 className="text-sm font-semibold text-gray-900">
                    How to install
                  </h2>
                  {howOpen ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </button>
                {howOpen && (
                  <ul className="mt-3 space-y-2 text-xs text-gray-700">
                    <li>
                      <strong>WordPress:</strong> use a header-injection plugin
                      (e.g. "Insert Headers and Footers") and paste the snippet
                      into the <code>&lt;head&gt;</code> section.
                    </li>
                    <li>
                      <strong>Wix:</strong> Settings → Custom Code → Add Custom
                      Code → paste into <code>&lt;Head&gt;</code>.
                    </li>
                    <li>
                      <strong>Squarespace:</strong> Settings → Advanced → Code
                      Injection → paste into the <strong>Header</strong> box.
                    </li>
                    <li>
                      <strong>Shopify:</strong> Online Store → Themes → Edit
                      code → <code>theme.liquid</code> → paste before{" "}
                      <code>&lt;/head&gt;</code>.
                    </li>
                    <li>
                      <strong>Plain HTML:</strong> paste anywhere inside the{" "}
                      <code>&lt;head&gt;…&lt;/head&gt;</code> of every page.
                    </li>
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-2">
                  What this does
                </h2>
                <ul className="space-y-1.5 text-xs text-gray-700 list-disc pl-5">
                  <li>
                    Eligible for rich result snippets in Google search.
                  </li>
                  <li>
                    No site speed impact — JSON-LD is invisible to users.
                  </li>
                  <li>
                    Auto-updates if you regenerate after editing your business
                    info.
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
