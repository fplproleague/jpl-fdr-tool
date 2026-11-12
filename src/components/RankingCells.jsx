// Gedeelde cellen voor de ranglijsten (Bonuspunten, Kaarten), sinds de rework (spec §7.5–7.6) echte
// DataTable-rijen i.p.v. de vroegere RankingRow-kaartjes.
//
// RankingIdent: de sticky eerste kolom met [rang] [ster] [foto + naam]. De rang komt uit de volledige
// ranglijst (entry.rank, zie ranking.js) en wordt na filteren niet herberekend.
// ClubCell: clublogo + code als knop naar de clubkaart.
import PlayerCell from '../ui/PlayerCell';
import StarButton from '../ui/StarButton';
import { ClubLogo } from './SpelersParts';
import './RankingCells.css';

export function RankingIdent({ t, rank, name, clubCode, isPlayerWatched, toggleWatchlistPlayer }) {
  const watched = !!isPlayerWatched?.(name, clubCode);
  return (
    <span className="rk-ident">
      <span className="rk-rank num">{rank}</span>
      {toggleWatchlistPlayer && (
        <StarButton
          active={watched}
          onClick={() => toggleWatchlistPlayer({ name, teamCode: clubCode })}
          addLabel={t('watchlist.addAria', { name })}
          removeLabel={t('watchlist.removeAria', { name })}
        />
      )}
      <PlayerCell name={name} clubCode={clubCode} byName subDesktop={false} />
    </span>
  );
}

export function ClubCell({ t, clubCode, clubName, onOpenClub }) {
  if (!clubCode) return null;
  const content = <><ClubLogo code={clubCode} size={16} /><span>{clubCode}</span></>;
  if (!onOpenClub) return <span className="rk-club">{content}</span>;
  return (
    <button
      type="button"
      className="rk-club rk-club--btn"
      onClick={() => onOpenClub(clubCode)}
      aria-label={t('clubSheet.openAria', { club: clubName ?? clubCode })}
    >
      {content}
    </button>
  );
}
