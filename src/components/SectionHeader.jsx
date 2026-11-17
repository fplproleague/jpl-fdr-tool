// Herbruikbare in-/uitklapbare sectiekop: titel + lijn + chevron. Gebruikt door FDRTab (Beste fixture
// runs, Vergelijk teams) en TeamPlannerTab.
//
// Sinds de rework (spec §4 en §5.2) zonder icoon voor de titel: de prop `icon` wordt nog aanvaard
// zodat de bestaande aanroepen blijven werken, maar niet meer getekend.

import { memo } from 'react';
import { ChevronDown } from 'lucide-react';
import '../ui/Section.css';

// eslint-disable-next-line no-unused-vars
export const SectionHeader = memo(function SectionHeader({ icon, title, sectionKey, isOpen, onToggle, meta }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(sectionKey)}
      // aria-expanded vertelt schermlezers of de sectie open of dicht staat; aria-controls koppelt de
      // knop aan het paneel dat hij bestuurt (zie de id op de inhoud in de tabs).
      aria-expanded={isOpen}
      aria-controls={`fdr-section-${sectionKey}`}
      className="ui-section-toggle"
    >
      <h2 className="ui-section-title">{title}</h2>
      {meta && <span className="ui-section-meta">{meta}</span>}
      <span aria-hidden="true" className="ui-section-rule" />
      <ChevronDown aria-hidden="true" strokeWidth={1.75} className={`ui-section-chevron${isOpen ? ' is-open' : ''}`} />
    </button>
  );
});
