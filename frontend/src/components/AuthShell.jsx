import { ShieldCheck } from './Icons';

// Clean, professional centerpiece for the desktop branded panel: a white
// shield with a green checkmark inside it. Purely decorative (aria-hidden)
// — every screen already states its own purpose in real, accessible text.
function BrandIllustration() {
  return (
    <svg className="auth-brand-illustration-svg" viewBox="0 0 160 180" fill="none" aria-hidden="true">
      <path
        d="M80 6 L150 30 V86 C150 132 118 164 80 176 C42 164 10 132 10 86 V30 Z"
        fill="#ffffff"
      />
      <circle cx="80" cy="88" r="36" fill="#10b981" />
      <path d="M64 88 L75 99 L98 74" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

const TRUST_BADGES = ['ABN Verified', 'Work Email Confirmed', 'Trusted Employer'];

// Shared wrapper for every onboarding + authentication screen (onboarding
// slides, sign up selection, both signups, both logins, ABN verification,
// work email OTP). On mobile/tablet it's a no-op passthrough — the existing
// narrow single-column layout is untouched (the branded panel only renders
// at desktop widths). On desktop it splits into this branded left panel —
// fixed in place, full height, never scrolling — plus the screen's own
// content in an independently scrolling right column. See index.css's
// ".auth-shell" / ".auth-brand-panel" / ".auth-content-panel" rules.
export default function AuthShell({ children }) {
  return (
    <div className="auth-shell">
      <div className="auth-brand-panel">
        <div className="auth-brand-top">
          <ShieldCheck size={32} color="#ffffff" />
          <span className="auth-brand-name">ClearCall</span>
        </div>

        <div className="auth-brand-middle">
          <div className="auth-brand-illustration-stage">
            <div className="auth-brand-illustration-glow" aria-hidden="true" />
            <div className="auth-brand-illustration-spin">
              <BrandIllustration />
            </div>
          </div>
        </div>

        <div className="auth-brand-bottom">
          <div className="auth-brand-tagline">Know who is calling before you answer</div>
          <div className="auth-brand-badges">
            {TRUST_BADGES.map((label) => (
              <div key={label} className="auth-brand-badge">
                <span className="auth-brand-badge-check">✓</span> {label}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="auth-content-panel">
        {children}
      </div>
    </div>
  );
}
