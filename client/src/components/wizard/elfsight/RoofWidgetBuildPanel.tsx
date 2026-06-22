// RoofWidgetBuildPanel — adaptive Build-tab content for the 3D Roof & Solar
// visualizer template (widgetKind === 'roof_visualizer').
//
// The generic BuildTab (fields / calculations / pricing tiers / titles) is
// irrelevant for this template: the calculator does not render a field/result
// form, it embeds the first-party 3D roof & solar widget in an iframe. This
// panel replaces it with WIDGET-SPECIFIC controls that mirror the widget's
// TENANT object (spikes/roof-quote/roof3d.html ~679-696). The edited config
// lives in `settings.roofWidget` (RoofWidgetConfig), is persisted via
// buildAdvancedConfig → `advanced.roofWidget`, and is bridged into the live
// iframe over postMessage (`qq:tenant-config`).
//
// Coverage vs. a regular template (owner's hard requirement — the widget must
// be FULLY customizable):
//   - Business (logo + name)          → kept (top, shared with BuildTab)
//   - Template strip                  → kept (top, shared with BuildTab)
//   - Header title/subtitle           → "Widget header" section
//   - Branding & trust                → "Branding & trust" (company, license,
//     phone/email/web, tagline, about, rating/reviews, promises, certifications)
//   - Financing terms                 → "Financing"
//   - Feature toggles                 → "Features & lenses"
//   - Theme / accent colour           → "Theme"
//   - Lead notification email         → Action tab (kept, trimmed)
//   - Brand badge / slug / Install    → Settings + Install tabs (kept)
//
// Intentionally OMITTED here (and why): Fields, Calculations, Pricing tiers,
// Step layout, Result text, Generate-with-AI — the widget is self-contained and
// computes its own prices/quotes, so a form-builder + pricing math have no
// surface inside it.

import { useCallback, useRef, useState } from 'react';
import { ImagePlus, Plus, Trash2 } from 'lucide-react';
import { AE } from './appleEditor';
import AdvancedSection from './AdvancedSection';
import FloatField from './FloatField';
import InfoCue from './InfoCue';
import TemplateStrip, { type ApplyTemplatePayload } from './TemplateGallery';
import {
  DEFAULT_ROOF_WIDGET_CONFIG,
  type RoofWidgetConfig,
  type RoofWidgetTrade,
  type RoofWidgetFinancing,
  type RoofWidgetFeatures,
  type RoofWidgetPromise,
  type RoofWidgetCertification,
  type ShellHeader,
} from './types';

interface Props {
  businessName: string;
  onBusinessNameChange: (v: string) => void;
  logo: string | null;
  onLogoChange: (next: string | null) => void;
  activeTemplateId?: string;
  onApplyTemplate: (next: ApplyTemplatePayload) => void;
  /** The persisted roof-widget config (settings.roofWidget). */
  config?: RoofWidgetConfig;
  /** Patch the whole roof-widget config. */
  onConfigChange: (next: RoofWidgetConfig) => void;
  /** Widget header — title/subtitle shown above the iframe (RoofVisualizerEmbed). */
  header: ShellHeader;
  onHeaderChange: (next: ShellHeader) => void;
}

const LOGO_MAX_BYTES = 1024 * 1024;

/** Read-with-fallback helpers so an unset config branch shows the showcase
 *  default value (matching what the widget ships with) instead of blank. */
const D = DEFAULT_ROOF_WIDGET_CONFIG;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** A simple Apple-style on/off toggle row used by the Features section. */
function ToggleRow({
  label, hint, checked, onChange, testid,
}: {
  label: string; hint: string; checked: boolean;
  onChange: (next: boolean) => void; testid: string;
}) {
  return (
    <label className="rwp-toggle" data-testid={testid}>
      <span className="rwp-toggle-text">
        <span className="rwp-toggle-label">{label}</span>
        <span className="rwp-toggle-hint">{hint}</span>
      </span>
      <span className={`rwp-switch${checked ? ' is-on' : ''}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          data-testid={`${testid}-input`}
        />
        <span className="rwp-switch-knob" aria-hidden="true" />
      </span>
    </label>
  );
}

export default function RoofWidgetBuildPanel({
  businessName, onBusinessNameChange,
  logo, onLogoChange,
  activeTemplateId, onApplyTemplate,
  config, onConfigChange,
  header, onHeaderChange,
}: Props) {
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  const trade: RoofWidgetTrade = config?.trade ?? {};
  const financing: RoofWidgetFinancing = config?.financing ?? {};
  const features: RoofWidgetFeatures = config?.features ?? {};

  // ── Patch helpers — each merges into the right branch and emits the whole
  //    config up. Keeping them tiny means every input is a one-liner. ──
  const patchTrade = useCallback((next: Partial<RoofWidgetTrade>) => {
    onConfigChange({ ...(config ?? {}), trade: { ...(config?.trade ?? {}), ...next } });
  }, [config, onConfigChange]);
  const patchFinancing = useCallback((next: Partial<RoofWidgetFinancing>) => {
    onConfigChange({ ...(config ?? {}), financing: { ...(config?.financing ?? {}), ...next } });
  }, [config, onConfigChange]);
  const patchFeatures = useCallback((next: Partial<RoofWidgetFeatures>) => {
    onConfigChange({ ...(config ?? {}), features: { ...(config?.features ?? {}), ...next } });
  }, [config, onConfigChange]);
  const setAccent = useCallback((accent: string) => {
    onConfigChange({ ...(config ?? {}), accent });
  }, [config, onConfigChange]);

  // ── Repeatable-list editors (promises / certifications) ──
  const promises: RoofWidgetPromise[] = Array.isArray(trade.promises) ? trade.promises : [];
  const certs: RoofWidgetCertification[] = Array.isArray(trade.certifications) ? trade.certifications : [];
  const setPromises = (next: RoofWidgetPromise[]) => patchTrade({ promises: next });
  const setCerts = (next: RoofWidgetCertification[]) => patchTrade({ certifications: next });

  const onLogoFile = useCallback((file: File | null) => {
    if (!file) { setLogoError(null); onLogoChange(null); patchTrade({ logo: '' }); return; }
    if (file.size > LOGO_MAX_BYTES) {
      setLogoError('Logo must be under 1 MB. Try a smaller or compressed image.');
      return;
    }
    fileToDataUrl(file)
      .then((dataUrl) => {
        setLogoError(null);
        onLogoChange(dataUrl);
        // Mirror into the widget TENANT.trade.logo so it shows on the report.
        patchTrade({ logo: dataUrl });
      })
      .catch(() => setLogoError('Could not read that image. Try another file.'));
  }, [onLogoChange, patchTrade]);

  // numeric input helper — empty string clears (falls back to default); a
  // valid number writes through. Keeps NaN out of the persisted config.
  const numField = (raw: string): number | undefined => {
    const v = raw.trim();
    if (v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const accent = config?.accent ?? '#0d3cfc';

  return (
    <div
      data-theme="light"
      className="qq-editor-tabpanel rwp-panel"
      data-testid="editor-tabpanel-build"
      data-section
      data-cue-allowed-multiple
      role="tabpanel"
    >
      {/* Template strip — same entry point BuildTab keeps, so the user can
          switch templates from here too. */}
      <AdvancedSection
        id="roofwidget-template"
        label="Switch template"
        hint="pick a different template"
        defaultOpen={false}
        prominent
      >
        <TemplateStrip activeTemplateId={activeTemplateId} onApplyTemplate={onApplyTemplate} />
      </AdvancedSection>

      <hr className="rwp-divider" />

      {/* Business (logo + name) — shared identity, mirrors BuildTab's section. */}
      <section className="rwp-section" data-testid="roofwidget-business">
        <header className="rwp-section-head">
          <h3 className="rwp-section-title">
            <InfoCue
              testid="roofwidget-business"
              region="header"
              text="Your company name and logo. The logo also appears on the widget's downloadable roof & solar proposal."
            />
            <span>Business</span>
          </h3>
        </header>
        <div className="rwp-business-composite">
          <div className="rwp-logo-slot">
            <button
              type="button"
              className="rwp-logo-upload"
              data-testid="roofwidget-logo-upload"
              aria-label={logo ? 'Replace business logo' : 'Upload business logo'}
              onClick={() => logoInputRef.current?.click()}
            >
              {logo ? <img src={logo} alt="" /> : <ImagePlus size={20} aria-hidden="true" />}
            </button>
            {logo && (
              <button
                type="button"
                className="rwp-logo-clear"
                data-testid="roofwidget-logo-clear"
                aria-label="Remove business logo"
                onClick={() => onLogoFile(null)}
              >×</button>
            )}
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            aria-label="Upload business logo"
            data-testid="roofwidget-logo-input"
            style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}
            onChange={(e) => { onLogoFile(e.target.files?.[0] ?? null); e.target.value = ''; }}
          />
          <FloatField label="Business name" htmlFor="rwp-business-name" className="rwp-namewrap">
            <input
              id="rwp-business-name"
              type="text"
              className="premium-input"
              placeholder=" "
              value={businessName}
              onChange={(e) => onBusinessNameChange(e.target.value)}
              data-testid="roofwidget-input-business-name"
            />
          </FloatField>
        </div>
        {logoError && (
          <p className="rwp-error" role="alert" data-testid="roofwidget-logo-error">{logoError}</p>
        )}
      </section>

      <hr className="rwp-divider" />

      {/* Widget header — the title/subtitle shown above the iframe. */}
      <section className="rwp-section" data-testid="roofwidget-header">
        <header className="rwp-section-head">
          <h3 className="rwp-section-title">
            <InfoCue
              testid="roofwidget-header"
              text="The headline and subtext shown above the 3D widget on your page. Leave blank to use the default invitation to enter an address."
            />
            <span>Widget header</span>
          </h3>
        </header>
        <div className="rwp-fieldlist">
          <FloatField label="Header title" htmlFor="rwp-header-title">
            <input
              id="rwp-header-title"
              type="text"
              className="premium-input"
              placeholder=" "
              value={header.title ?? ''}
              onChange={(e) => onHeaderChange({ ...header, title: e.target.value })}
              data-testid="roofwidget-input-header-title"
            />
          </FloatField>
          <FloatField label="Header subtitle" htmlFor="rwp-header-subtitle">
            <input
              id="rwp-header-subtitle"
              type="text"
              className="premium-input"
              placeholder=" "
              value={header.subtitle ?? ''}
              onChange={(e) => onHeaderChange({ ...header, subtitle: e.target.value })}
              data-testid="roofwidget-input-header-subtitle"
            />
          </FloatField>
        </div>
      </section>

      <hr className="rwp-divider" />

      {/* Branding & trust — the white-label proposal info. */}
      <AdvancedSection
        id="roofwidget-branding"
        label="Branding & trust"
        hint="company, license, contact, promises, certifications, reviews"
        defaultOpen
      >
        <div className="rwp-fieldlist">
          <FloatField label="Company name" htmlFor="rwp-company"
            infoText="Shown on the proposal/report header and hero. Empty shows a placeholder so you can see where it goes.">
            <input id="rwp-company" type="text" className="premium-input" placeholder=" "
              value={trade.company ?? ''} onChange={(e) => patchTrade({ company: e.target.value })}
              data-testid="roofwidget-input-company" />
          </FloatField>
          <FloatField label="License #" htmlFor="rwp-license">
            <input id="rwp-license" type="text" className="premium-input" placeholder=" "
              value={trade.license ?? ''} onChange={(e) => patchTrade({ license: e.target.value })}
              data-testid="roofwidget-input-license" />
          </FloatField>
          <FloatField label="Phone" htmlFor="rwp-phone">
            <input id="rwp-phone" type="tel" className="premium-input" placeholder=" "
              value={trade.phone ?? ''} onChange={(e) => patchTrade({ phone: e.target.value })}
              data-testid="roofwidget-input-phone" />
          </FloatField>
          <FloatField label="Email" htmlFor="rwp-email">
            <input id="rwp-email" type="email" className="premium-input" placeholder=" "
              value={trade.email ?? ''} onChange={(e) => patchTrade({ email: e.target.value })}
              data-testid="roofwidget-input-email" />
          </FloatField>
          <FloatField label="Website" htmlFor="rwp-web">
            <input id="rwp-web" type="text" className="premium-input" placeholder=" "
              value={trade.web ?? ''} onChange={(e) => patchTrade({ web: e.target.value })}
              data-testid="roofwidget-input-web" />
          </FloatField>
          <FloatField label="Tagline" htmlFor="rwp-tagline"
            infoText="A one-line trust statement shown under your company name on the proposal.">
            <input id="rwp-tagline" type="text" className="premium-input" placeholder=" "
              value={trade.tagline ?? ''} onChange={(e) => patchTrade({ tagline: e.target.value })}
              data-testid="roofwidget-input-tagline" />
          </FloatField>
          <FloatField label="About your company" htmlFor="rwp-about"
            infoText="The 'About' paragraph on the proposal. Who you are, your experience, what makes you different.">
            <textarea id="rwp-about" className="premium-input rwp-textarea" placeholder=" " rows={3}
              value={trade.about ?? ''} onChange={(e) => patchTrade({ about: e.target.value })}
              data-testid="roofwidget-input-about" />
          </FloatField>
          <div className="rwp-row2">
            <FloatField label="Star rating" htmlFor="rwp-rating"
              infoText="Aggregate rating shown with a star on the proposal (e.g. 4.8).">
              <input id="rwp-rating" type="number" step="0.1" min="0" max="5" className="premium-input" placeholder=" "
                value={trade.rating ?? ''} onChange={(e) => patchTrade({ rating: numField(e.target.value) })}
                data-testid="roofwidget-input-rating" />
            </FloatField>
            <FloatField label="Review count" htmlFor="rwp-reviews">
              <input id="rwp-reviews" type="number" min="0" className="premium-input" placeholder=" "
                value={trade.reviews ?? ''} onChange={(e) => patchTrade({ reviews: numField(e.target.value) })}
                data-testid="roofwidget-input-reviews" />
            </FloatField>
          </div>
        </div>

        {/* Promises (up to 3) */}
        <div className="rwp-list" data-testid="roofwidget-promises">
          <div className="rwp-list-head">
            <span className="rwp-list-title">Promises</span>
            <InfoCue testid="roofwidget-promises"
              text="Up to three short promises shown as cards in the proposal (e.g. 'On-time, on-budget, guaranteed')." />
          </div>
          {promises.map((pm, i) => (
            <div className="rwp-list-row" key={i}>
              <div className="rwp-fieldlist rwp-list-fields">
                <FloatField label="Title" htmlFor={`rwp-prom-t-${i}`}>
                  <input id={`rwp-prom-t-${i}`} type="text" className="premium-input" placeholder=" "
                    value={pm.title} data-testid={`roofwidget-promise-title-${i}`}
                    onChange={(e) => setPromises(promises.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
                </FloatField>
                <FloatField label="Body" htmlFor={`rwp-prom-b-${i}`}>
                  <input id={`rwp-prom-b-${i}`} type="text" className="premium-input" placeholder=" "
                    value={pm.body} data-testid={`roofwidget-promise-body-${i}`}
                    onChange={(e) => setPromises(promises.map((x, j) => j === i ? { ...x, body: e.target.value } : x))} />
                </FloatField>
              </div>
              <button type="button" className="rwp-list-remove" aria-label="Remove promise"
                data-testid={`roofwidget-promise-remove-${i}`}
                onClick={() => setPromises(promises.filter((_, j) => j !== i))}>
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
          {promises.length < 3 && (
            <button type="button" className="rwp-add" data-testid="roofwidget-promise-add"
              onClick={() => setPromises([...promises, { title: '', body: '' }])}>
              <Plus size={14} aria-hidden="true" /><span>Add promise</span>
            </button>
          )}
        </div>

        {/* Certifications */}
        <div className="rwp-list" data-testid="roofwidget-certifications">
          <div className="rwp-list-head">
            <span className="rwp-list-title">Certifications</span>
            <InfoCue testid="roofwidget-certifications"
              text="Awards / certifications shown as trust cards (e.g. 'GAF Master Elite', 'BBB A+')." />
          </div>
          {certs.map((c, i) => (
            <div className="rwp-list-row" key={i}>
              <div className="rwp-fieldlist rwp-list-fields">
                <FloatField label="Name" htmlFor={`rwp-cert-n-${i}`}>
                  <input id={`rwp-cert-n-${i}`} type="text" className="premium-input" placeholder=" "
                    value={c.name} data-testid={`roofwidget-cert-name-${i}`}
                    onChange={(e) => setCerts(certs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                </FloatField>
                <FloatField label="Body" htmlFor={`rwp-cert-b-${i}`}>
                  <input id={`rwp-cert-b-${i}`} type="text" className="premium-input" placeholder=" "
                    value={c.body} data-testid={`roofwidget-cert-body-${i}`}
                    onChange={(e) => setCerts(certs.map((x, j) => j === i ? { ...x, body: e.target.value } : x))} />
                </FloatField>
              </div>
              <button type="button" className="rwp-list-remove" aria-label="Remove certification"
                data-testid={`roofwidget-cert-remove-${i}`}
                onClick={() => setCerts(certs.filter((_, j) => j !== i))}>
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
          <button type="button" className="rwp-add" data-testid="roofwidget-cert-add"
            onClick={() => setCerts([...certs, { name: '', body: '' }])}>
            <Plus size={14} aria-hidden="true" /><span>Add certification</span>
          </button>
        </div>
      </AdvancedSection>

      <hr className="rwp-divider" />

      {/* Financing terms */}
      <AdvancedSection
        id="roofwidget-financing"
        label="Financing"
        hint="loan APR / term + lease pricing"
      >
        <div className="rwp-fieldlist">
          <div className="rwp-row2">
            <FloatField label="Solar APR (%)" htmlFor="rwp-solar-apr"
              infoText="Annual percentage rate used for the solar loan payment shown in the widget.">
              <input id="rwp-solar-apr" type="number" step="0.01" min="0" className="premium-input" placeholder=" "
                value={financing.solarApr ?? ''} data-testid="roofwidget-input-solar-apr"
                onChange={(e) => patchFinancing({ solarApr: numField(e.target.value) })} />
            </FloatField>
            <FloatField label="Solar term (yrs)" htmlFor="rwp-solar-years">
              <input id="rwp-solar-years" type="number" min="1" className="premium-input" placeholder=" "
                value={financing.solarYears ?? ''} data-testid="roofwidget-input-solar-years"
                onChange={(e) => patchFinancing({ solarYears: numField(e.target.value) })} />
            </FloatField>
          </div>
          <div className="rwp-row2">
            <FloatField label="Roof APR (%)" htmlFor="rwp-roof-apr">
              <input id="rwp-roof-apr" type="number" step="0.01" min="0" className="premium-input" placeholder=" "
                value={financing.roofApr ?? ''} data-testid="roofwidget-input-roof-apr"
                onChange={(e) => patchFinancing({ roofApr: numField(e.target.value) })} />
            </FloatField>
            <FloatField label="Roof term (yrs)" htmlFor="rwp-roof-years">
              <input id="rwp-roof-years" type="number" min="1" className="premium-input" placeholder=" "
                value={financing.roofYears ?? ''} data-testid="roofwidget-input-roof-years"
                onChange={(e) => patchFinancing({ roofYears: numField(e.target.value) })} />
            </FloatField>
          </div>
          <ToggleRow
            label="Offer $0-down lease / PPA"
            hint="show a lease payment option in the widget"
            checked={financing.leaseEnabled ?? D.financing!.leaseEnabled!}
            onChange={(v) => patchFinancing({ leaseEnabled: v })}
            testid="roofwidget-toggle-lease-enabled"
          />
          {(financing.leaseEnabled ?? D.financing!.leaseEnabled!) && (
            <FloatField label="Lease $/mo per kW" htmlFor="rwp-lease-per-kw"
              infoText="Monthly lease/PPA price per installed kW used for the $0-down option.">
              <input id="rwp-lease-per-kw" type="number" step="0.5" min="0" className="premium-input" placeholder=" "
                value={financing.leasePerKwMo ?? ''} data-testid="roofwidget-input-lease-per-kw"
                onChange={(e) => patchFinancing({ leasePerKwMo: numField(e.target.value) })} />
            </FloatField>
          )}
        </div>
      </AdvancedSection>

      <hr className="rwp-divider" />

      {/* Features & lenses */}
      <AdvancedSection
        id="roofwidget-features"
        label="Features & lenses"
        hint="which add-ons and tools appear in the widget"
        defaultOpen
      >
        <div className="rwp-toggles" data-testid="roofwidget-features">
          <ToggleRow label="Battery storage" hint="Powerwall-class backup add-on"
            checked={features.battery ?? D.features!.battery!} onChange={(v) => patchFeatures({ battery: v })}
            testid="roofwidget-toggle-battery" />
          <ToggleRow label="EV charging" hint="size solar for an EV + L2 charger"
            checked={features.ev ?? D.features!.ev!} onChange={(v) => patchFeatures({ ev: v })}
            testid="roofwidget-toggle-ev" />
          <ToggleRow label="SREC income" hint="show SREC credit earnings where applicable"
            checked={features.srec ?? D.features!.srec!} onChange={(v) => patchFeatures({ srec: v })}
            testid="roofwidget-toggle-srec" />
          <ToggleRow label="Lease / PPA option" hint="offer a $0-down lease in the payment picker"
            checked={features.leasePPA ?? D.features!.leasePPA!} onChange={(v) => patchFeatures({ leasePPA: v })}
            testid="roofwidget-toggle-leasePPA" />
          <ToggleRow label="Lead qualification" hint="ask timeline / priorities before the report"
            checked={features.leadQual ?? D.features!.leadQual!} onChange={(v) => patchFeatures({ leadQual: v })}
            testid="roofwidget-toggle-leadQual" />
          <ToggleRow label="System-size slider" hint="let homeowners resize the system"
            checked={features.sizeSlider ?? D.features!.sizeSlider!} onChange={(v) => patchFeatures({ sizeSlider: v })}
            testid="roofwidget-toggle-sizeSlider" />
          <ToggleRow label="Downloadable report" hint="full roof & solar proposal PDF"
            checked={features.report ?? D.features!.report!} onChange={(v) => patchFeatures({ report: v })}
            testid="roofwidget-toggle-report" />
        </div>
      </AdvancedSection>

      <hr className="rwp-divider" />

      {/* Theme — accent colour for the widget UI. */}
      <AdvancedSection
        id="roofwidget-theme"
        label="Theme"
        hint="accent colour of the widget"
      >
        <div className="rwp-theme-row" data-testid="roofwidget-theme">
          <div className="rwp-theme-text">
            <span className="rwp-toggle-label">Accent colour</span>
            <span className="rwp-toggle-hint">Buttons, highlights and selected states inside the widget.</span>
          </div>
          <InfoCue testid="roofwidget-accent"
            text="The widget's brand accent — buttons, highlights and selected states. Defaults to QuoteQuick blue." />
          <input
            type="color"
            className="rwp-color"
            aria-label="Widget accent colour"
            data-testid="roofwidget-input-accent"
            value={/^#[0-9a-fA-F]{6}$/.test(accent) ? accent : '#0d3cfc'}
            onChange={(e) => setAccent(e.target.value)}
          />
        </div>
      </AdvancedSection>

      <style>{`
        .rwp-panel { display: flex; flex-direction: column; gap: 2px; font-family: ${AE.font.family}; }
        .rwp-divider { height: 1px; background: ${AE.color.hairline}; margin: 0; border: 0; }
        .rwp-section { padding: 8px 0; }
        .rwp-section-head { display: flex; align-items: center; margin: 0 0 8px; }
        .rwp-section-title {
          margin: 0; display: inline-flex; align-items: center; gap: 6px;
          font-size: 11.5px; font-weight: 600; color: ${AE.color.secondary};
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .rwp-business-composite { display: flex; align-items: stretch; gap: 10px; }
        .rwp-namewrap { flex: 1; min-width: 0; }
        .rwp-logo-slot { position: relative; flex-shrink: 0; width: 48px; height: 48px; }
        .rwp-logo-upload {
          width: 48px; height: 48px; display: inline-flex; align-items: center; justify-content: center;
          background: #fff; color: ${AE.color.secondary};
          border: 1px dashed ${AE.color.hairline}; border-radius: 10px;
          cursor: pointer; padding: 0; overflow: hidden;
          transition: border-color 0.12s ease, color 0.12s ease;
        }
        .rwp-logo-upload:hover { border-color: ${AE.color.accent}; color: ${AE.color.accent}; }
        .rwp-logo-upload img { width: 100%; height: 100%; object-fit: contain; }
        .rwp-logo-clear {
          position: absolute; top: -8px; right: -8px; width: 18px; height: 18px;
          background: #fff; border: 1px solid ${AE.color.hairline}; border-radius: 50%;
          cursor: pointer; padding: 0; font-size: 12px; line-height: 1; color: ${AE.color.secondary};
        }
        .rwp-logo-clear:hover { color: ${AE.color.danger}; border-color: ${AE.color.danger}; }
        .rwp-fieldlist { display: flex; flex-direction: column; gap: 2px; }
        .rwp-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; }
        .rwp-textarea { min-height: 64px; resize: vertical; line-height: 1.45; padding-top: 22px; }
        .rwp-error { margin: 6px 0 0; font-size: ${AE.type.helper.size}; color: ${AE.color.danger}; line-height: 1.4; }

        /* Toggle rows */
        .rwp-toggles { display: flex; flex-direction: column; gap: 2px; }
        .rwp-toggle {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 10px 12px; background: ${AE.color.surface};
          border: 1px solid ${AE.color.hairline}; border-radius: ${AE.radius.sm};
          cursor: pointer;
        }
        .rwp-toggle-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        .rwp-toggle-label { font-size: ${AE.type.label.size}; font-weight: 500; color: ${AE.color.text}; }
        .rwp-toggle-hint { font-size: ${AE.type.helper.size}; color: ${AE.color.secondary}; }
        .rwp-switch {
          position: relative; flex-shrink: 0; width: 40px; height: 24px;
          border-radius: 999px; background: ${AE.color.hairlineStrong};
          transition: background 0.15s ease;
        }
        .rwp-switch.is-on { background: ${AE.color.accent}; }
        .rwp-switch input { position: absolute; opacity: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; }
        .rwp-switch-knob {
          position: absolute; top: 2px; left: 2px; width: 20px; height: 20px;
          border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.25);
          transition: transform 0.15s ease;
        }
        .rwp-switch.is-on .rwp-switch-knob { transform: translateX(16px); }

        /* Repeatable lists */
        .rwp-list { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
        .rwp-list-head { display: flex; align-items: center; gap: 6px; }
        .rwp-list-title {
          font-size: 11.5px; font-weight: 600; color: ${AE.color.secondary};
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .rwp-list-row { display: flex; align-items: flex-start; gap: 6px; }
        .rwp-list-fields { flex: 1; min-width: 0; }
        .rwp-list-remove {
          flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
          width: 32px; height: 32px; margin-top: 4px;
          background: #fff; border: 1px solid ${AE.color.hairline}; border-radius: ${AE.radius.sm};
          color: ${AE.color.secondary}; cursor: pointer;
        }
        .rwp-list-remove:hover { color: ${AE.color.danger}; border-color: ${AE.color.danger}; }
        .rwp-add {
          align-self: flex-start; display: inline-flex; align-items: center; gap: 6px;
          font: inherit; font-size: 12.5px; font-weight: 500; color: ${AE.color.accent};
          background: ${AE.color.accentTint}; border: 1px solid ${AE.color.accent}40;
          border-radius: ${AE.radius.pill}; padding: 6px 12px; cursor: pointer;
        }
        .rwp-add:hover { border-color: ${AE.color.accent}; }

        /* Theme accent */
        .rwp-theme-row { display: flex; align-items: center; gap: 10px; }
        .rwp-theme-text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
        .rwp-color {
          flex-shrink: 0; width: 44px; height: 32px; padding: 0;
          border: 1px solid ${AE.color.hairline}; border-radius: ${AE.radius.sm};
          background: #fff; cursor: pointer;
        }
      `}</style>
    </div>
  );
}
