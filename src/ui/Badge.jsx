// Badge (spec §5.12). tone: neutral | accent | danger | warning | outline.
import './Badge.css';

export default function Badge({ tone = 'neutral', children, title, className = '', ...rest }) {
  return (
    <span className={`ui-badge${tone !== 'neutral' ? ` ui-badge--${tone}` : ''} ${className}`} title={title} {...rest}>
      {children}
    </span>
  );
}
