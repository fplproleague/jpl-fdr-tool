// Zoekveld (spec §5.5): overal hetzelfde. Wis-knop (×) zodra er tekst staat.
import { Search, X } from 'lucide-react';
import './Field.css';

export default function SearchField({ value, onChange, placeholder, ariaLabel, clearLabel = 'Wissen', className = '', inputRef, autoFocus, id, ...rest }) {
  return (
    <div className={`ui-search ${className}`}>
      <Search className="ui-search__icon" aria-hidden="true" strokeWidth={1.75} />
      <input
        ref={inputRef}
        id={id}
        type="search"
        className="ui-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        {...rest}
      />
      {value && (
        <button type="button" className="ui-search__clear" onClick={() => onChange('')} aria-label={clearLabel}>
          <X aria-hidden="true" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
