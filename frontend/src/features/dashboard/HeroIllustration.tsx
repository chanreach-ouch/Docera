export function HeroIllustration() {
  return (
    <div className="hero-illustration-wrap" aria-hidden="true">
      <div className="hero-mint-glow" />
      <div className="paper-stack">
        {/* Back paper sheet */}
        <div className="paper-sheet paper-back">
          <div className="paper-line line-short" />
          <div className="paper-line line-full" />
          <div className="paper-line line-medium" />
          <div className="paper-line line-full" />
          <div className="paper-line line-short" />
        </div>

        {/* Front paper sheet */}
        <div className="paper-sheet paper-front">
          <div className="pdf-badge">PDF</div>
          <div className="paper-line line-medium mt-badge" />
          <div className="paper-line line-full" />
          <div className="paper-line line-full" />
          <div className="paper-line line-short" />
          <div className="paper-line line-medium" />
        </div>
      </div>
    </div>
  );
}
