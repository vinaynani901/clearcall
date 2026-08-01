import { useNavigate } from 'react-router-dom';
import { StatusBar } from './Shared';

export default function OnboardingLayout({ step, illustration, headline, description, ctaLabel, ctaTo, skipTo }) {
  const navigate = useNavigate();
  return (
    <>
      <StatusBar />
      <div className="screen" style={{ justifyContent: 'space-between' }}>
        <div className="row-between">
          <div style={{ width: 36 }} />
          <button className="link small" onClick={() => navigate(skipTo || '/signup')}>Skip</button>
        </div>

        <div className="screen-centered" style={{ flex: 1 }}>
          {illustration}
          <h1 style={{ fontSize: 26, fontWeight: 800, marginTop: 28, marginBottom: 12, lineHeight: 1.25 }}>{headline}</h1>
          <p className="muted" style={{ fontSize: 15, lineHeight: 1.6, maxWidth: 340 }}>{description}</p>
        </div>

        <div>
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginBottom: 20 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{
                width: i === step ? 24 : 8,
                height: 8,
                borderRadius: 999,
                background: i === step ? 'var(--navy)' : 'var(--grey-200)',
                transition: 'all 0.2s ease',
              }} />
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => navigate(ctaTo)}>{ctaLabel}</button>
        </div>
      </div>
    </>
  );
}
