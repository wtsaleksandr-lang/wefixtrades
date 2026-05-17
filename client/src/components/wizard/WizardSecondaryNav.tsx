// The wizard's 2nd navigation bar — contextual per-step "adjustments" nav.
// Top bar = step navigation; this bar = the sub-sections of the active step.
// Desktop: a vertical left rail. Mobile: a bottom bar. (Positioning is done
// by the .wizard-2ndbar CSS in WizardCard's style block.)
import { dashboardTheme as d } from '@/theme/dashboardTheme';

export interface SecondarySection {
  id: string;
  label: string;
  /** CSS selector to scroll into view when this section is picked. */
  target: string;
  Icon: any;
}

export default function WizardSecondaryNav({
  sections, active, onSelect,
}: {
  sections: SecondarySection[];
  active: string;
  onSelect: (id: string) => void;
}) {
  if (sections.length < 2) return null; // no bar for single-section steps
  return (
    <nav className="wizard-2ndbar" data-testid="wizard-secondary-nav">
      {sections.map((s) => {
        const on = active === s.id;
        return (
          <button
            key={s.id}
            type="button"
            data-testid={`secnav-${s.id}`}
            className={`wizard-2ndbar-item${on ? ' is-active' : ''}`}
            onClick={() => onSelect(s.id)}
          >
            <span
              className="wizard-2ndbar-icon"
              style={{
                background: on ? d.colors.navActiveBg : 'transparent',
                color: on ? d.colors.navActiveIcon : d.colors.navIcon,
                boxShadow: on ? d.shadows.nav : 'none',
              }}
            >
              <s.Icon style={{ width: 16, height: 16 }} />
            </span>
            <span
              className="wizard-2ndbar-label"
              style={{ color: on ? d.colors.heading : d.colors.muted }}
            >
              {s.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
