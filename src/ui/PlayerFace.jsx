// PlayerFace (spec §5.7): vierkante spelersfoto (een knipoog naar het Panini-album), radius 2px.
// Maten 20 | 24 | 32 | 48 | 72. Werkt met een API-speler (`player.photo`) of met (name, clubCode) uit
// de spelersdatabank: dan zoekt usePlayerIndex de foto op. Valt terug op initialen, ook bij een
// laadfout (nooit een onzichtbare img).
import { memo, useState } from 'react';
import usePlayerIndex from '../data/usePlayerIndex';
import './PlayerFace.css';

function initialsOf(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).map(s => s[0]).join('').slice(0, 2).toUpperCase();
}

function FaceBox({ src, name, size }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };
  if (!src || failed) {
    return (
      <span className="ui-face ui-face--empty" aria-hidden="true" style={{ ...box, fontSize: Math.max(10, Math.round(size * 0.4)) }}>
        <span className="num">{initialsOf(name)}</span>
      </span>
    );
  }
  return (
    <span className="ui-face" aria-hidden="true" style={box}>
      <img src={src} alt="" loading="lazy" decoding="async" width={size} height={size} onError={() => setFailed(true)} />
    </span>
  );
}

// Met een API-speler (heeft al een foto-URL) — geen index nodig.
export const PlayerFace = memo(function PlayerFace({ player, src, name, size = 24 }) {
  return <FaceBox key={src ?? player?.photo ?? ''} src={src ?? player?.photo} name={name ?? player?.short ?? player?.name} size={size} />;
});

// Met enkel een naam + clubcode (spelersdatabank, Verwachte XI's, Set Pieces, ...).
export const PlayerFaceByName = memo(function PlayerFaceByName({ name, clubCode, size = 24 }) {
  const { find } = usePlayerIndex();
  const hit = find(name, clubCode);
  return <FaceBox key={hit?.photo ?? 'none'} src={hit?.photo} name={name} size={size} />;
});

export default PlayerFace;
