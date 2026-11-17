// Skeletons (spec §5.11): blokjes in de vorm van de echte inhoud, zonder shimmer-animatie.
import './States.css';

export function Skeleton({ width = '100%', height = 12, style }) {
  return <span className="ui-skel" aria-hidden="true" style={{ width, height, ...style }} />;
}

export default function SkeletonRows({ rows = 8, label = 'Laden…' }) {
  return (
    <div className="ui-skel-rows" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="ui-skel-row">
          <Skeleton width={24} height={24} />
          <Skeleton width={`${30 + ((i * 17) % 35)}%`} height={10} />
          <Skeleton width={40} height={10} style={{ marginLeft: 'auto' }} />
        </div>
      ))}
    </div>
  );
}
