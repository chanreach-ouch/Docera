import { Check, Crown } from 'lucide-react';
import { Link } from 'react-router-dom';

export function PromoCard() {
  return (
    <div className="approved-promo-card">
      <div className="promo-header">
        <Crown size={20} className="promo-crown-icon" aria-hidden="true" />
        <h3 className="promo-title">Everything you need. Free with Docera.</h3>
      </div>
      <ul className="promo-bullets">
        <li>
          <Check size={16} className="promo-check-icon" aria-hidden="true" />
          <span>Professional PDF editing &amp; direct text typing</span>
        </li>
        <li>
          <Check size={16} className="promo-check-icon" aria-hidden="true" />
          <span>Full Khmer &amp; English Unicode support</span>
        </li>
        <li>
          <Check size={16} className="promo-check-icon" aria-hidden="true" />
          <span>100% private in-browser document processing</span>
        </li>
      </ul>
      <Link to="/#tools" className="approved-promo-btn">
        Explore All Tools
      </Link>
    </div>
  );
}
