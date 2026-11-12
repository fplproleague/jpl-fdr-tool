// Paginakop (spec §5.2). `meta` = korte statusregel rechts (cijfers in .num), `intro` = max. één
// regel, `more` = langere uitleg achter "ⓘ Uitleg" (klapt inline open).
import { useId, useState } from 'react';
import { Info } from 'lucide-react';
import './PageHeader.css';

export default function PageHeader({ title, meta, intro, more, moreLabel = 'Uitleg', children }) {
  const [open, setOpen] = useState(false);
  const moreId = useId();
  return (
    <header className="ui-page-header">
      <h1 className="display ui-page-header__title">{title}</h1>
      {meta && <div className="ui-page-header__meta">{meta}</div>}
      {(intro || more) && (
        <p className="ui-page-header__intro">
          {intro}
          {more && (
            <button type="button" className="ui-disclosure-btn" aria-expanded={open} aria-controls={moreId} onClick={() => setOpen(o => !o)}>
              <Info aria-hidden="true" strokeWidth={1.75} /> {moreLabel}
            </button>
          )}
        </p>
      )}
      {more && open && <div id={moreId} className="ui-page-header__more">{more}</div>}
      {children}
    </header>
  );
}
