// Native <select> met de stijl van SearchField (spec §5.5). Native blijft beter op gsm.
import './Field.css';

export default function Select({ value, onChange, options, children, size, className = '', ...rest }) {
  return (
    <select
      className={`ui-select${size === 'sm' ? ' ui-select--sm' : ''} ${className}`}
      value={value}
      onChange={e => onChange(e.target.value)}
      {...rest}
    >
      {options ? options.map(o => (
        <option key={String(o.value)} value={o.value} disabled={o.disabled}>{o.label}</option>
      )) : children}
    </select>
  );
}
