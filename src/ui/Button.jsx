// Knop (spec §5.3): primary | secondary | ghost | danger | icon. Icoon 16px links, zinsnotatie.
// `as="a"` voor een link die eruitziet als een knop.
import './Button.css';

export default function Button({
  variant = 'secondary', size, block = false, bare = false, icon: Icon, as: Tag = 'button',
  className = '', children, type, ...rest
}) {
  const classes = [
    'ui-btn', `ui-btn--${variant}`, size === 'sm' && 'ui-btn--sm', block && 'ui-btn--block',
    bare && 'ui-btn--bare', className,
  ].filter(Boolean).join(' ');
  return (
    <Tag className={classes} type={Tag === 'button' ? (type ?? 'button') : type} {...rest}>
      {Icon && <Icon aria-hidden="true" strokeWidth={1.75} />}
      {children}
    </Tag>
  );
}
