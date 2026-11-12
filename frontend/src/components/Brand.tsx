import { Link } from 'react-router-dom';

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link to="/" className={`brand ${compact ? 'brand-compact' : ''}`} aria-label="Docera home">
    <svg width="30" height="32" viewBox="0 0 30 32" fill="none" aria-hidden="true">
      <path d="M5 5h12l8 8v14H5V5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M17 5v8h8M1 10v21h19M10 18h10M10 22h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg><span>docera<span className="brand-dot">.</span></span>
  </Link>;
}
