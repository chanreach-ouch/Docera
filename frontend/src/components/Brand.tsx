import { Link } from 'react-router-dom';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className={`brand ${compact ? 'brand-compact' : ''}`} aria-label="Docera home">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true" className="brand-logo-icon">
        <rect width="28" height="28" rx="8" fill="#008F4F" />
        <path
          d="M8 17C8 12 12 8 18 8C18 13 14 17 8 17Z"
          fill="#FFFFFF"
        />
        <path
          d="M8.5 16.5C11 14 13.5 13 17 12.5"
          stroke="#008F4F"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      <span className="brand-name">Docera</span>
    </Link>
  );
}
