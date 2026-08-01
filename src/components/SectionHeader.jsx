// Herbruikbare collapsible-section-header (icoon + titel + chevron), gebruikt door de 4 secties in
// FDRTab (Team-sterkte instellen, Fixture Difficulty Rating, Beste fixture runs, Vergelijk teams).

import { memo } from 'react';
import { ChevronDown } from 'lucide-react';
import { sectionTitleStyle } from '../constants';

const sectionToggleButtonStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
  background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: '12px'
};

function chevronStyle(isOpen) {
  return { transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' };
}

export const SectionHeader = memo(function SectionHeader({ icon: Icon, title, sectionKey, isOpen, onToggle }) {
  return (
    <button onClick={() => onToggle(sectionKey)} style={sectionToggleButtonStyle}>
      <h2 className="fdr-title fdr-section-title" style={sectionTitleStyle}>
        <Icon size={18} color="#4ECDC4" /> {title}
      </h2>
      {/* Vult de ruimte tussen titel en chevron; flex: 1 laat 'm meekrimpen/groeien met de knopbreedte. */}
      <span aria-hidden="true" style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)', margin: '0 8px' }} />
      <ChevronDown size={20} color="#C9B8E0" style={chevronStyle(isOpen)} />
    </button>
  );
});
