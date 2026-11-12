// PlayerCell (spec §5.8): één manier om een speler te tonen in elke lijst.
//   [foto 24]  Vanaken            ★
//              CLU · MID · €11.5
// Op desktop staan club en positie meestal in eigen kolommen: geef dan `sub={false}`/`subDesktop={false}`.
// Op gsm toont de cel de korte naam (`short`), op desktop de volledige.
import { memo } from 'react';
import { PlayerFace, PlayerFaceByName } from './PlayerFace';
import './PlayerCell.css';

const PlayerCell = memo(function PlayerCell({
  name, short, photo, clubCode, position, price, faceSize = 24, byName = false,
  sub = true, subDesktop = true, badges, trailing, onClick, buttonLabel,
}) {
  const face = byName
    ? <PlayerFaceByName name={name} clubCode={clubCode} size={faceSize} />
    : <PlayerFace src={photo} name={short || name} size={faceSize} />;
  const subParts = [clubCode, position, price != null && price !== '' ? `€${Number(price).toFixed(1)}` : null].filter(Boolean);
  const nameEl = (
    <>
      <span className="ui-pcell__full">{name}</span>
      <span className="ui-pcell__short">{short || name}</span>
    </>
  );
  return (
    <span className="ui-pcell">
      {face}
      <span className="ui-pcell__text">
        <span className="ui-pcell__name">
          {onClick ? (
            <button type="button" className="ui-pcell__btn" onClick={onClick} aria-label={buttonLabel}>{nameEl}</button>
          ) : nameEl}
          {badges}
        </span>
        {sub && subParts.length > 0 && (
          <span className={`ui-pcell__sub${subDesktop ? '' : ' is-mobile-only'}`}>
            {clubCode}{position ? ` · ${position}` : ''}
            {price != null && price !== '' && <> · <span className="num">€{Number(price).toFixed(1)}</span></>}
          </span>
        )}
      </span>
      {trailing}
    </span>
  );
});

export default PlayerCell;
